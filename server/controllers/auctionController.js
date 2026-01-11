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

        auction.currentPlayer = nextPlayerId;
        auction.currentBid = nextPlayer.basePrice;
        auction.currentBidder = null;
        auction.timer = 60; // Initial 60s
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

const runTimer = (roomId, io) => {
    // Prevent multiple timers for the same room
    if (activeTimers[roomId]) {
        console.log(`[DEBUG] Timer already running for room ${roomId}`);
        return;
    }

    console.log(`[DEBUG] Starting timer for room ${roomId}`);
    const interval = setInterval(async () => {
        try {
            const auction = await Auction.findOne({ roomId }).populate('currentPlayer');

            // If auction is missing or not running, stop timer
            if (!auction || auction.status !== 'running') {
                clearInterval(interval);
                delete activeTimers[roomId];
                return;
            }

            if (auction.timer > 0) {
                auction.timer -= 1;
                await auction.save();
                io.to(roomId).emit('auction:timer', { timer: auction.timer });
            } else {
                clearInterval(interval);
                delete activeTimers[roomId];
                resolveAuctionRound(roomId, io);
            }
        } catch (err) {
            console.error('Timer Error:', err);
            clearInterval(interval);
            delete activeTimers[roomId];
        }
    }, 1000);

    activeTimers[roomId] = interval;
};

const resolveAuctionRound = async (roomId, io) => {
    try {
        const auction = await Auction.findOne({ roomId }).populate('currentPlayer');
        if (!auction) return;

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

        setTimeout(() => startAuction(roomId, io), 3000);
    } catch (err) {
        console.error('Resolve Round Error:', err);
    }
};

const handleSkipVote = async (roomId, userId, io) => {
    try {
        const auction = await Auction.findOne({ roomId }).populate('currentPlayer');
        const room = await Room.findOne({ roomId }); // To count total users

        if (!auction || auction.status !== 'running') return;

        // Add vote if not already voted
        if (!auction.skipVotes.includes(userId)) {
            auction.skipVotes.push(userId);
            await auction.save();
        }

        // Get count of ACTIVE teams (users who have picked a team)
        const teamsCount = await Team.countDocuments({ roomId });

        // Use teams count as the threshold because only team owners essentially "play"
        // If necessary, we can use room.users.length, but teams is safer for active gameplay
        const threshold = teamsCount > 0 ? teamsCount : room.users.length;

        console.log(`[DEBUG] Skip Vote: ${auction.skipVotes.length}/${threshold} for Room ${roomId}`);

        io.to(roomId).emit('auction:update', { auction });

        if (auction.skipVotes.length >= threshold) {
            console.log(`[DEBUG] Unanimous skip for room ${roomId}. Marking unsold.`);

            // Clear existing timer
            if (activeTimers[roomId]) {
                clearInterval(activeTimers[roomId]);
                delete activeTimers[roomId];
            }

            // Force timer to 0 to be safe (visual)
            auction.timer = 0;
            await auction.save();

            // Trigger resolution (UNSOLD)
            // Ensure no bidder is set so it resolves as unsold
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

        io.to(roomId).emit('auction:end', { message: 'Auction finished!', teams, auction });
        io.to(roomId).emit('room:sync', { room, teams, auction });
        console.log(`[DEBUG] Auction manually ended for Room ${roomId}`);
    } catch (err) {
        console.error('[DEBUG] Manual End Error:', err);
    }
};

const resetAuction = async (roomId, io) => {
    try {
        console.log(`[DEBUG] Resetting auction for Room ${roomId}`);

        // 1. Reset Global Players (Assuming single tenant for now or shared pool)
        await Player.updateMany({}, {
            status: 'available',
            soldTo: null,
            soldPrice: null
        });

        // 2. Reset Teams in this Room
        await Team.updateMany({ roomId }, {
            budget: 1300000000,
            squad: []
        });

        // 3. Delete Auction State
        await Auction.deleteOne({ roomId });

        // 4. Reset Room Status
        const room = await Room.findOneAndUpdate(
            { roomId },
            { status: 'waiting' },
            { new: true }
        ).populate('users', 'username isGuest');

        // 5. Clear any active timers
        if (activeTimers[roomId]) {
            clearInterval(activeTimers[roomId]);
            delete activeTimers[roomId];
        }

        // 6. Sync Clients back to Lobby
        const teams = await Team.find({ roomId }).populate('userId', 'username');
        io.to(roomId).emit('room:sync', { room, teams, auction: null });

        console.log(`[DEBUG] Room ${roomId} reset to waiting.`);
    } catch (err) {
        console.error('[DEBUG] Reset Error:', err);
    }
};

const resumeAuctionTimer = (roomId, io) => {
    runTimer(roomId, io);
};

module.exports = { startAuction, endAuctionManually, resumeAuctionTimer, handleSkipVote, resetAuction };
