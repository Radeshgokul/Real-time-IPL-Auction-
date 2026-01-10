const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const auth = require('../middleware/auth');

// Create Room
router.post('/create', auth, async (req, res) => {
    try {
        const { maxTeams } = req.body;
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

        const room = new Room({
            roomId,
            host: req.user.id,
            maxTeams,
            users: [req.user.id]
        });

        await room.save();
        res.json(room);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Join Room
router.post('/join', auth, async (req, res) => {
    try {
        const { roomId } = req.body;
        const room = await Room.findOne({ roomId });

        if (!room) return res.status(404).json({ message: 'Room not found' });
        if (room.users.length >= room.maxTeams) return res.status(400).json({ message: 'Room full' });
        if (room.isLocked) return res.status(400).json({ message: 'Room locked' });

        if (!room.users.includes(req.user.id)) {
            room.users.push(req.user.id);
            await room.save();
        }

        res.json(room);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
