const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    playerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['Batter', 'Bowler', 'All-Rounder', 'WK-Batter'], required: true },
    basePrice: { type: Number, required: true },
    status: { type: String, enum: ['available', 'sold', 'unsold'], default: 'available' },
    soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    soldPrice: { type: Number, default: null },
    stats: {
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        matches: { type: Number, default: 0 }
    }
});

module.exports = mongoose.model('Player', PlayerSchema);
