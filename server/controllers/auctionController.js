const Player = require('../models/Player');
const Auction = require('../models/Auction');
const Team = require('../models/Team');
const Room = require('../models/Room');
const { generateFixtures } = require('./leagueController');

const startAuction = async (roomId, io, isFirst = false) => {
    try {
        let auction = await Auction.findOne({ roomId });
        const teams = await Team.find({ roomId }).populate('squad');
        const room = await Room.findOne({ roomId });

        if (!auction) {
            auction = new Auction({ roomId, status: 'running' });
            // Load and shuffle all players
            const allPlayers = await Player.find({ status: 'available' });
            const shuffledPlayers = allPlayers.sort(() => Math.random() - 0.5);
            auction.auctionQueue = shuffledPlayers.map(p => p._id);
            await auction.save();
        }

        // Check if auction queue is empty
        if (auction.auctionQueue.length === 0) {
            return await endAuctionManually(roomId, io);
        }

        // Pick next player
        const nextPlayerId = auction.auctionQueue.shift();
        const nextPlayer = await Player.findById(nextPlayerId);

        const countdownSeconds = 60;
        auction.currentPlayer = nextPlayerId;
        auction.currentBid = nextPlayer.basePrice;
        auction.currentBidder = null;
        auction.timer = countdownSeconds;
        auction.timerEndsAt = new Date(Date.now() + countdownSeconds * 1000); // SET ABSOLUTE END TIME
        auction.status = 'running';
        auction.skipVotes = [];
        await auction.save();

        const populatedAuction = await Auction.findById(auction._id).populate('currentPlayer');

        if (isFirst) {
            io.to(roomId).emit('auction:start', { firstPlayer: nextPlayer, auction: populatedAuction });
        } else {
            io.to(roomId).emit('auction:newPlayer', { player: nextPlayer, auction: populatedAuction });
        }

        console.log(`[DEBUG] Emitted auction event for ${nextPlayer.name}`);
        runTimer(roomId, io);
    } catch (err) {
        console.error('[DEBUG] Start Auction Error:', err);
    }
};

const activeTimers = {}; // Global tracker for intervals
const resolvingRooms = new Set(); // To prevent double resolution

const runTimer = (roomId, io) => {
    if (activeTimers[roomId]) return;

    console.log(`[DEBUG] Starting stabilized timer for room ${roomId}`);
    let lastDbSync = Date.now();

    const interval = setInterval(async () => {
        try {
            const auction = await Auction.findOne({ roomId });

            if (!auction || auction.status !== 'running') {
                clearInterval(interval);
                delete activeTimers[roomId];
                return;
            }

            const now = Date.now();
            const totalRemainingMs = Math.max(0, auction.timerEndsAt.getTime() - now);
            const remainingSecs = Math.ceil(totalRemainingMs / 1000);

            io.to(roomId).emit('auction:timer', { timer: remainingSecs });

            // HEARTBEAT & DB SYNC: Update lastWatchdogTick to prove this timer is ALIVE
            if (now - lastDbSync > 2000 || remainingSecs === 0) {
                auction.timer = remainingSecs;
                auction.lastWatchdogTick = new Date();
                await auction.save();
                lastDbSync = now;
            }

            if (remainingSecs === 0 && auction.currentBidder) {
                clearInterval(interval);
                delete activeTimers[roomId];
                await resolveAuctionRound(roomId, io);
            }
        } catch (err) {
            console.error('[ERROR] Timer Interval Error:', err);
        }
    }, 1000);

    activeTimers[roomId] = interval;
};

const resolveAuctionRound = async (roomId, io) => {
    try {
        // ATOMIC LOCK: Move to 'resolving' state to prevent duplicate runs
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $set: {
                    status: 'resolving',
                    resolvingSince: new Date()
                }
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) return;

        console.log(`[DEBUG] Resolving round for ${roomId}...`);

        if (auction.currentBidder) {
            const player = await Player.findOneAndUpdate(
                { _id: auction.currentPlayer._id, status: 'available' },
                {
                    $set: {
                        status: 'sold',
                        soldTo: auction.currentBidder,
                        soldPrice: auction.currentBid
                    }
                },
                { new: true }
            );

            if (player) {
                const team = await Team.findOneAndUpdate(
                    { _id: auction.currentBidder },
                    {
                        $inc: { budget: -auction.currentBid },
                        $addToSet: { squad: player._id }
                    },
                    { new: true }
                ).populate('squad').populate('userId', 'username');

                io.to(roomId).emit('auction:sold', { player, team, price: auction.currentBid });
            }
        } else {
            // Unsold (via skip)
            const player = await Player.findOneAndUpdate(
                { _id: auction.currentPlayer._id, status: 'available' },
                { $set: { status: 'unsold' } },
                { new: true }
            );

            if (player) {
                await Auction.updateOne(
                    { roomId },
                    { $addToSet: { unsoldPlayers: player._id } }
                );
                io.to(roomId).emit('auction:unsold', { player });
            }
        }

        // Delay 3s then start next player
        setTimeout(() => {
            // Verify if still in resolving state before starting next
            startAuction(roomId, io).catch(err => {
                console.error(`[FATAL] Failed to start next auction player for ${roomId}:`, err);
            });
        }, 3000);

    } catch (err) {
        console.error('[CRITICAL] Resolve Round Error:', err);
    }
};

const handleSkipVote = async (roomId, userId, io) => {
    try {
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            { $addToSet: { skipVotes: userId } },
            { new: true }
        );

        if (!auction) return;

        const room = await Room.findOne({ roomId });
        const teamsCount = await Team.countDocuments({ roomId });
        const threshold = teamsCount > 0 ? teamsCount : (room.users?.length || 1);

        io.to(roomId).emit('auction:update', { auction });

        if (auction.skipVotes.length >= threshold) {
            console.log(`[DEBUG] Unanimous skip for room ${roomId}`);
            if (activeTimers[roomId]) {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
            }
            // Explicitly clear bidder and force 0 for resolve
            auction.currentBidder = null;
            auction.timer = 0;
            await auction.save();
            await resolveAuctionRound(roomId, io);
        }
    } catch (err) {
        console.error('[DEBUG] Skip Vote Error:', err);
    }
};

const endAuctionManually = async (roomId, io) => {
    try {
        const auction = await Auction.findOneAndUpdate({ roomId }, { $set: { status: 'completed' } }, { new: true });
        const room = await Room.findOne({ roomId });
        const teams = await Team.find({ roomId }).populate('squad');

        if (activeTimers[roomId]) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
        }

        io.to(roomId).emit('auction:end', { message: 'Auction finished!', teams, auction });
        io.to(roomId).emit('room:sync', { room, teams, auction });
    } catch (err) {
        console.error('[DEBUG] Manual End Error:', err);
    }
};

const resetAuction = async (roomId, io) => {
    try {
        await Player.updateMany({}, { $set: { status: 'available', soldTo: null, soldPrice: null } });
        await Team.updateMany({ roomId }, { $set: { budget: 1300000000, squad: [] } });
        await Auction.deleteOne({ roomId });
        const room = await Room.findOneAndUpdate({ roomId }, { $set: { status: 'waiting' } }, { new: true }).populate('users', 'username isGuest');

        if (activeTimers[roomId]) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
        }

        const teams = await Team.find({ roomId }).populate('userId', 'username');
        io.to(roomId).emit('room:sync', { room, teams, auction: null });
    } catch (err) {
        console.error('[DEBUG] Reset Error:', err);
    }
};

const resumeAuctionTimer = (roomId, io) => {
    runTimer(roomId, io);
};

// WATCHDOG: Aggressive monitoring of all phases
const startWatchdog = (io) => {
    console.log('[WATCHDOG] Monitoring active...');
    setInterval(async () => {
        try {
            const now = new Date();
            const auctions = await Auction.find({ status: { $in: ['running', 'resolving'] } });

            for (const auction of auctions) {
                // 1. STALLED TRANSITION CHECK
                if (auction.status === 'resolving') {
                    const stalledMs = now - (auction.resolvingSince || auction.updatedAt);
                    if (stalledMs > 10000) { // Stalled in 'resolving' for > 10s
                        console.log(`[WATCHDOG] Room ${auction.roomId} stalled in resolving. Forcing start...`);
                        await startAuction(auction.roomId, io);
                    }
                    continue;
                }

                // 2. DEAD INTERVAL CHECK (Status is 'running')
                if (auction.status === 'running') {
                    const isLocalActive = !!activeTimers[auction.roomId];
                    const lastHeartbeatMs = now - (auction.lastWatchdogTick || auction.updatedAt);

                    if (!isLocalActive || lastHeartbeatMs > 7000) {
                        console.log(`[WATCHDOG] Room ${auction.roomId} missing heartbeat (${lastHeartbeatMs}ms). Restarting...`);
                        // Ensure old interval is definitely dead
                        if (activeTimers[auction.roomId]) {
                            clearInterval(activeTimers[auction.roomId]);
                            delete activeTimers[auction.roomId];
                        }
                        runTimer(auction.roomId, io);
                    }
                }
            }
        } catch (err) {
            console.error('[WATCHDOG] Scan Error:', err);
        }
    }, 5000);
};

module.exports = {
    startAuction,
    endAuctionManually,
    resumeAuctionTimer,
    handleSkipVote,
    resetAuction,
    startWatchdog
};
