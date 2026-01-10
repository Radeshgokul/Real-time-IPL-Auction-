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
        auction.timer = 90; // Initial 90s
        auction.status = 'running';
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

const resumeAuctionTimer = (roomId, io) => {
    runTimer(roomId, io);
};

module.exports = { startAuction, endAuctionManually, resumeAuctionTimer };
