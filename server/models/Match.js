const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
    status: { type: String, enum: ['scheduled', 'live', 'completed'], default: 'scheduled' },
    tossWinner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    tossDecision: { type: String, enum: ['bat', 'bowl'] },
    innings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Innings' }],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    isTie: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);
