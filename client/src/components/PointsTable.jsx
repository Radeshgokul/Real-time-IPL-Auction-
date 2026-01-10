import React from 'react';

const PointsTable = ({ teams, pointsTable }) => {
    const sortedTable = [...pointsTable].sort((a, b) => b.points - a.points);

    return (
        <div className="p-8 bg-slate-900 rounded-xl border border-slate-700">
            <h2 className="text-2xl font-bold text-ipl-gold mb-6 text-center">POINTS TABLE</h2>
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                        <th className="pb-4">TEAM</th>
                        <th className="pb-4">P</th>
                        <th className="pb-4">W</th>
                        <th className="pb-4">L</th>
                        <th className="pb-4">T</th>
                        <th className="pb-4 font-bold text-ipl-gold">PTS</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedTable.map((entry, index) => {
                        const team = teams.find(t => t._id === entry.teamId);
                        return (
                            <tr key={index} className="border-b border-slate-800 hover:bg-slate-800 transition-all">
                                <td className="py-4 font-bold">{team?.name}</td>
                                <td className="py-4">{entry.played}</td>
                                <td className="py-4">{entry.won}</td>
                                <td className="py-4">{entry.lost}</td>
                                <td className="py-4">{entry.tie}</td>
                                <td className="py-4 font-bold text-ipl-gold">{entry.points}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default PointsTable;
