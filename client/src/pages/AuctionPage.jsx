import React, { useState, useEffect, useRef } from 'react';
import socket from '../utils/socket';
import { motion, AnimatePresence } from 'framer-motion';

const AuctionPage = ({ roomId, userId, teams, auctionData, room }) => {
    const [auction, setAuction] = useState(auctionData);
    const [auctionTeams, setAuctionTeams] = useState(teams);
    const [myTeam, setMyTeam] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [overlay, setOverlay] = useState(null); // { type: 'sold'|'unsold', data: ... }
    const [selectedTeam, setSelectedTeam] = useState(null);

    // Sound effects (optional, commented out for now)
    // const bidSound = new Audio('/sounds/bid.mp3');
    // const soldSound = new Audio('/sounds/sold.mp3');

    const [localTimer, setLocalTimer] = useState(0);

    // High-frequency local ticker to avoid visual freezes
    useEffect(() => {
        const calculateRemaining = () => {
            if (!auction?.timerEndsAt || auction.status !== 'running') return 0;
            const end = new Date(auction.timerEndsAt).getTime();
            const now = Date.now();
            return Math.max(0, Math.ceil((end - now) / 1000));
        };

        // Initial set
        setLocalTimer(calculateRemaining());

        const ticker = setInterval(() => {
            const rem = calculateRemaining();
            setLocalTimer(rem);

            // If it hits 0 and there's a bidder, we expect server to resolve soon.
            // If no bidder, it stays at 0 as requested.
        }, 100);

        return () => clearInterval(ticker);
    }, [auction?.timerEndsAt, auction?.status]);

    // Refs to constant state for socket listeners
    const auctionTeamsRef = useRef(teams);
    const userIdRef = useRef(userId);

    useEffect(() => {
        auctionTeamsRef.current = auctionTeams;
    }, [auctionTeams]);

    useEffect(() => {
        userIdRef.current = userId;
    }, [userId]);

    // Derived state for local use
    useEffect(() => {
        const foundTeam = auctionTeams.find(t => {
            const tUserId = t.userId?._id || t.userId;
            return tUserId === userId;
        });
        setMyTeam(foundTeam);
    }, [auctionTeams, userId]);

    useEffect(() => {
        if (auctionData) {
            setAuction(auctionData);
        }
    }, [auctionData]);

    useEffect(() => {
        // Handlers
        const handleNewPlayer = (data) => {
            setAuction(data.auction);
            setOverlay(null);
            addNotification(`Next Player: ${data.player.name}`);
        };

        const handleAuctionStart = (data) => {
            setAuction(data.auction);
            setOverlay(null);
            addNotification(`Auction Started! First Player: ${data.firstPlayer.name}`);
        };

        const handleAuctionUpdate = (data) => setAuction(data.auction);

        const handleTimer = (data) => {
            setAuction(prev => ({ ...prev, timer: data.timer }));
        };

        const handleBidUpdate = (data) => {
            addNotification(`${data.teamName} bid ₹${(data.amount / 10000000).toFixed(2)} Cr`);
        };

        const handleSold = (data) => {
            setOverlay({ type: 'sold', player: data.player, team: data.team, price: data.price });
            addNotification(`SOLD! ${data.player.name} to ${data.team.name} for ₹${(data.price / 10000000).toFixed(2)} Cr`);

            // Safe state update
            setAuctionTeams(prev => prev.map(t => t._id === data.team._id ? data.team : t));
        };

        const handleUnsold = (data) => {
            setOverlay({ type: 'unsold', player: data.player });
            addNotification(`UNSOLD: ${data.player.name}`);
        };

        const handleEnd = (data) => {
            console.log('[DEBUG] Auction Ended Event Received:', data);
            if (data.teams) setAuctionTeams(data.teams);

            setAuction(prev => ({
                ...prev,
                ...(data.auction || {}),
                status: 'completed'
            }));

            setOverlay(null);
            addNotification("Auction Ended! View final squads below.");
        };

        const handleRoomSync = (data) => {
            if (data.auction) setAuction(data.auction);
            if (data.teams) setAuctionTeams(data.teams);
        };

        // Attach Listeners
        socket.on('auction:newPlayer', handleNewPlayer);
        socket.on('auction:start', handleAuctionStart);
        socket.on('auction:update', handleAuctionUpdate);
        socket.on('auction:timer', handleTimer);
        socket.on('auction:bidUpdate', handleBidUpdate);
        socket.on('auction:sold', handleSold);
        socket.on('auction:unsold', handleUnsold);
        socket.on('auction:end', handleEnd);
        socket.on('room:sync', handleRoomSync);

        // Cleanup: ONE TIME ONLY
        return () => {
            socket.off('auction:newPlayer', handleNewPlayer);
            socket.off('auction:start', handleAuctionStart);
            socket.off('auction:update', handleAuctionUpdate);
            socket.off('auction:timer', handleTimer);
            socket.off('auction:bidUpdate', handleBidUpdate);
            socket.off('auction:sold', handleSold);
            socket.off('auction:unsold', handleUnsold);
            socket.off('auction:end', handleEnd);
            socket.off('room:sync', handleRoomSync);
        };
    }, []); // Empty dependency array ensures this runs ONCE

    const addNotification = (msg) => {
        const id = Date.now();
        setNotifications(prev => [{ id, msg }, ...prev].slice(0, 5));
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const handleBid = () => {
        if (!auction?.currentPlayer) return;
        const currentBid = auction.currentBid || 0;
        const bidStep = currentBid < 20000000 ? 2000000 : 5000000; // 20L step for low, 50L for high
        const nextBid = currentBid + bidStep;

        if (nextBid <= (myTeam?.budget || 0)) {
            socket.emit('auction:bid', { roomId, userId, amount: nextBid });
        }
    };

    const handleProceedToSelection = () => {
        socket.emit('auction:proceedToPlayingXI', { roomId, userId });
    };

    const handleSkip = () => {
        socket.emit('auction:skip', { roomId, userId });
    };

    if (!auction?.currentPlayer && !overlay && auction?.status !== 'completed') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark text-white p-6">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2 }} className="w-16 h-16 border-4 border-ipl-gold border-t-transparent rounded-full mb-8"></motion.div>
                <h2 className="text-2xl font-black text-ipl-gold uppercase italic tracking-widest animate-pulse">Initializing Hammer Room...</h2>
            </div>
        );
    }

    const currentBidder = auctionTeams.find(t => t._id === auction?.currentBidder);
    const isLeading = currentBidder?._id === myTeam?._id;

    const handleManualEnd = () => {
        if (confirm('Are you sure you want to end the auction completely?')) {
            socket.emit('auction:endManual', { roomId, userId });
        }
    };

    const isHost = room?.host === userId || room?.host?._id === userId;

    if (auction?.status === 'completed') {
        return (
            <div className="min-h-screen bg-ipl-dark text-white p-4 lg:p-8 font-sans relative overflow-x-hidden">
                <div className="absolute inset-0 bg-[#0f172a] opacity-90 z-0"></div>
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center mb-12">
                        <h1 className="text-6xl font-black italic uppercase text-ipl-gold tracking-tighter mb-2">Auction Completed</h1>
                        <p className="text-slate-400 font-bold uppercase tracking-[0.4em]">Final Team Rosters</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {auctionTeams.map(team => (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={team._id}
                                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl"
                            >
                                <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                                    <h3 className="text-xl font-black text-white uppercase italic">{team.name}</h3>
                                    <span className="text-xs font-bold text-ipl-gold">₹{(team.budget / 10000000).toFixed(2)} Cr</span>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                    {team.squad?.map((player, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-white/5 p-2 rounded-lg text-[11px]">
                                            <span className="font-bold text-slate-200">{player.name}</span>
                                            <span className="text-slate-500 italic">₹{((player.soldPrice || 0) / 10000000).toFixed(2)} Cr</span>
                                        </div>
                                    ))}
                                    {(!team.squad || team.squad.length === 0) && (
                                        <p className="text-center text-[10px] text-slate-600 font-bold uppercase py-4">No players bought</p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {isHost && (
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={handleProceedToSelection}
                                className="bg-ipl-gold text-black font-black py-4 px-12 rounded-2xl text-xl uppercase tracking-widest hover:bg-yellow-400 transition-all shadow-glow-gold active:scale-95 z-50 pointer-events-auto"
                            >
                                PROCEED TO PLAYER SELECTION
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('DANGER: This will reset the entire season, clear all squads, and return everyone to lobby. Are you sure?')) {
                                        socket.emit('room:reset', { roomId, userId });
                                    }
                                }}
                                className="bg-red-600 text-white font-black py-4 px-12 rounded-2xl text-xl uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg active:scale-95 z-50 pointer-events-auto"
                            >
                                RESET SEASON
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-ipl-dark text-white p-4 lg:p-8 font-sans overflow-x-hidden relative">

            {/* Background Texture */}
            <div className="absolute inset-0 bg-[#0f172a] opacity-90 z-0 pointer-events-none"></div>

            <div className="max-w-7xl mx-auto space-y-6 relative z-10 w-full">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-ipl-gold rounded-lg flex items-center justify-center shadow-lg transform -rotate-3 border border-white/20">
                            <span className="text-black font-black text-xl">IPL</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter italic uppercase text-white leading-none">Auction Room <span className="text-ipl-blue">LIVE</span></h1>
                            <p className="text-slate-400 text-[10px] font-bold tracking-[0.3em] uppercase mt-1">Room ID: {roomId}</p>
                            {isHost && (
                                <button
                                    onClick={handleManualEnd}
                                    className="mt-2 text-[10px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded font-bold uppercase tracking-wider transition-all"
                                >
                                    End Auction
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-4 items-center">
                        <div className="bg-slate-800/80 border border-slate-700 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[120px]">
                            <span className="text-[9px] text-slate-400 font-bold uppercase mb-1">Time Remaining</span>
                            <span className={`text-3xl font-mono font-black ${localTimer < 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                {localTimer}s
                            </span>
                        </div>
                        <div className="bg-slate-800/80 border border-slate-700 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[160px]">
                            <span className="text-[9px] text-ipl-gold font-bold uppercase mb-1">Your Purse</span>
                            <span className="text-xl font-black text-white italic">
                                ₹{((myTeam?.budget || 0) / 10000000).toFixed(2)} <span className="text-xs">Cr</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* MAIN STAGE (8 Cols) */}
                    <div className="lg:col-span-8 space-y-6">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={auction?.currentPlayer?._id || 'loading'}
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: -20, opacity: 0 }}
                                className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-[2rem] p-8 relative overflow-hidden shadow-2xl min-h-[400px]"
                            >
                                {/* Role Background */}
                                <div className="absolute top-0 right-0 p-8 opacity-5 select-none pointer-events-none">
                                    <h1 className="text-[10rem] font-black italic uppercase leading-none">{auction?.currentPlayer?.role?.[0]}</h1>
                                </div>

                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="bg-ipl-blue text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">CURRENT PLAYER</span>
                                        <span className="bg-white/5 text-slate-300 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{auction?.currentPlayer?.role}</span>
                                    </div>

                                    <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-none mb-8 text-white">{auction?.currentPlayer?.name}</h2>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-white/5">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Base Price</p>
                                            <p className="text-2xl font-black italic text-white opacity-80">₹{((auction?.currentPlayer?.basePrice || 0) / 10000000).toFixed(2)} <span className="text-sm uppercase">Cr</span></p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Current Bid</p>
                                            <motion.p
                                                key={auction?.currentBid}
                                                initial={{ scale: 1.2, color: '#fbbf24' }}
                                                animate={{ scale: 1, color: auction?.currentBidder ? '#4ade80' : '#ffff' }}
                                                className="text-4xl font-black italic"
                                            >
                                                ₹{((auction?.currentBid || 0) / 10000000).toFixed(2)} <span className="text-lg uppercase">Cr</span>
                                            </motion.p>
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Leading Franchise</p>
                                            <p className={`text-xl font-black italic uppercase truncate ${isLeading ? 'text-ipl-gold' : 'text-ipl-blue'}`}>
                                                {currentBidder?.name || '---'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* Interactive Bid Area */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl">
                            <button
                                onClick={handleBid}
                                disabled={isLeading || (myTeam?.budget || 0) < ((auction?.currentBid || 0) + (auction?.currentBid < 20000000 ? 2000000 : 5000000)) || auction?.skipVotes?.includes(userId)}
                                className={`w-full py-5 rounded-2xl text-2xl font-black uppercase tracking-tighter transition-all relative overflow-hidden group shadow-lg ${isLeading || auction?.skipVotes?.includes(userId) ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' :
                                    'bg-green-500 text-slate-900 hover:bg-green-400 active:scale-[0.98]'
                                    }`}
                            >
                                <span className="relative z-10 flex items-center justify-center gap-3">
                                    {isLeading ? 'YOU HOLD THE HIGHEST BID' : (
                                        <>
                                            <span>RAISE PADDLE</span>
                                            <span className="text-sm opacity-60 font-bold bg-black/10 px-2 py-1 rounded">
                                                ₹{(((auction?.currentBid || 0) + ((auction?.currentBid || 0) < 20000000 ? 2000000 : 5000000)) / 10000000).toFixed(2)} Cr
                                            </span>
                                        </>
                                    )}
                                </span>
                            </button>

                            {/* SKIP BUTTON */}
                            <div className="flex items-center gap-4 w-full">
                                <button
                                    onClick={handleSkip}
                                    disabled={auction?.skipVotes?.includes(userIdRef.current)}
                                    className={`flex-1 py-3 rounded-xl font-bold uppercase tracking-widest transition-all text-xs border ${auction?.skipVotes?.includes(userIdRef.current)
                                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                        : 'bg-transparent text-slate-400 border-slate-600 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    {auction?.skipVotes?.includes(userIdRef.current) ? 'VOTE RECORDED' : 'VOTE TO SKIP'}
                                </button>
                                {auction?.skipVotes?.length > 0 && (
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                                        {auction.skipVotes.length} / {auctionTeams.length} VOTES
                                    </div>
                                )}
                            </div>

                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.3em] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Live Bidding Enabled
                            </p>
                        </div>
                    </div>

                    {/* SIDEBAR (4 Cols) */}
                    <div className="lg:col-span-4 space-y-6">

                        {/* Notifications Log */}
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 h-[200px] flex flex-col relative overflow-hidden">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 border-b border-white/5 pb-2">Activity Feed</h3>
                            <div className="space-y-2 overflow-y-auto flex-grow custom-scrollbar z-10">
                                <AnimatePresence initial={false}>
                                    {notifications.map(n => (
                                        <motion.div
                                            key={n.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="bg-white/5 border border-white/5 p-2 px-3 rounded-lg text-[10px] font-bold text-slate-300 backdrop-blur-sm"
                                        >
                                            {n.msg}
                                        </motion.div>
                                    ))}
                                    {notifications.length === 0 && <p className="text-[9px] text-slate-700 font-bold uppercase text-center mt-10">Waiting for bids...</p>}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Teams Overview */}
                        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-2xl">
                            <h3 className="text-[10px] font-black uppercase text-ipl-gold tracking-widest mb-3 border-b border-white/5 pb-2">Franchise Status</h3>
                            <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                                {auctionTeams.map(t => (
                                    <div
                                        key={t._id}
                                        onClick={() => setSelectedTeam(t)}
                                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-white/5 transition-all ${selectedTeam?._id === t._id ? 'bg-white/10 border-ipl-gold' : 'bg-transparent border-white/5'}`}
                                    >
                                        <div>
                                            {t.userId?.username && (
                                                <p className="text-[10px] font-bold text-ipl-blue mb-0.5 tracking-wider">
                                                    {t.userId.username}
                                                </p>
                                            )}
                                            <p className={`text-[11px] font-black uppercase ${t.name === myTeam?.name ? 'text-ipl-gold' : 'text-white'}`}>
                                                {t.name} {t.name === myTeam?.name && '(YOU)'}
                                            </p>
                                            <p className="text-[9px] text-slate-500 font-bold uppercase">{t.squad?.length || 0}/15 Players</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-bold text-slate-300">₹{(t.budget / 10000000).toFixed(2)} Cr</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* OVERLAYS */}
                <AnimatePresence>
                    {overlay && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ scale: 0.5, y: 50 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                className="bg-gradient-to-b from-slate-800 to-slate-900 p-12 rounded-[3rem] border border-slate-700 shadow-2xl text-center max-w-2xl w-full mx-4"
                            >
                                <h2 className={`text-6xl font-black italic uppercase mb-2 ${overlay.type === 'sold' ? 'text-green-500' : 'text-red-500'}`}>
                                    {overlay.type === 'sold' ? 'SOLD!' : 'UNSOLD'}
                                </h2>
                                <h3 className="text-4xl text-white font-black uppercase tracking-tighter mb-8">{overlay.player.name}</h3>

                                {overlay.type === 'sold' && (
                                    <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-2">Acquired By</p>
                                        <div className="text-5xl font-black text-ipl-gold mb-2">{overlay.team.name}</div>
                                        <p className="text-2xl font-black text-white italic">₹{(overlay.price / 10000000).toFixed(2)} Cr</p>
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    )}

                    {selectedTeam && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onClick={() => setSelectedTeam(null)}
                        >
                            <motion.div
                                initial={{ y: 100 }}
                                animate={{ y: 0 }}
                                exit={{ y: 100 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
                            >
                                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                                    <h2 className="text-3xl font-black text-white uppercase italic">{selectedTeam.name} SQUAD</h2>
                                    <button onClick={() => setSelectedTeam(null)} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white transition-all">✕</button>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div className="bg-slate-800 p-4 rounded-xl">
                                        <p className="text-slate-500 text-xs font-bold uppercase">Purse Remaining</p>
                                        <p className="text-2xl font-black text-ipl-gold">₹{(selectedTeam.budget / 10000000).toFixed(2)} Cr</p>
                                    </div>
                                    <div className="bg-slate-800 p-4 rounded-xl">
                                        <p className="text-slate-500 text-xs font-bold uppercase">Squad Strength</p>
                                        <p className="text-2xl font-black text-white">{selectedTeam.squad?.length || 0}/25</p>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead className="text-[10px] font-bold uppercase text-slate-500 bg-slate-800/50 sticky top-0">
                                            <tr>
                                                <th className="p-3">Player</th>
                                                <th className="p-3">Role</th>
                                                <th className="p-3 text-right">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {selectedTeam.squad?.map((p, i) => (
                                                <tr key={i} className="hover:bg-white/5">
                                                    <td className="p-3 font-bold text-white text-sm">{p.name}</td>
                                                    <td className="p-3 text-xs text-slate-400">{p.role}</td>
                                                    <td className="p-3 text-right font-mono text-ipl-gold text-xs">₹{(p.soldPrice / 10000000).toFixed(2)} Cr</td>
                                                </tr>
                                            ))}
                                            {(!selectedTeam.squad || selectedTeam.squad.length === 0) && (
                                                <tr>
                                                    <td colSpan="3" className="p-8 text-center text-slate-600 text-xs font-bold uppercase">No players bought yet</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AuctionPage;
