require('dotenv').config();
// Deployment Pulse: Hardened Initialization + Manual Recovery V1.2
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// DB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl-auction-game')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Socket.IO Logic
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// RECOVERY & WATCHDOG
const { resumeAuctionTimer, startWatchdog } = require('./controllers/auctionController');
const Auction = require('./models/Auction');

// Wait for DB, then recover
mongoose.connection.once('open', async () => {
    try {
        // Start the self-healing watchdog
        startWatchdog(io);

        const runningAuctions = await Auction.find({ status: 'running' });
        if (runningAuctions.length > 0) {
            console.log(`[RECOVERY] Found ${runningAuctions.length} interrupted auctions. Resuming timers...`);
            runningAuctions.forEach(auction => {
                resumeAuctionTimer(auction.roomId, io);
            });
        }
    } catch (err) {
        console.error('[RECOVERY] Failed to resume auctions:', err);
    }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
