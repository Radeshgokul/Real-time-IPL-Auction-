import React, { useState, useEffect } from 'react';
import socket from '../utils/socket';
import { motion } from 'framer-motion';

const MatchCenter = ({ roomId, userId, teams, matchData, playingXIs }) => {
    const [match, setMatch] = useState(matchData);
    const [tossResult, setTossResult] = useState(matchData?.tossWinner || null);
    const [innings, setInnings] = useState(null);
    const [ballResult, setBallResult] = useState(null);
    const [myPick, setMyPick] = useState(null);
    const [viewedLineups, setViewedLineups] = useState(false);

    useEffect(() => {
        socket.on('match:tossResult', (data) => setTossResult(data.winner));
        socket.on('match:scoreUpdate', (data) => setInnings(data.innings));
        socket.on('match:ballResult', (data) => {
            setBallResult(data);
            setTimeout(() => setBallResult(null), 2500);
            setMyPick(null);
        });
        return () => {
            socket.off('match:tossResult');
            socket.off('match:scoreUpdate');
            socket.off('match:ballResult');
        };
    }, []);

    const handleToss = (choice) => socket.emit('match:toss', { roomId, userId, choice });
    const handlePick = (num) => {
        setMyPick(num);
        socket.emit('match:pick', { roomId, userId, value: num });
    };

    const shouldShowLineups = playingXIs?.length > 0 && !viewedLineups && !matchData?.tossWinner && !tossResult;

    if (shouldShowLineups) {
        return (
            <div className="min-h-screen bg-ipl-dark text-white p-8 overflow-y-auto">
                <h2 className="text-4xl text-center font-black text-ipl-gold mb-8 italic uppercase tracking-tighter">Playing XIs Confirmed</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                    {playingXIs.map((xi, idx) => {
                        const team = teams.find(t => t._id === xi.teamId || t._id === xi.teamId?._id);
                        return (
                            <div key={idx} className="bg-slate-900/80 p-6 rounded-3xl border border-slate-700">
                                <h3 className="text-2xl font-bold bg-slate-800 p-4 rounded-xl text-center mb-6 border-b-4 border-ipl-blue">
                                    {team?.name || 'Team'}
                                </h3>
                                <div className="space-y-2">
                                    {xi.players.map(p => (
                                        <div key={p._id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                            <span className="font-bold">{p.name || 'Unknown Player'}</span>
                                            <span className="text-xs text-slate-400 uppercase">{p.role || 'Player'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="text-center mt-12 pb-12">
                    <button
                        onClick={() => setViewedLineups(true)}
                        className="bg-ipl-gold text-black font-black py-4 px-12 rounded-full text-xl hover:bg-yellow-400 transition-all shadow-glow-gold uppercase tracking-widest"
                    >
                        Proceed to Toss
                    </button>
                </div>
            </div>
        );
    }

    if (!tossResult) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark text-white p-6">
                <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-5xl font-black text-ipl-gold mb-12 italic tracking-tighter">CHOOSE HEADS OR TAILS</motion.h2>
                <div className="flex gap-12">
                    {['heads', 'tails'].map(c => (
                        <motion.button
                            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            key={c} onClick={() => handleToss(c)}
                            className="bg-slate-800 h-40 w-40 rounded-full border-4 border-ipl-gold shadow-2xl flex items-center justify-center font-black text-3xl uppercase"
                        >
                            {c}
                        </motion.button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 bg-ipl-dark min-h-screen text-white">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8 bg-slate-800 p-6 rounded-2xl border-l-8 border-ipl-gold shadow-xl">
                    <div className="text-left">
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">Live Match</p>
                        <h2 className="text-3xl font-black">{teams[0]?.name} <span className="text-ipl-gold mx-2">VS</span> {teams[1]?.name}</h2>
                    </div>
                    <div className="text-right">
                        <div className="text-5xl font-black text-ipl-gold">
                            {innings ? `${innings.runs}/${innings.wickets}` : '0/0'}
                        </div>
                        <p className="text-xs text-slate-400 uppercase font-bold mt-1">
                            {innings ? `${innings.battingTeam?.name} batting` : 'Starting...'}
                        </p>
                    </div>
                </div>

                <div className="h-48 flex items-center justify-center mb-12">
                    <AnimatePresence mode="wait">
                        {ballResult && (
                            <motion.div
                                initial={{ scale: 0, rotate: -20 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 2, opacity: 0 }}
                                className={`text-8xl font-black drop-shadow-2xl ${ballResult.result === 'OUT' ? 'text-red-500' : 'text-green-400'}`}
                            >
                                {ballResult.result === 'OUT' ? 'OUT!' : `+${ballResult.runs}`}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-slate-900/40 p-10 rounded-3xl border border-slate-700/50 backdrop-blur-md">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                            <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                key={num} onClick={() => handlePick(num)} disabled={myPick !== null}
                                className={`p-6 rounded-xl text-3xl font-black shadow-lg transition-all ${myPick === num ? 'bg-ipl-gold text-slate-900 ring-4 ring-white' : 'bg-slate-800 border border-slate-600 hover:border-ipl-gold'
                                    }`}
                            >
                                {num}
                            </motion.button>
                        ))}
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">
                        {myPick ? "Opponent is thinking..." : "Your Turn: Pick a number"}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MatchCenter;

import { AnimatePresence } from 'framer-motion';
