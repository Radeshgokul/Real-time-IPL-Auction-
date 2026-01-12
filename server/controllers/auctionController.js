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
                console.log(`[DEBUG] Stop timer for room ${roomId}: status=${auction?.status}`);
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
                console.log(`[DEBUG] Time Up for room ${roomId}. Resolving...`);
                clearInterval(interval);
                delete activeTimers[roomId];

                if (!resolvingRooms.has(roomId)) {
                    resolvingRooms.add(roomId);
                    await resolveAuctionRound(roomId, io);
                    resolvingRooms.delete(roomId);
                }
            }
        } catch (err) {
            console.error('[ERROR] Timer Loop Error:', err);
            // Self-healing: Watchdog will catch it if it dies, 
            // but we keep the interval alive for transient DB errors.
        }
    }, 1000);

    activeTimers[roomId] = interval;
};

const resolveAuctionRound = async (roomId, io) => {
    try {
        const auction = await Auction.findOne({ roomId }).populate('currentPlayer');
        if (!auction) return;

        console.log(`[DEBUG] Resolving round for ${roomId}, Bidder: ${auction.currentBidder}`);

        if (auction.currentBidder) {
            // SOLD
            const player = await Player.findById(auction.currentPlayer);
            player.status = 'sold';
            player.soldTo = auction.currentBidder;
            player.soldPrice = auction.currentBid;
            await player.save();

            const team = await Team.findById(auction.currentBidder);
            team.budget -= auction.currentBid;
            team.squad.push(player._id);
            await team.save();

            const populatedTeam = await Team.findById(team._id).populate('squad');

            io.to(roomId).emit('auction:sold', { player, team: populatedTeam, price: auction.currentBid });
        } else {
            // UNSOLD
            const player = await Player.findById(auction.currentPlayer);
            player.status = 'unsold';
            await player.save();

            auction.unsoldPlayers.push(player._id);
            io.to(roomId).emit('auction:unsold', { player });
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
        const auction = await Auction.findOne({ roomId }).populate('currentPlayer');
        const room = await Room.findOne({ roomId });

        if (!auction || auction.status !== 'running') return;

        if (!auction.skipVotes.includes(userId)) {
            auction.skipVotes.push(userId);
            await auction.save();
        }

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

            auction.timer = 0;
            auction.timerEndsAt = new Date(); // Force expiry
            auction.currentBidder = null;
            await auction.save();

            if (!resolvingRooms.has(roomId)) {
                resolvingRooms.add(roomId);
                await resolveAuctionRound(roomId, io);
                resolvingRooms.delete(roomId);
            }
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
