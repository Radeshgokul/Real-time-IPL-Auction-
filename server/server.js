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
const DEFAULT_MONGO_URI = 'mongodb+srv://ipl_auction_app:ipl_auction_12345@cluster0.o5hpx.mongodb.net/ipl_auction_db?retryWrites=true&w=majority';
const MONGO_URI = process.env.MONGODB_URI || DEFAULT_MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Socket.IO Logic
const socketHandler = require('./socket/socketHandler');
socketHandler(io);

// RECOVERY, AUTO-SEED & WATCHDOG
const { resumeAuctionTimer, startWatchdog } = require('./controllers/auctionController');
const Auction = require('./models/Auction');
const Player = require('./models/Player');
const { seedPlayers } = require('./seedPlayers');

// Wait for DB, then recover and auto-seed if needed
mongoose.connection.once('open', async () => {
    try {
        // Auto-seed players if empty
        const playerCount = await Player.countDocuments();
        if (playerCount === 0) {
            console.log('[AUTO-SEED] Player collection is empty. Seeding 150+ players...');
            await seedPlayers();
        } else {
            console.log(`[AUTO-SEED] Database already has ${playerCount} players.`);
        }

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
        console.error('[RECOVERY/AUTO-SEED] Initialization Error:', err);
    }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
