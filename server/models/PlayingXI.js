const mongoose = require('mongoose');

const PlayingXISchema = new mongoose.Schema({
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    isLocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('PlayingXI', PlayingXISchema);
