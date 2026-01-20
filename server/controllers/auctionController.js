const Player = require('../models/Player');
const Auction = require('../models/Auction');
const Team = require('../models/Team');
const Room = require('../models/Room');
const { generateFixtures } = require('./leagueController');

const startAuction = async (roomId, io, isFirst = false) => {
    try {
        console.log(`[DEBUG] startAuction called for ${roomId} (isFirst: ${isFirst})`);

        // 1. ATOMIC TRANSITION/UPSERT
        // We try to find and update, but if it doesn't exist, we create it.
        // Using findOneAndUpdate with upsert ensures only ONE document is ever created per roomId.
        let auction = await Auction.findOneAndUpdate(
            { roomId },
            {
                $setOnInsert: {
                    status: 'waiting',
                    auctionQueue: [],
                    unsoldPlayers: [],
                    skipVotes: [],
                    lastEventAt: new Date()
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // 2. ATOMIC STATUS MOVE: Only proceed if transition is valid
        // This prevents two simultaneous calls from both trying to pick a player.
        auction = await Auction.findOneAndUpdate(
            { roomId, status: { $in: ['waiting', 'resolving'] } },
            {
                $set: { status: 'running', lastEventAt: new Date() },
                $unset: { resolvingSince: "" }
            },
            { new: true }
        );

        if (!auction) {
            console.log(`[DEBUG] startAuction skipped: Already running or not eligible for ${roomId}`);
            return;
        }

        // 3. INITIALIZATION/REFILL DATA (if queue is empty)
        if (auction.auctionQueue.length === 0) {
            // Find players that are available OR were previously unsold
            const allPlayers = await Player.find({ status: { $in: ['available', 'unsold'] } });
            if (allPlayers.length > 0) {
                console.log(`[DEBUG] Initializing player queue for room ${roomId}`);
                const shuffledIds = allPlayers.sort(() => Math.random() - 0.5).map(p => p._id);
                auction = await Auction.findOneAndUpdate(
                    { roomId },
                    { $set: { auctionQueue: shuffledIds } },
                    { new: true }
                );
            }
        }

        // 4. CHECK END CONDITION
        if (auction.auctionQueue.length === 0) {
            console.log(`[DEBUG] Queue empty for ${roomId}, ending auction.`);
            return await endAuctionManually(roomId, io);
        }

        // 5. ATOMIC PLAYER PICK: Shift the queue and set active player
        // We use $pop and $set to make it as atomic as possible
        const nextPlayerId = auction.auctionQueue[0];
        const nextPlayer = await Player.findById(nextPlayerId);

        const countdownSeconds = 60;
        const endTime = new Date(Date.now() + countdownSeconds * 1000);

        auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $set: {
                    currentPlayer: nextPlayerId,
                    currentBid: nextPlayer.basePrice,
                    currentBidder: null,
                    timer: countdownSeconds,
                    auctionEndAt: endTime,
                    skipVotes: []
                },
                $pop: { auctionQueue: -1 } // Remove the first element
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) return;

        if (isFirst) {
            io.to(roomId).emit('auction:start', { firstPlayer: nextPlayer, auction });
        } else {
            io.to(roomId).emit('auction:newPlayer', { player: nextPlayer, auction });
        }

        console.log(`[DEBUG] Started round for ${nextPlayer.name} in room ${roomId}`);
        runTimer(roomId, io);
    } catch (err) {
        console.error('[DEBUG] Start Auction Error:', err);
    }
};

const restartCurrentPlayer = async (roomId, io) => {
    try {
        console.log(`[DEBUG] Manual Restart requested for room ${roomId}`);

        // 1. Clear any active interval immediately to prevent collisions
        if (activeTimers[roomId]) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
        }

        // 2. Atomic update to reset the round
        const countdownSeconds = 60;
        const endTime = new Date(Date.now() + countdownSeconds * 1000);

        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $set: {
                    timer: countdownSeconds,
                    auctionEndAt: endTime,
                    skipVotes: [],
                    lastEventAt: new Date()
                }
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) return;

        // 3. Re-emit state to all clients
        io.to(roomId).emit('auction:update', { auction });
        io.to(roomId).emit('auction:timer', {
            timer: countdownSeconds,
            auctionEndAt: endTime
        });

        console.log(`[DEBUG] Restarted round for ${auction.currentPlayer?.name} in room ${roomId}`);

        // 4. Start the server-side authoritative ticker
        runTimer(roomId, io);
    } catch (err) {
        console.error('[DEBUG] Restart Current Player Error:', err);
    }
};

const activeTimers = {};
const roomStates = {}; // In-memory cache for room-specific auction state (e.g. last broadcasted time)

const runTimer = (roomId, io) => {
    if (activeTimers[roomId]) {
        clearInterval(activeTimers[roomId]);
    }

    console.log(`[DEBUG] Starting authoritative timer for room ${roomId}`);

    // Pulse once immediately to ensure clients are synced
    const pulseTimer = async () => {
        try {
            const auction = await Auction.findOne({ roomId });
            if (!auction || auction.status !== 'running') {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
                return;
            }

            const now = Date.now();
            const totalRemainingMs = auction.auctionEndAt.getTime() - now;
            const remainingSecs = Math.max(0, Math.ceil(totalRemainingMs / 1000));

            // Pulse to clients
            io.to(roomId).emit('auction:timer', {
                timer: remainingSecs,
                auctionEndAt: auction.auctionEndAt
            });

            // Trigger resolution if time is up
            if (now >= auction.auctionEndAt.getTime()) {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
                console.log(`[DEBUG] Time expired for room ${roomId}. Resolving...`);
                await resolveAuctionRound(roomId, io);
                return;
            }

            // Pulse DB heartbeat every 5 seconds or if it just started
            if (!auction.lastWatchdogTick || now - auction.lastWatchdogTick.getTime() > 5000) {
                await Auction.updateOne({ roomId }, {
                    $set: {
                        timer: remainingSecs,
                        lastWatchdogTick: new Date()
                    }
                });
            }
        } catch (err) {
            console.error('[ERROR] Timer Pulsing Error:', err);
        }
    };

    activeTimers[roomId] = setInterval(pulseTimer, 1000);
    pulseTimer(); // Immediate first pulse
};

const resolveAuctionRound = async (roomId, io) => {
    try {
        // ATOMIC & IDEMPOTENT LOCK: Move to 'resolving' state
        const auction = await Auction.findOneAndUpdate(
            { roomId, status: 'running' },
            {
                $set: {
                    status: 'resolving',
                    timer: 0, // Reset timer visually
                    resolvingSince: new Date(),
                    lastEventAt: new Date()
                }
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) {
            console.log(`[DEBUG] Resolve skipped: Round not running or already resolving for ${roomId}`);
            return;
        }

        console.log(`[DEBUG] Resolving round for ${roomId}...`);

        if (auction.currentBidder) {
            // SOLD
            const player = await Player.findOneAndUpdate(
                { _id: auction.currentPlayer._id, status: { $ne: 'sold' } },
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
                { _id: auction.currentPlayer._id, status: { $ne: 'sold' } },
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
                    // PHASE 3: INITIALIZATION GUARD
                    if (!auction.currentPlayer) {
                        const loadingMs = now - auction.updatedAt;
                        if (loadingMs > 5000) {
                            console.log(`[WATCHDOG] Room ${auction.roomId} STUCK in initialization. Forcing start...`);
                            await startAuction(auction.roomId, io);
                        }
                        continue;
                    }

                    const timeExceeded = now.getTime() > (auction.auctionEndAt.getTime() + 3000);
                    if (timeExceeded) {
                        console.log(`[WATCHDOG] Force-resolving expired round for room ${auction.roomId} (Expired for ${now.getTime() - auction.auctionEndAt.getTime()}ms)`);
                        await resolveAuctionRound(auction.roomId, io);
                        continue;
                    }

                    // 4. DEAD INTERVAL CHECK
                    const isLocalActive = !!activeTimers[auction.roomId];
                    const lastHeartbeatMs = now - (auction.lastWatchdogTick || auction.updatedAt);
                    if (!isLocalActive || lastHeartbeatMs > 10000) {
                        console.log(`[WATCHDOG] Restarting dead interval for room ${auction.roomId} (LocalActive: ${isLocalActive}, LastPulse: ${lastHeartbeatMs}ms ago)`);
                        runTimer(auction.roomId, io);
                    }
                }

                // 5. GLOBAL DEADLOCK BREAK
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

const emergencyRestartPlayer = async (roomId, io) => {
    try {
        console.log(`[DEBUG] EMERGENCY Restart requested for room ${roomId}`);

        // 1. Clear any active interval immediately
        if (activeTimers[roomId]) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
        }

        // 2. Force Room Unlock
        await Room.updateOne({ roomId }, { $set: { isLocked: false } });

        // 3. Atomic hard-reset of the auction round
        const countdownSeconds = 60;
        const endTime = new Date(Date.now() + countdownSeconds * 1000);

        const auction = await Auction.findOneAndUpdate(
            { roomId },
            {
                $set: {
                    status: 'running',
                    timer: countdownSeconds,
                    auctionEndAt: endTime,
                    skipVotes: [],
                    lastEventAt: new Date(),
                    lastWatchdogTick: new Date(),
                },
                $unset: { resolvingSince: "" }
            },
            { new: true }
        ).populate('currentPlayer');

        if (!auction) {
            console.log(`[DEBUG] Emergency Restart: No auction state found for ${roomId}`);
            return;
        }

        // 4. Re-emit state to all clients
        io.to(roomId).emit('auction:update', { auction });
        io.to(roomId).emit('auction:timer', {
            timer: countdownSeconds,
            auctionEndAt: endTime
        });

        console.log(`[DEBUG] EMERGENCY Restarted round for ${auction.currentPlayer?.name} in room ${roomId}`);

        // 5. Start the server-side authoritative ticker
        runTimer(roomId, io);
    } catch (err) {
        console.error('[DEBUG] Emergency Restart Error:', err);
    }
};

module.exports = {
    startAuction,
    endAuctionManually,
    resumeAuctionTimer,
    handleSkipVote,
    resetAuction,
    startWatchdog,
    restartCurrentPlayer,
    emergencyRestartPlayer
};
