const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    currentPlayer: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    status: { type: String, enum: ['waiting', 'running', 'completed'], default: 'waiting' },
    currentBid: { type: Number, default: 0 },
    currentBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    timer: { type: Number, default: 90 },
    timerEndsAt: { type: Date }, // NEW: Absolute end time for self-healing
    auctionQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    unsoldPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    skipVotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Auction', AuctionSchema);
