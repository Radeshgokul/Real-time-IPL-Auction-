const Player = require('../models/Player');
const Auction = require('../models/Auction');
const Team = require('../models/Team');
const Room = require('../models/Room');
const { generateFixtures } = require('./leagueController');

const startAuction = async (roomId, io, isFirst = false) => {
    try {
        // ATOMIC TRANSITION: Only start if waiting or resolving
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: { $in: ['waiting', 'resolving'] } },
            {
                $set: { status: 'running', lastEventAt: new Date() },
                $unset: { resolvingSince: "" }
            },
            { new: true }
        );

        if (!auction) {
            console.log(`[DEBUG] startAuction skipped: Already running or not found for ${roomId}`);
            return;
        }

        const teams = await Team.find({ roomId }).populate('squad');
        const room = await Room.findOne({ roomId });

        // Check if auction queue is empty
        if (auction.auctionQueue.length === 0) {
            return await endAuctionManually(roomId, io);
        }

        // Pick next player (Atomic-ish)
        const nextPlayerId = auction.auctionQueue.shift();
        const nextPlayer = await Player.findById(nextPlayerId);

        const countdownSeconds = 60;
        auction.currentPlayer = nextPlayerId;
        auction.currentBid = nextPlayer.basePrice;
        auction.currentBidder = null;
        auction.timer = countdownSeconds;
        auction.auctionEndAt = new Date(Date.now() + countdownSeconds * 1000);
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

const activeTimers = {};

const runTimer = (roomId, io) => {
    if (activeTimers[roomId]) {
        clearInterval(activeTimers[roomId]);
    }

    console.log(`[DEBUG] Starting authoritative timer for room ${roomId}`);
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
            const totalRemainingMs = auction.auctionEndAt.getTime() - now;
            const remainingSecs = Math.max(0, Math.ceil(totalRemainingMs / 1000));

            // Mandatory: Pulse state every second
            io.to(roomId).emit('auction:timer', {
                timer: remainingSecs,
                auctionEndAt: auction.auctionEndAt
            });

            // Update heartbeat
            if (now - lastDbSync > 2000 || remainingSecs === 0) {
                auction.timer = remainingSecs;
                auction.lastWatchdogTick = new Date();
                await auction.save();
                lastDbSync = now;
            }

            // Normal resolution trigger
            if (now >= auction.auctionEndAt.getTime() && auction.currentBidder) {
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
        // ATOMIC & IDEMPOTENT LOCK: Move to 'resolving' state
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $set: {
                    status: 'resolving',
                    resolvingSince: new Date(),
                    lastEventAt: new Date()
                }
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) {
            console.log(`[DEBUG] Resolve skipped: Round not running for ${roomId}`);
            return;
        }

        console.log(`[DEBUG] Resolving round for ${roomId}...`);

        if (auction.currentBidder) {
            // SOLD
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
            startAuction(roomId, io).catch(console.error);
        }, 3000);

    } catch (err) {
        console.error('[CRITICAL] Resolve Round Error:', err);
    }
};

const handleSkipVote = async (roomId, userId, io) => {
    try {
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $addToSet: { skipVotes: userId },
                $set: { lastEventAt: new Date() }
            },
            { new: true }
        );

        if (!auction) return;

        const room = await Room.findOne({ roomId });
        const teamsCount = await Team.countDocuments({ roomId });
        const threshold = teamsCount > 0 ? teamsCount : (room.users?.length || 1);

        io.to(roomId).emit('auction:update', { auction });

        if (auction.skipVotes.length >= threshold) {
            if (activeTimers[roomId]) {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
            }
            auction.currentBidder = null;
            auction.timer = 0;
            auction.auctionEndAt = new Date();
            await auction.save();
            await resolveAuctionRound(roomId, io);
        }
    } catch (err) {
        console.error('[DEBUG] Skip Vote Error:', err);
    }
};

const endAuctionManually = async (roomId, io) => {
    try {
        const auction = await Auction.findOneAndUpdate({ roomId }, { $set: { status: 'completed', lastEventAt: new Date() } }, { new: true });
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

// MANDATORY WATCHDOG: Force-resolve and Force-recover
const startWatchdog = (io) => {
    console.log('[WATCHDOG] Mandatory protection layer active.');
    setInterval(async () => {
        try {
            const now = new Date();
            const auctions = await Auction.find({ status: { $in: ['running', 'resolving'] } });

            for (const auction of auctions) {
                // 1. STALLED RESOLUTION CHECK
                if (auction.status === 'resolving') {
                    const stalledMs = now - (auction.resolvingSince || auction.updatedAt);
                    if (stalledMs > 8000) {
                        console.log(`[WATCHDOG] Force-starting next player for room ${auction.roomId}`);
                        await startAuction(auction.roomId, io);
                    }
                    continue;
                }

                // 2. FORCE RESOLUTION CHECK (Time exceeded buffer)
                if (auction.status === 'running') {
                    const timeExceeded = now.getTime() > (auction.auctionEndAt.getTime() + 2000);
                    if (timeExceeded && auction.currentBidder) {
                        console.log(`[WATCHDOG] Force-resolving expired round for room ${auction.roomId}`);
                        await resolveAuctionRound(auction.roomId, io);
                        continue;
                    }

                    // 3. DEAD INTERVAL CHECK
                    const isLocalActive = !!activeTimers[auction.roomId];
                    const lastHeartbeatMs = now - (auction.lastWatchdogTick || auction.updatedAt);
                    if (!isLocalActive || lastHeartbeatMs > 7000) {
                        console.log(`[WATCHDOG] Restarting dead interval for room ${auction.roomId}`);
                        runTimer(auction.roomId, io);
                    }
                }

                // 4. FINAL SAFETY FALLBACK: Total deadlock break
                const deadMs = now - (auction.lastEventAt || auction.updatedAt);
                if (deadMs > 60000) {
                    console.log(`[WATCHDOG] Global deadlock break for room ${auction.roomId}`);
                    await startAuction(auction.roomId, io);
                }
            }
        } catch (err) {
            console.error('[WATCHDOG] Critical Scan Error:', err);
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
