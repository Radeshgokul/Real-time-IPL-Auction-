const mongoose = require('mongoose');
require('dotenv').config();
const Player = require('./models/Player');

const checkPlayers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl_auction_db');
        console.log('Connected to DB');

        const totalPlayers = await Player.countDocuments();
        const availablePlayers = await Player.countDocuments({ status: 'available' });
        const soldPlayers = await Player.countDocuments({ status: 'sold' });
        const unsoldPlayers = await Player.countDocuments({ status: 'unsold' });

        console.log(`Total Players: ${totalPlayers}`);
        console.log(`Available: ${availablePlayers}`);
        console.log(`Sold: ${soldPlayers}`);
        console.log(`Unsold: ${unsoldPlayers}`);

        if (totalPlayers === 0) {
            console.log('NO PLAYERS FOUND. SEEDING REQUIRED.');
        } else if (availablePlayers === 0) {
            console.log('ALL PLAYERS PROCESSED. RESET REQUIRED.');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkPlayers();
