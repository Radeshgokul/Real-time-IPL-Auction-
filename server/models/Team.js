const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true }, // IPL Team Name (CSK, MI, etc.)
    budget: { type: Number, default: 1300000000 }, // ₹130 Crores
    squad: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
    isLocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Team', TeamSchema);
