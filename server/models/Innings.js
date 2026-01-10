const mongoose = require('mongoose');

const InningsSchema = new mongoose.Schema({
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
    battingTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    bowlingTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    balls: [{
        over: Number,
        ball: Number,
        batsman: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        bowler: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        runs: Number,
        isWicket: Boolean,
        batValue: Number,
        bowlValue: Number
    }]
}, { timestamps: true });

module.exports = mongoose.model('Innings', InningsSchema);
