const mongoose = require('mongoose');

const PointsTableSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    tie: { type: Number, default: 0 },
    points: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('PointsTable', PointsTableSchema);
