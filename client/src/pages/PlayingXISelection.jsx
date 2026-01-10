import React, { useState } from 'react';
import socket from '../utils/socket';

const PlayingXISelection = ({ roomId, userId, squad, onMatchStart }) => {
    const [selected, setSelected] = useState([]);
    const [error, setError] = useState('');

    const togglePlayer = (player) => {
        if (selected.find(p => p._id === player._id)) {
            setSelected(selected.filter(p => p._id !== player._id));
        } else if (selected.length < 11) {
            setSelected([...selected, player]);
        }
    };

    const validateXI = () => {
        if (selected.length !== 11) return 'Select exactly 11 players';
        const wk = selected.filter(p => p.role === 'Wicketkeeper').length;
        const ar = selected.filter(p => p.role === 'All-rounder').length;
        const bowl = selected.filter(p => p.role === 'Bowler').length;

        if (wk < 1) return 'Need at least 1 Wicketkeeper';
        if (ar < 1) return 'Need at least 1 All-rounder';
        if (bowl < 4) return 'Need at least 4 Bowlers';

        return null;
    };

    const handleSubmit = () => {
        const err = validateXI();
        if (err) {
            setError(err);
            return;
        }
        socket.emit('xi:submit', { roomId, userId, xi: selected.map(p => p._id) });
        setError('XI Submitted! Waiting for opponent...');
    };

    return (
        <div className="p-8 bg-ipl-dark min-h-screen text-white">
            <h2 className="text-3xl font-bold text-ipl-gold mb-6">SELECT PLAYING XI</h2>
            {error && <p className="text-red-400 mb-4">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {squad.map(player => (
                    <button
                        key={player._id}
                        onClick={() => togglePlayer(player)}
                        className={`p-4 rounded-lg border flex justify-between items-center transition-all ${selected.find(p => p._id === player._id)
                            ? 'bg-ipl-blue border-white border-2'
                            : 'bg-slate-800 border-slate-700 hover:border-ipl-gold'
                            }`}
                    >
                        <div>
                            <p className="font-bold">{player.name}</p>
                            <p className="text-xs text-slate-400">{player.role}</p>
                        </div>
                        {selected.find(p => p._id === player._id) && <span>✅</span>}
                    </button>
                ))}
            </div>

            <div className="fixed bottom-8 right-8">
                <button
                    onClick={handleSubmit}
                    className="bg-green-600 text-white font-bold py-4 px-8 rounded-full shadow-2xl hover:bg-green-500 transition-all"
                >
                    SUBMIT XI ({selected.length}/11)
                </button>
            </div>
        </div>
    );
};

export default PlayingXISelection;
