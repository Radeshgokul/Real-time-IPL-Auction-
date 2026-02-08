import React, { useState, useEffect, useRef, memo } from 'react';
import socket from '../utils/socket';
import { motion, AnimatePresence } from 'framer-motion';

// --- SUB-COMPONENTS (Memoized for performance) ---

const AuctionTimer = memo(({ auctionEndAt, status }) => {
    const [localTimer, setLocalTimer] = useState(0);
    const tickerRef = useRef(null);

    useEffect(() => {
        const calculateRemaining = () => {
            if (!auctionEndAt || status !== 'running') return 0;
            const end = new Date(auctionEndAt).getTime();
            const now = Date.now();
            return Math.max(0, Math.ceil((end - now) / 1000));
        };

        const cleanup = () => {
            if (tickerRef.current) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        };

        cleanup();
        setLocalTimer(calculateRemaining());

        tickerRef.current = setInterval(() => {
            const rem = calculateRemaining();
            setLocalTimer(rem);
            if (rem <= 0) cleanup();
        }, 500);

        return cleanup;
    }, [auctionEndAt, status]);

    return (
        <div className="bg-slate-800/80 border border-slate-700 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[120px]">
            <span className="text-[9px] text-slate-400 font-bold uppercase mb-1">Time Remaining</span>
            <span className={`text-3xl font-mono font-black ${localTimer < 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                {localTimer}s
            </span>
        </div>
    );
});

const PlayerCard = memo(({ player, currentBid, currentBidderName, isLeading }) => {
    if (!player) return null;
    return (
        <motion.div
            key={player._id}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-[2rem] p-8 relative overflow-hidden shadow-2xl min-h-[400px]"
        >
            <div className="absolute top-0 right-0 p-8 opacity-5 select-none pointer-events-none">
                <h1 className="text-[10rem] font-black italic uppercase leading-none">{player.role?.[0]}</h1>
            </div>

            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                    <span className="bg-ipl-blue text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">CURRENT PLAYER</span>
                    <span className="bg-white/5 text-slate-300 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{player.role}</span>
                </div>

                <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-none mb-8 text-white">{player.name}</h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-white/5">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Base Price</p>
                        <p className="text-2xl font-black italic text-white opacity-80">₹{((player.basePrice || 0) / 10000000).toFixed(2)} <span className="text-sm uppercase">Cr</span></p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Current Bid</p>
                        <motion.p
                            key={currentBid}
                            initial={{ scale: 1.2, color: '#fbbf24' }}
                            animate={{ scale: 1, color: currentBidderName ? '#4ade80' : '#ffff' }}
                            className="text-4xl font-black italic"
                        >
                            ₹{((currentBid || 0) / 10000000).toFixed(2)} <span className="text-lg uppercase">Cr</span>
                        </motion.p>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-widest">Leading Franchise</p>
                        <p className={`text-xl font-black italic uppercase truncate ${isLeading ? 'text-ipl-gold' : 'text-ipl-blue'}`}>
                            {currentBidderName || '---'}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
});

const BiddingPanel = memo(({ onBid, onSkip, isLeading, budget, currentBid, hasVotedToSkip, skipCount, teamsCount, isHost, onRestart, onEmergencyRestart }) => {
    const nextBid = currentBid + (currentBid < 20000000 ? 2000000 : 5000000);
    const canBid = !isLeading && budget >= nextBid && !hasVotedToSkip;

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl">
            <button
                onClick={onBid}
                disabled={!canBid}
                className={`w-full py-5 rounded-2xl text-2xl font-black uppercase tracking-tighter transition-all relative overflow-hidden group shadow-lg ${!canBid ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' :
                    'bg-green-500 text-slate-900 hover:bg-green-400 active:scale-[0.98]'
                    }`}
            >
                <span className="relative z-10 flex items-center justify-center gap-3">
                    {isLeading ? 'YOU HOLD THE HIGHEST BID' : (
                        <>
                            <span>RAISE PADDLE</span>
                            <span className="text-sm opacity-60 font-bold bg-black/10 px-2 py-1 rounded">
                                ₹{(nextBid / 10000000).toFixed(2)} Cr
                            </span>
                        </>
                    )}
                </span>
            </button>

            <div className="flex items-center gap-4 w-full">
                <button
                    onClick={onSkip}
                    disabled={hasVotedToSkip}
                    className={`flex-1 py-3 rounded-xl font-bold uppercase tracking-widest transition-all text-xs border ${hasVotedToSkip
                        ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                        : 'bg-transparent text-slate-400 border-slate-600 hover:bg-white/10 hover:text-white'
                        }`}
                >
                    {hasVotedToSkip ? 'VOTE RECORDED' : 'VOTE TO SKIP'}
                </button>
                {skipCount > 0 && (
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                        {skipCount} / {teamsCount} VOTES
                    </div>
                )}
            </div>

            {isHost && (
                <div className="w-full pt-2 border-t border-white/5 space-y-3">
                    <button onClick={onRestart} className="w-full py-2 rounded-xl font-black text-[10px] uppercase tracking-widest text-ipl-gold border border-ipl-gold/30 hover:bg-ipl-gold/10 transition-all flex items-center justify-center gap-2">
                        Restart Current Player (Recovery)
                    </button>
                    <div className="p-4 border-2 border-red-600/50 bg-red-900/20 rounded-2xl">
                        <button onClick={onEmergencyRestart} className="w-full py-3 rounded-xl font-black text-[12px] uppercase tracking-tighter bg-red-600 text-white hover:bg-red-700 shadow-lg">
                            Force Restart Current Player
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

const ActivityFeed = memo(({ notifications }) => (
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
));

const FranchiseStatus = memo(({ teams, myTeamId, onSelectTeam, selectedTeamId }) => (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-2xl">
        <h3 className="text-[10px] font-black uppercase text-ipl-gold tracking-widest mb-3 border-b border-white/5 pb-2">Franchise Status</h3>
        <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
            {teams.map(t => (
                <div
                    key={t._id}
                    onClick={() => onSelectTeam(t)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer hover:bg-white/5 transition-all ${selectedTeamId === t._id ? 'bg-white/10 border-ipl-gold' : 'bg-transparent border-white/5'}`}
                >
                    <div>
                        {t.userId?.username && <p className="text-[10px] font-bold text-ipl-blue mb-0.5 tracking-wider">{t.userId.username}</p>}
                        <p className={`text-[11px] font-black uppercase ${t._id === myTeamId ? 'text-ipl-gold' : 'text-white'}`}>
                            {t.name} {t._id === myTeamId && '(YOU)'}
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
));

// --- MAIN PAGE COMPONENT ---

const AuctionPage = ({ roomId, userId, teams: auctionTeams, auctionData: auction, room }) => {
    const [notifications, setNotifications] = useState([]);
    const [overlay, setOverlay] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState(null);


    useEffect(() => {
        const handleNewPlayer = (data) => {
            if (!data?.player) return;
            setOverlay(null);
            addNotification(`Next Player: ${data.player.name}`);
        };

        const handleAuctionStart = (data) => {
            setOverlay(null);
            addNotification(`Auction Started! First Player: ${data.firstPlayer.name}`);
        };

        const handleBidUpdate = (data) => {
            addNotification(`${data.teamName} bid ₹${(data.amount / 10000000).toFixed(2)} Cr`);
        };

        const handleSold = (data) => {
            if (!data?.player) return;
            setOverlay({ type: 'sold', player: data.player, team: data.team, price: data.price });
            addNotification(`SOLD! ${data.player.name} ${data.team ? `to ${data.team.name}` : ''} for ₹${(data.price / 10000000).toFixed(2)} Cr`);
        };

        const handleUnsold = (data) => {
            if (!data?.player) return;
            setOverlay({ type: 'unsold', player: data.player });
            addNotification(`UNSOLD: ${data.player.name}`);
        };

        const handleEnd = () => {
            setOverlay(null);
            addNotification("Auction Ended!");
        };

        socket.on('auction:newPlayer', handleNewPlayer);
        socket.on('auction:start', handleAuctionStart);
        socket.on('auction:bidUpdate', handleBidUpdate);
        socket.on('auction:sold', handleSold);
        socket.on('auction:unsold', handleUnsold);
        socket.on('auction:end', handleEnd);

        return () => {
            socket.off('auction:newPlayer', handleNewPlayer);
            socket.off('auction:start', handleAuctionStart);
            socket.off('auction:bidUpdate', handleBidUpdate);
            socket.off('auction:sold', handleSold);
            socket.off('auction:unsold', handleUnsold);
            socket.off('auction:end', handleEnd);
        };
    }, []);

    const addNotification = (msg) => {
        const id = Date.now();
        setNotifications(prev => [{ id, msg }, ...prev].slice(0, 5));
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    };

    const handleBid = () => {
        if (!auction?.currentPlayer) return;
        const currentBid = auction.currentBid || 0;
        const bidStep = currentBid < 20000000 ? 2000000 : 5000000;
        const nextBid = currentBid + bidStep;
        socket.emit('auction:bid', { roomId, userId, amount: nextBid });
    };

    const handleSkip = () => socket.emit('auction:skip', { roomId, userId });

    const isHost = room?.host === userId || room?.host?._id === userId;
    const myTeam = auctionTeams.find(t => (t.userId?._id || t.userId) === userId);
    const leadingTeam = auctionTeams.find(t => t._id === auction?.currentBidder);
    const isLeading = leadingTeam?._id === myTeam?._id;

    if (!auction?.currentPlayer && !overlay && auction?.status !== 'completed') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark text-white p-6">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2 }} className="w-16 h-16 border-4 border-ipl-gold border-t-transparent rounded-full mb-8"></motion.div>
                <h2 className="text-2xl font-black text-ipl-gold uppercase italic tracking-widest animate-pulse">Initializing Hammer Room...</h2>
            </div>
        );
    }

    if (auction?.status === 'completed') {
        return (
            <div className="min-h-screen bg-ipl-dark text-white p-4 lg:p-8 relative overflow-x-hidden">
                <div className="absolute inset-0 bg-[#0f172a] opacity-90 z-0"></div>
                <div className="max-w-7xl mx-auto relative z-10 text-center">
                    <h1 className="text-6xl font-black italic uppercase text-ipl-gold mb-12">Auction Completed</h1>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                        {auctionTeams.map(team => (
                            <div key={team._id} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left">
                                <h3 className="text-xl font-black text-white uppercase italic mb-4">{team.name}</h3>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {team.squad?.map((p, idx) => (
                                        <div key={idx} className="flex justify-between bg-white/5 p-2 rounded-lg text-[11px]">
                                            <span>{p.name}</span>
                                            <span className="text-ipl-gold">₹{((p.soldPrice || 0) / 10000000).toFixed(2)} Cr</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {isHost && (
                        <div className="flex justify-center gap-4">
                            <button onClick={() => socket.emit('auction:proceedToPlayingXI', { roomId, userId })} className="bg-ipl-gold text-black font-black py-4 px-12 rounded-2xl text-xl shadow-glow-gold">PROCEED TO SELECTION</button>
                            <button onClick={() => confirm('Reset?') && socket.emit('room:reset', { roomId, userId })} className="bg-red-600 text-white font-black py-4 px-12 rounded-2xl text-xl">RESET SEASON</button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-ipl-dark text-white p-4 lg:p-8 font-sans overflow-x-hidden relative">
            <div className="absolute inset-0 bg-[#0f172a] opacity-90 z-0 pointer-events-none"></div>
            <div className="max-w-7xl mx-auto space-y-6 relative z-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-ipl-gold rounded-lg flex items-center justify-center shadow-lg transform -rotate-3"><span className="text-black font-black text-xl">IPL</span></div>
                        <div>
                            <h1 className="text-2xl font-black italic uppercase">Auction Room <span className="text-ipl-blue">LIVE</span></h1>
                            <p className="text-slate-400 text-[10px] uppercase tracking-widest">Room ID: {roomId}</p>
                            {isHost && <button onClick={() => confirm('End?') && socket.emit('auction:endManual', { roomId, userId })} className="mt-2 text-[10px] bg-red-600 px-2 py-1 rounded font-bold uppercase">End Auction</button>}
                        </div>
                    </div>
                    <div className="flex gap-4 items-center">
                        <AuctionTimer auctionEndAt={auction?.auctionEndAt} status={auction?.status} />
                        <div className="bg-slate-800/80 border border-slate-700 px-6 py-3 rounded-2xl flex flex-col items-center min-w-[160px]">
                            <span className="text-[9px] text-ipl-gold font-bold uppercase mb-1">Your Purse</span>
                            <span className="text-xl font-black text-white italic">₹{((myTeam?.budget || 0) / 10000000).toFixed(2)} Cr</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-8 space-y-6">
                        <PlayerCard
                            player={auction?.currentPlayer}
                            currentBid={auction?.currentBid}
                            currentBidderName={leadingTeam?.name}
                            isLeading={isLeading}
                        />
                        <BiddingPanel
                            onBid={handleBid}
                            onSkip={handleSkip}
                            isLeading={isLeading}
                            budget={myTeam?.budget || 0}
                            currentBid={auction?.currentBid || 0}
                            hasVotedToSkip={auction?.skipVotes?.includes(userId)}
                            skipCount={auction?.skipVotes?.length || 0}
                            teamsCount={auctionTeams.length}
                            isHost={isHost}
                            onRestart={() => confirm('Restart?') && socket.emit('auction:restartPlayer', { roomId, userId })}
                            onEmergencyRestart={() => confirm('Emergency?') && socket.emit('auction:emergencyRestart', { roomId, userId })}
                        />
                    </div>
                    <div className="lg:col-span-4 space-y-6">
                        <ActivityFeed notifications={notifications} />
                        <FranchiseStatus
                            teams={auctionTeams}
                            myTeamId={myTeam?._id}
                            onSelectTeam={setSelectedTeam}
                            selectedTeamId={selectedTeam?._id}
                        />
                    </div>
                </div>

                {/* Overlays & Modals */}
                <AnimatePresence>
                    {overlay && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
                            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="bg-slate-900 p-12 rounded-[3rem] border border-slate-700 shadow-2xl text-center">
                                <h2 className={`text-6xl font-black italic uppercase mb-2 ${overlay.type === 'sold' ? 'text-green-500' : 'text-red-500'}`}>{overlay.type === 'sold' ? 'SOLD!' : 'UNSOLD'}</h2>
                                <h3 className="text-4xl text-white font-black uppercase mb-8">{overlay.player.name}</h3>
                                {overlay.type === 'sold' && <div className="bg-white/5 p-6 rounded-2xl"><p className="text-5xl font-black text-ipl-gold mb-2">{overlay.team.name}</p><p className="text-2xl font-black text-white italic">₹{(overlay.price / 10000000).toFixed(2)} Cr</p></div>}
                            </motion.div>
                        </motion.div>
                    )}
                    {selectedTeam && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSelectedTeam(null)}>
                            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()} className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                                    <h2 className="text-3xl font-black text-white uppercase italic">{selectedTeam.name} SQUAD</h2>
                                    <button onClick={() => setSelectedTeam(null)}>✕</button>
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead><tr className="text-[10px] text-slate-500 uppercase"><th className="p-3">Player</th><th className="p-3">Role</th><th className="p-3 text-right">Price</th></tr></thead>
                                        <tbody className="divide-y divide-white/5">
                                            {selectedTeam.squad?.map((p, i) => (
                                                <tr key={i}><td className="p-3 text-white font-bold">{p.name}</td><td className="p-3 text-xs text-slate-400">{p.role}</td><td className="p-3 text-right text-ipl-gold">₹{(p.soldPrice / 10000000).toFixed(2)} Cr</td></tr>
                                            ))}
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
