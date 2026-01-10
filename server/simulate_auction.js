const io = require('socket.io-client');
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runSimulation() {
    try {
        console.log('--- STARTING IPL AUCTION SIMULATION ---');

        // 1. Create User 1 (Host)
        const hostUser = { username: `AgentHost_${Date.now()}`, email: `agent_host_${Date.now()}@test.com`, password: 'password123' };
        console.log(`[AGENT] Creating Host: ${hostUser.username}...`);
        const hostRes = await axios.post(`${API_URL}/auth/register`, hostUser);
        const hostToken = hostRes.data.token;
        const hostId = hostRes.data.user.id;
        console.log('[AGENT] Host Registered & Logged In.');

        // 2. Create User 2 (Player)
        const playerUser = { username: `AgentPlayer_${Date.now()}`, email: `agent_player_${Date.now()}@test.com`, password: 'password123' };
        console.log(`[AGENT] Creating Player: ${playerUser.username}...`);
        const playerRes = await axios.post(`${API_URL}/auth/register`, playerUser);
        const playersToken = playerRes.data.token;
        const playerId = playerRes.data.user.id;
        console.log('Player Registered & Logged In.');

        // 3. Host Creates Room
        console.log('Host Creating Room...');
        const roomRes = await axios.post(`${API_URL}/rooms/create`,
            { maxTeams: 2 },
            { headers: { 'x-auth-token': hostToken } }
        );
        const room = roomRes.data;
        console.log(`[AGENT] Room Created! ID: ${room.roomId} (Max Teams: ${room.maxTeams})`);

        // 4. Connect Sockets
        console.log('Connecting Sockets...');
        const hostSocket = io(SOCKET_URL);
        const playerSocket = io(SOCKET_URL);

        await new Promise(resolve => {
            let connected = 0;
            const onConnect = () => {
                connected++;
                if (connected === 2) resolve();
            };
            hostSocket.on('connect', onConnect);
            playerSocket.on('connect', onConnect);
        });
        console.log('Sockets Connected.');

        // 5. Join Room via Socket
        console.log('Joining Room via Sockets...');
        hostSocket.emit('room:join', { roomId: room.roomId, userId: hostId });
        playerSocket.emit('room:join', { roomId: room.roomId, userId: playerId });

        await sleep(1000);

        // 6. Select Teams
        console.log('Selecting Teams...');
        hostSocket.emit('team:select', { roomId: room.roomId, userId: hostId, teamName: 'CSK' });
        await sleep(500);
        playerSocket.emit('team:select', { roomId: room.roomId, userId: playerId, teamName: 'MI' });
        await sleep(2000); // Wait for sync

        // 7. Start Auction
        console.log('Host Starting Auction...');
        hostSocket.emit('room:startAuction', { roomId: room.roomId, userId: hostId });

        // 8. Verify Auction Start
        console.log('Waiting for Auction Start Event (auction:start)...');
        let currentAuctionState = null;

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Auction Start Timeout')), 5000);
            hostSocket.once('auction:start', (data) => {
                clearTimeout(timeout);
                console.log(`SUCCESS: Auction Started! First Player: ${data.firstPlayer.name} Base: ${data.firstPlayer.basePrice}`);
                currentAuctionState = data.auction;
                resolve();
            });
        });

        // 9. Verify Bidding Logic
        console.log('--- Testing Bidding Logic ---');

        // 9a. Test Invalid Low Bid
        console.log('Attempting invalid low bid...');
        const basePrice = currentAuctionState.currentBid || 20000000;
        hostSocket.emit('auction:bid', { roomId: room.roomId, userId: hostId, amount: basePrice - 100 });

        await new Promise(resolve => {
            hostSocket.once('error', (msg) => {
                console.log(`Expected Error Received: ${msg}`);
                resolve();
            });
            setTimeout(() => {
                console.log('WARNING: No error received for low bid? check console');
                resolve();
            }, 1000);
        });

        // 9b. Test Valid Bid
        const validBid = basePrice + 100000;
        console.log(`Attempting Valid Bid: ${validBid}...`);
        hostSocket.emit('auction:bid', { roomId: room.roomId, userId: hostId, amount: validBid });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Bid Update Timeout')), 5000);
            playerSocket.once('auction:bidUpdate', (data) => {
                clearTimeout(timeout);
                console.log(`SUCCESS: Bid Verified! Team ${data.teamId} bid ${data.amount}`);
                resolve();
            });
        });

        console.log('--- SIMULATION COMPLETED SUCCESSFULLY ---');
        process.exit(0);

    } catch (err) {
        console.error('SIMULATION FAILED:', err.message);
        if (err.response) {
            console.error('API Error Response:', JSON.stringify(err.response.data, null, 2));
            console.error('API Error Status:', err.response.status);
        }
        process.exit(1);
    }
}

runSimulation();
