import React, { useState, useEffect } from 'react';
import axios from './utils/api';
import socket from './utils/socket';
import AuthPage from './pages/AuthPage';
import Lobby from './pages/Lobby';
import AuctionPage from './pages/AuctionPage';
import PlayingXISelection from './pages/PlayingXISelection';
import MatchCenter from './pages/MatchCenter';
import PointsTable from './components/PointsTable';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
    const [user, setUser] = useState(null);
    const [room, setRoom] = useState(null);
    const [teams, setTeams] = useState([]);
    const [auction, setAuction] = useState(null);
    const [match, setMatch] = useState(null);
    const [pointsTable, setPointsTable] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAuth = () => {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');
            if (token && storedUser) {
                setUser(JSON.parse(storedUser));
            }
            setLoading(false);
        };
        checkAuth();

        const handleRoomSync = (data) => {
            setRoom(data.room);
            setTeams(data.teams);
            setAuction(data.auction);
            setMatch(data.match);
            setPointsTable(data.pointsTable || []);
        };

        const handleMatchStart = (data) => setMatch(data.match);
        const handlePointsUpdate = (data) => setPointsTable(data.pointsTable);
        const handleAuctionState = (data) => setAuction(data.auction);

        socket.on('room:sync', handleRoomSync);
        socket.on('match:start', handleMatchStart);
        socket.on('points:update', handlePointsUpdate);

        // Global Auction Listeners to prevent race conditions
        socket.on('auction:start', handleAuctionState);
        socket.on('auction:newPlayer', handleAuctionState);
        socket.on('auction:update', handleAuctionState);

        return () => {
            socket.off('room:sync', handleRoomSync);
            socket.off('match:start', handleMatchStart);
            socket.off('points:update', handlePointsUpdate);
            socket.off('auction:start', handleAuctionState);
            socket.off('auction:newPlayer', handleAuctionState);
            socket.off('auction:update', handleAuctionState);
        };
    }, []);

    const handleSetUser = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const handleSelectTeam = (teamName) => {
        socket.emit('team:select', { roomId: room.roomId, userId: user.id, teamName });
    };

    const handleStartAuction = () => {
        socket.emit('room:startAuction', { roomId: room.roomId, userId: user.id });
    };

    if (loading) return <div className="min-h-screen bg-ipl-dark flex items-center justify-center text-ipl-gold animate-pulse text-2xl font-black italic">LOADING...</div>;

    if (!user) return <AuthPage setUser={handleSetUser} />;

    if (!room) return <Lobby user={user} setRoom={setRoom} />;

    if (room.status === 'waiting') {
        const hostId = room.host._id || room.host;
        const isHost = hostId === user.id;
        const isFull = teams.length === room.maxTeams;

        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark p-6 text-white overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-12"
                >
                    <h2 className="text-5xl font-black mb-2 text-shadow-glow tracking-tighter italic uppercase text-white">
                        Room <span className="text-ipl-gold">{room.roomId}</span>
                    </h2>
                    <div className="bg-slate-800/50 backdrop-blur px-8 py-3 rounded-full border border-slate-700 inline-block shadow-lg">
                        <p className="text-slate-300 font-bold uppercase tracking-[0.2em] text-sm">
                            Joined Owners <span className="text-ipl-gold ml-2">({teams.length}/{room.maxTeams})</span>
                        </p>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-6xl">
                    {/* Teams to Select */}
                    <div className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-sm shadow-2xl">
                        <h3 className="text-xl font-black text-ipl-gold mb-8 uppercase tracking-widest italic border-b border-ipl-gold/20 pb-4">Available Franchises</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {['CSK', 'MI', 'RCB', 'KKR', 'DC', 'RR', 'SRH', 'PBKS', 'GT', 'LSG'].map(team => {
                                const teamAssignment = teams.find(t => t.name === team);
                                const isTaken = !!teamAssignment;
                                const ownerId = teamAssignment?.userId?._id || teamAssignment?.userId;
                                const isMine = isTaken && ownerId === user.id;

                                return (
                                    <button
                                        key={team}
                                        onClick={() => !isTaken && handleSelectTeam(team)}
                                        disabled={isTaken}
                                        className={`p-4 rounded-xl font-black text-lg border-2 transition-all group relative overflow-hidden ${isMine ? 'bg-ipl-gold border-white text-black scale-105 shadow-glow-gold' :
                                            isTaken ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-50 cursor-not-allowed' :
                                                'bg-ipl-blue border-blue-400 text-white hover:bg-blue-600 hover:scale-105 active:scale-95'
                                            }`}
                                    >
                                        {team}
                                        {isMine && <span className="absolute top-1 right-1 text-[10px] bg-white text-black px-1 rounded shadow-sm">YOU</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Joined Participants */}
                    <div className="bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-sm shadow-2xl flex flex-col min-h-[500px]">
                        <h3 className="text-xl font-black text-ipl-blue mb-8 uppercase tracking-widest italic border-b border-ipl-blue/20 pb-4">Owner Standings</h3>
                        <div className="space-y-4 flex-grow overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                            <AnimatePresence>
                                {/* Show users who joined but haven't picked a team yet */}
                                {room.users.map((u, i) => {
                                    const teamAssignment = teams.find(t => {
                                        const tUserId = t.userId._id || t.userId;
                                        const uId = u._id || u;
                                        return tUserId === uId;
                                    });
                                    return (
                                        <motion.div
                                            key={u._id || u}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${teamAssignment
                                                ? 'bg-slate-800 border-ipl-blue shadow-lg scale-[1.02]'
                                                : 'bg-slate-900/80 border-slate-700 shadow-inner'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-xl border-2 ${teamAssignment ? 'bg-ipl-blue border-blue-300' : 'bg-slate-700 border-slate-600'}`}>
                                                    {u.username ? u.username[0].toUpperCase() : '?'}
                                                </div>
                                                <div>
                                                    <p className="font-black text-white uppercase text-base tracking-tighter">
                                                        {u.username || 'Connecting...'}
                                                        {(u._id === user.id || u === user.id) && <span className="text-ipl-gold ml-2 text-xs">(YOU)</span>}
                                                    </p>
                                                    <p className={`text-[11px] font-black tracking-widest uppercase ${teamAssignment ? 'text-ipl-blue' : 'text-slate-500'}`}>
                                                        {teamAssignment ? `Owner of ${teamAssignment.name}` : 'Deciding on franchise...'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`px-4 py-1 rounded-full text-[10px] font-black border italic uppercase tracking-widest ${teamAssignment ? 'bg-ipl-blue/20 text-ipl-blue border-ipl-blue/30' : 'bg-slate-800 text-slate-500 border-slate-700 animate-pulse'}`}>
                                                {teamAssignment ? 'READY' : 'JOINED'}
                                            </div>
                                        </motion.div>
                                    );
                                })}

                                {/* Show empty slots */}
                                {Array.from({ length: Math.max(0, room.maxTeams - room.users.length) }).map((_, i) => (
                                    <motion.div
                                        key={`empty-${i}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 0.3 }}
                                        className="flex items-center justify-between p-4 rounded-2xl border border-dashed border-slate-700"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-slate-800 rounded-full border border-slate-700 border-dashed"></div>
                                            <p className="font-bold text-slate-600 uppercase text-xs tracking-widest">Awaiting Player...</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        {isHost && (
                            <div className="mt-8 space-y-3">
                                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em]">Host Controls</p>
                                <motion.button
                                    whileHover={isFull ? { scale: 1.02 } : {}}
                                    whileTap={isFull ? { scale: 0.98 } : {}}
                                    onClick={handleStartAuction}
                                    disabled={!isFull}
                                    className={`w-full py-5 rounded-2xl font-black text-2xl uppercase tracking-tighter transition-all shadow-2xl relative overflow-hidden group ${isFull
                                        ? 'bg-ipl-gold text-black hover:bg-yellow-400 shadow-glow-gold'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                                        }`}
                                >
                                    <span className="relative z-10">{isFull ? '🔥 START AUCTION 🔥' : `READY WHEN ${room.maxTeams} JOINED`}</span>
                                    {isFull && <motion.div animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12" />}
                                </motion.button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (room.status === 'auction') return <AuctionPage roomId={room.roomId} userId={user.id} teams={teams} auctionData={auction} room={room} />;

    if (room.status === 'playing_xi') {
        const myTeam = teams.find(t => {
            const tUserId = t.userId._id || t.userId;
            return tUserId === user.id;
        });
        return <PlayingXISelection roomId={room.roomId} userId={user.id} squad={myTeam?.squad || []} />;
    }

    if (room.status === 'match') return <MatchCenter roomId={room.roomId} userId={user.id} teams={teams} matchData={match} />;

    if (room.status === 'league_over') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark p-8 text-white">
                <h1 className="text-5xl font-black text-ipl-gold mb-12 italic tracking-tighter">SEASON SUMMARY</h1>
                <PointsTable teams={teams} pointsTable={pointsTable} />
                <button onClick={() => window.location.reload()} className="mt-12 bg-ipl-blue py-5 px-12 rounded-full font-black text-xl hover:bg-blue-600 transition-all shadow-lg active:scale-95 text-shadow-glow uppercase italic tracking-widest">
                    START NEW SEASON
                </button>
            </div>
        );
    }

    return <div>Phase: {room.status}</div>;
}

export default App;
