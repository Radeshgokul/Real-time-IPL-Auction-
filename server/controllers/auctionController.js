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
    // Prevent multiple timers for the same room
    if (activeTimers[roomId]) {
        return;
    }

    console.log(`[DEBUG] Starting self-healing timer for room ${roomId}`);

    // Initial Sync
    let lastDbSync = Date.now();

    const interval = setInterval(async () => {
        try {
            const auction = await Auction.findOne({ roomId });

            if (!auction || auction.status !== 'running') {
                clearInterval(interval);
                delete activeTimers[roomId];
                return;
            }

            // Calculate remaining time based on absolute timestamp
            const now = Date.now();
            const totalRemainingMs = Math.max(0, auction.timerEndsAt.getTime() - now);
            const remainingSecs = Math.ceil(totalRemainingMs / 1000);

            // Emit to clients (high frequency)
            io.to(roomId).emit('auction:timer', { timer: remainingSecs });

            // Sync back to DB occasionally (lower frequency to reduce load)
            if (now - lastDbSync > 3000 || remainingSecs === 0) {
                auction.timer = remainingSecs;
                await auction.save();
                lastDbSync = now;
            }

            if (remainingSecs === 0) {
                // Check if someone has bid
                if (auction.currentBidder) {
                    console.log(`[DEBUG] Time Up with Bidder for room ${roomId}. Resolving SOLD...`);
                    clearInterval(interval);
                    delete activeTimers[roomId];
                    await resolveAuctionRound(roomId, io);
                } else {
                    // NO BIDDER: Wait indefinitely as requested by user.
                    // The auction status remains 'running', timer visual stays 0.
                }
            }
        } catch (err) {
            console.error('[ERROR] Timer Loop Error:', err);
        }
    }, 1000);

    activeTimers[roomId] = interval;
};

const resolveAuctionRound = async (roomId, io) => {
    try {
        // ATOMIC LOCK: Change status to 'waiting' to ensure only one process resolves this round
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            { $set: { status: 'waiting' } },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) return;

        console.log(`[DEBUG] Resolving round for ${roomId}, Bidder: ${auction.currentBidder}`);

        if (auction.currentBidder) {
            // SOLD: Atomic update to ensure player isn't sold twice
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
                        $addToSet: { squad: player._id } // Atomic duplicate prevention
                    },
                    { new: true }
                ).populate('squad').populate('userId', 'username');

                io.to(roomId).emit('auction:sold', { player, team, price: auction.currentBid });
            }
        } else {
            // UNSOLD (only via skip vote)
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

        await auction.save();

        // Delay before next player starts
        setTimeout(() => startAuction(roomId, io), 3000);
    } catch (err) {
        console.error('Resolve Round Error:', err);
    }
};

const handleSkipVote = async (roomId, userId, io) => {
    try {
        // Atomic vote registration
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            { $addToSet: { skipVotes: userId } },
            { new: true }
        );

        if (!auction) return;

        const room = await Room.findOne({ roomId });
        const teamsCount = await Team.countDocuments({ roomId });
        const threshold = teamsCount > 0 ? teamsCount : (room.users?.length || 1);

        console.log(`[DEBUG] Skip Vote: ${auction.skipVotes.length}/${threshold} for Room ${roomId}`);

        io.to(roomId).emit('auction:update', { auction });

        if (auction.skipVotes.length >= threshold) {
            console.log(`[DEBUG] Unanimous skip for room ${roomId}. Marking unsold.`);

            if (activeTimers[roomId]) {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
            }

            // Force auction state for resolution as UNSOLD
            auction.timer = 0;
            auction.currentBidder = null;
            await auction.save();

            await resolveAuctionRound(roomId, io);
        }
    } catch (err) {
        console.error('[DEBUG] Skip Vote Error:', err);
    }
};

const endAuctionManually = async (roomId, io) => {
    try {
        const auction = await Auction.findOne({ roomId });
        const room = await Room.findOne({ roomId });
        const teams = await Team.find({ roomId }).populate('squad');

        if (!auction || !room) return;

        auction.status = 'completed';
        await auction.save();

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
        console.log(`[DEBUG] Resetting auction for Room ${roomId}`);

        await Player.updateMany({}, {
            status: 'available',
            soldTo: null,
            soldPrice: null
        });

        await Team.updateMany({ roomId }, {
            budget: 1300000000,
            squad: []
        });

        await Auction.deleteOne({ roomId });

        const room = await Room.findOneAndUpdate(
            { roomId },
            { status: 'waiting' },
            { new: true }
        ).populate('users', 'username isGuest');

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

// WATCHDOG: Periodically check and restart stuck timers
const startWatchdog = (io) => {
    console.log('[WATCHDOG] Initialized');
    setInterval(async () => {
        try {
            const runningAuctions = await Auction.find({ status: 'running' });
            runningAuctions.forEach(auction => {
                if (!activeTimers[auction.roomId]) {
                    console.log(`[WATCHDOG] Found stuck auction ${auction.roomId}. Restarting timer...`);
                    runTimer(auction.roomId, io);
                }
            });
        } catch (err) {
            console.error('[WATCHDOG] Error:', err);
        }
    }, 5000); // Check every 5 seconds
};

module.exports = {
    startAuction,
    endAuctionManually,
    resumeAuctionTimer,
    handleSkipVote,
    resetAuction,
    startWatchdog
};
