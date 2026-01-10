const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    maxTeams: { type: Number, required: true, min: 2, max: 10 },
    status: {
        type: String,
        enum: ['waiting', 'team_selection', 'auction', 'playing_xi', 'match', 'league_over'],
        default: 'waiting'
    },
    currentSeason: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isLocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
