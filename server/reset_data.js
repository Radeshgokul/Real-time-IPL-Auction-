const mongoose = require('mongoose');
require('dotenv').config();
const Player = require('./models/Player');
const Team = require('./models/Team');
const Auction = require('./models/Auction');
const Room = require('./models/Room');

const resetData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl_auction_db');
        console.log('Connected to DB');

        // 1. Reset Players
        await Player.updateMany({}, {
            status: 'available',
            soldTo: null,
            soldPrice: null
        });
        console.log('Players reset to available.');

        // 2. Clear Teams
        // We can either delete teams or just reset them. 
        // If we delete teams, users have to rejoin. This might be better for a full clean slate.
        // But maybe the user wants to keep the room.
        // Let's just reset stats for now so the current room might work if simple reload.
        // Actually, to be safe, let's keep teams but clear their squad/budget.
        await Team.updateMany({}, {
            budget: 1300000000, // 130cr (check default in model) - Model says 1300000000
            squad: [],
            isLocked: false
        });
        console.log('Teams reset.');

        // 3. Delete Auctions
        await Auction.deleteMany({});
        console.log('Auctions deleted.');

        // 4. Reset Rooms to waiting (optional, maybe dangerous if users are in them)
        // If we reset room to 'waiting', the frontend will show the lobby.
        // If the user is on the "Playing XI" screen, they might glitch if room status changes underneath?
        // Actually, if we delete the auction, the current room status needing 'auction' might crash if it looks for it.
        // Let's set rooms to 'waiting' so they fall back to lobby.
        await Room.updateMany({}, {
            status: 'waiting'
        });
        console.log('Rooms reset to waiting.');

        console.log('*** DATA RESET COMPLETE ***');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

resetData();
