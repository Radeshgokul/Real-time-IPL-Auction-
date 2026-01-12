const Room = require('../models/Room');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Auction = require('../models/Auction');
const { startAuction } = require('../controllers/auctionController');
const { submitXI } = require('../controllers/matchController');

const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'DC', 'RR', 'SRH', 'PBKS', 'GT', 'LSG'];

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[DEBUG] New Socket Connection: ${socket.id}`);

        socket.on('room:join', async ({ roomId, userId }) => {
            console.log(`[DEBUG] Received room:join for Room ${roomId}, User ${userId}`);
            try {
                const room = await Room.findOne({ roomId }).populate('users', 'username isGuest');
                if (!room) return socket.emit('error', 'Room not found');

                socket.join(roomId);
                const teams = await Team.find({ roomId }).populate('userId', 'username');
                const auction = await Auction.findOne({ roomId }).populate('currentPlayer');
                io.to(roomId).emit('room:sync', { room, teams, auction });
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('team:select', async ({ roomId, userId, teamName }) => {
            console.log(`[DEBUG] Received team:select for Room ${roomId}, User ${userId}, Team ${teamName}`);
            try {
                if (!IPL_TEAMS.includes(teamName)) return socket.emit('error', 'Invalid team');
                const existingTeam = await Team.findOne({ roomId, name: teamName });
                if (existingTeam) return socket.emit('error', 'Team already taken');

                const userTeam = await Team.findOne({ roomId, userId });
                if (userTeam) return socket.emit('error', 'You already selected a team');

                const newTeam = new Team({ roomId, userId, name: teamName, budget: 1300000000, squad: [] });
                await newTeam.save();
                console.log(`[DEBUG] Team ${teamName} saved for User ${userId}`);

                const teams = await Team.find({ roomId }).populate('userId', 'username');
                const room = await Room.findOne({ roomId }).populate('users', 'username isGuest');
                io.to(roomId).emit('room:sync', { room, teams });
                console.log('[DEBUG] Emitted room:sync');
            } catch (err) {
                console.error('[DEBUG] Error in team:select:', err);
                socket.emit('error', err.message);
            }
        });

        socket.on('room:startAuction', async ({ roomId, userId }) => {
            console.log(`[DEBUG] Received room:startAuction for Room ${roomId} from User ${userId}`);
            try {
                const room = await Room.findOne({ roomId });
                if (!room) {
                    console.log('[DEBUG] Room not found');
                    return socket.emit('error', 'Room not found');
                }
                const hostId = room.host._id || room.host;
                if (hostId.toString() !== userId.toString()) {
                    console.log('[DEBUG] User is not host');
                    return socket.emit('error', 'Only host can start auction');
                }

                const teams = await Team.find({ roomId });
                console.log(`[DEBUG] Teams count: ${teams.length}, Max: ${room.maxTeams}`);
                if (teams.length < room.maxTeams) return socket.emit('error', 'Wait for all teams to join');

                room.status = 'auction';
                await room.save();
                console.log('[DEBUG] Room status updated to auction');

                const populatedTeams = await Team.find({ roomId }).populate('userId', 'username');
                io.to(roomId).emit('room:sync', { room, teams: populatedTeams });

                console.log('[DEBUG] Calling startAuction controller...');
                console.log('[DEBUG] Calling startAuction controller...');
                startAuction(roomId, io, true); // Pass true for isFirst
            } catch (err) {
                console.error('[DEBUG] Error in room:startAuction:', err);
                socket.emit('error', err.message);
            }
        });

        socket.on('auction:endManual', async ({ roomId, userId }) => {
            console.log(`[DEBUG] Received auction:endManual for Room ${roomId} from User ${userId}`);
            try {
                const room = await Room.findOne({ roomId });
                if (!room) return socket.emit('error', 'Room not found');

                const hostId = room.host._id || room.host;
                if (hostId.toString() !== userId.toString()) {
                    return socket.emit('error', 'Only host can end auction');
                }

                const { endAuctionManually } = require('../controllers/auctionController');
                await endAuctionManually(roomId, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('auction:proceedToPlayingXI', async ({ roomId, userId }) => {
            console.log(`[DEBUG] Received auction:proceedToPlayingXI for Room ${roomId} from User ${userId}`);
            try {
                const room = await Room.findOne({ roomId });
                if (!room) return socket.emit('error', 'Room not found');

                const hostId = room.host._id || room.host;
                if (hostId.toString() !== userId.toString()) {
                    return socket.emit('error', 'Only host can proceed');
                }

                const { generateFixtures } = require('../controllers/leagueController');

                console.log(`[DEBUG] Advancing room ${roomId} to playing_xi`);
                room.status = 'playing_xi';
                await room.save();

                await generateFixtures(roomId, room.currentSeason);
                console.log(`[DEBUG] Fixtures generated for room ${roomId}`);

                const teams = await Team.find({ roomId }).populate('squad').populate('userId', 'username');
                const auction = await Auction.findOne({ roomId });

                io.to(roomId).emit('room:sync', { room, teams, auction });
                console.log(`[DEBUG] room:sync emitted for phase transition to playing_xi`);
            } catch (err) {
                console.error('[DEBUG] Proceed Error:', err);
                socket.emit('error', err.message);
            }
        });

        socket.on('auction:bid', async ({ roomId, userId, amount }) => {
            try {
                const team = await Team.findOne({ roomId, userId });
                if (!team) return socket.emit('error', 'No team found for user');

                // Atomic Update to place bid
                // We use findOneAndUpdate to ensure we only bid if:
                // 1. Auction is running
                // 2. Amount is > currentBid (or >= if NO bidder yet)
                // 3. User has enough budget

                // We do a pre-check for budget to avoid unnecessary DB pressure
                if (amount > team.budget) {
                    return socket.emit('error', 'Insufficient budget');
                }

                const updatedAuction = await Auction.findOneAndUpdate(
                    {
                        roomId,
                        status: 'running',
                        $or: [
                            { currentBidder: null },
                            { currentBid: { $lt: amount } }
                        ]
                    },
                    {
                        $set: {
                            currentBid: amount,
                            currentBidder: team._id,
                            timer: 30,
                            auctionEndAt: new Date(Date.now() + 30000),
                            lastEventAt: new Date()
                        }
                    },
                    { new: true }
                ).populate('currentPlayer');

                if (!updatedAuction) {
                    return socket.emit('error', 'Bid rejected (someone else might have bid higher or round ended)');
                }

                io.to(roomId).emit('auction:update', { auction: updatedAuction });
                io.to(roomId).emit('auction:bidUpdate', { teamId: team._id, amount, teamName: team.name });
            } catch (err) {
                console.error('[ERROR] Bid Error:', err);
                socket.emit('error', err.message);
            }
        });

        socket.on('auction:skip', async ({ roomId, userId }) => {
            try {
                const { handleSkipVote } = require('../controllers/auctionController');
                await handleSkipVote(roomId, userId, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('xi:submit', async ({ roomId, userId, xi }) => {
            try {
                await submitXI(roomId, userId, xi, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('room:reset', async ({ roomId, userId }) => {
            try {
                const room = await Room.findOne({ roomId });
                if (!room) return socket.emit('error', 'Room not found');

                const hostId = room.host._id || room.host;
                if (hostId.toString() !== userId.toString()) {
                    return socket.emit('error', 'Only host can reset auction');
                }

                const { resetAuction } = require('../controllers/auctionController');
                await resetAuction(roomId, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('match:toss', async ({ roomId, userId, choice }) => {
            try {
                const { handleToss } = require('../controllers/matchController');
                await handleToss(roomId, userId, choice, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('match:pick', async ({ roomId, userId, value }) => {
            try {
                const { handlePick } = require('../controllers/matchController');
                await handlePick(roomId, userId, value, io);
            } catch (err) {
                socket.emit('error', err.message);
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
};
