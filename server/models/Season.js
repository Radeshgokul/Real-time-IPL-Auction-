const mongoose = require('mongoose');

const SeasonSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    seasonNumber: { type: Number, default: 1 },
    status: { type: String, enum: ['auction', 'league', 'playoffs', 'completed'], default: 'auction' },
    champion: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    pointsTable: [{
        team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
        played: { type: Number, default: 0 },
        won: { type: Number, default: 0 },
        lost: { type: Number, default: 0 },
        tie: { type: Number, default: 0 },
        points: { type: Number, default: 0 }
    }],
    history: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('Season', SeasonSchema);
