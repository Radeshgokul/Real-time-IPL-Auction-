import React, { useState } from 'react';
import axios from '../utils/api';
import socket from '../utils/socket';
import { motion } from 'framer-motion';

const Lobby = ({ user, setRoom }) => {
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [maxTeams, setMaxTeams] = useState(2);

    const handleCreate = async () => {
        setLoading(true);
        setError('');
        try {
            const { data } = await axios.post('/rooms/create', { maxTeams });
            setRoom(data);
            socket.emit('room:join', { roomId: data.roomId, userId: user.id });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create room');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!roomId) return;
        setLoading(true);
        setError('');
        try {
            const { data } = await axios.post('/rooms/join', { roomId: roomId.toUpperCase() });
            setRoom(data);
            socket.emit('room:join', { roomId: data.roomId, userId: user.id });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to join room');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        window.location.reload();
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark text-white p-6 relative">
            <button
                onClick={handleLogout}
                className="absolute top-6 right-6 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all border border-red-500/20"
            >
                Logout
            </button>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl bg-slate-800/50 backdrop-blur-xl p-10 rounded-3xl border border-slate-700 shadow-2xl"
            >
                <h2 className="text-4xl font-black text-ipl-gold mb-12 text-center italic">GAME LOBBY</h2>

                {error && <div className="bg-red-500/20 border border-red-500 text-red-100 p-3 rounded mb-8 text-center">{error}</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Create Section */}
                    <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-2xl border border-slate-700 hover:border-ipl-gold transition-all group">
                        <h3 className="text-2xl font-bold mb-4 group-hover:text-ipl-gold transition-all uppercase">Host Season</h3>
                        <div className="w-full mb-6 text-left">
                            <label className="block text-xs text-slate-500 mb-2 font-bold uppercase tracking-widest">Number of Teams</label>
                            <select
                                className="w-full bg-slate-800 border border-slate-700 p-3 rounded-lg text-ipl-gold font-bold outline-none focus:border-ipl-gold"
                                value={maxTeams}
                                onChange={(e) => setMaxTeams(parseInt(e.target.value))}
                            >
                                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} Teams</option>)}
                            </select>
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={loading}
                            className="w-full bg-ipl-gold text-black font-black py-4 rounded-xl hover:bg-yellow-400 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            CREATE ROOM
                        </button>
                    </div>

                    {/* Join Section */}
                    <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-2xl border border-slate-700 hover:border-ipl-blue transition-all group">
                        <h3 className="text-2xl font-bold mb-6 group-hover:text-ipl-blue transition-all uppercase">Join Season</h3>
                        <p className="text-slate-400 text-sm text-center mb-6">Enter a Room ID to join an existing session.</p>
                        <form onSubmit={handleJoin} className="w-full space-y-4">
                            <input
                                type="text"
                                placeholder="ENTER ROOM ID"
                                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl focus:border-ipl-blue outline-none text-center font-black tracking-widest text-xl uppercase"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={loading || !roomId}
                                className="w-full bg-ipl-blue text-white font-black py-4 rounded-xl hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                            >
                                JOIN ROOM
                            </button>
                        </form>
                    </div>
                </div>

                <div className="mt-12 text-center text-slate-500 text-xs">
                    PLAYER: <span className="text-ipl-gold font-bold">{user.username.toUpperCase()}</span>
                </div>
            </motion.div>
        </div>
    );
};

export default Lobby;
