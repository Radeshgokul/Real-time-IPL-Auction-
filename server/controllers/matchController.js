const PlayingXI = require('../models/PlayingXI');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Room = require('../models/Room');
const Innings = require('../models/Innings');
const PointsTable = require('../models/PointsTable');
const { updatePointsTable } = require('./leagueController');

const submitXI = async (roomId, userId, xiIds, io) => {
    const team = await Team.findOne({ roomId, userId });
    if (!team) return;
    const players = await Player.find({ _id: { $in: xiIds } });
    if (players.length !== 11) return;

    let match = await Match.findOne({ roomId, status: 'scheduled' });
    if (!match) {
        match = new Match({ roomId, status: 'scheduled', teams: (await Team.find({ roomId })).map(t => t._id) });
        await match.save();
    }

    const existingXI = await PlayingXI.findOne({ matchId: match._id, teamId: team._id });
    if (existingXI) return;

    const playingXI = new PlayingXI({ matchId: match._id, teamId: team._id, userId: userId, players: xiIds, isLocked: true });
    await playingXI.save();

    const allXIs = await PlayingXI.find({ matchId: match._id });
    if (allXIs.length === 2) {
        match.status = 'live';
        await match.save();
        const room = await Room.findOne({ roomId });
        room.status = 'match';
        await room.save();
        io.to(roomId).emit('match:start', { match, xis: allXIs });
        io.to(roomId).emit('room:sync', { room, teams: await Team.find({ roomId }) });
    }
};

const handleToss = async (roomId, userId, choice, io) => {
    const match = await Match.findOne({ roomId, status: 'live' });
    if (!match || match.tossWinner) return;
    const won = Math.random() > 0.5;
    const teams = await Team.find({ roomId });
    const myTeam = teams.find(t => t.userId.toString() === userId.toString());
    const otherTeam = teams.find(t => t.userId.toString() !== userId.toString());
    match.tossWinner = won ? myTeam._id : otherTeam._id;
    await match.save();
    io.to(roomId).emit('match:tossResult', { winner: match.tossWinner });
};

const matchPicks = {};

const handlePick = async (roomId, userId, value, io) => {
    const match = await Match.findOne({ roomId, status: 'live' }).populate('teams');
    if (!match) return;
    if (!matchPicks[roomId]) matchPicks[roomId] = {};
    matchPicks[roomId][userId] = value;

    const teams = await Team.find({ roomId });
    if (Object.keys(matchPicks[roomId]).length === 2) {
        const userIds = Object.keys(matchPicks[roomId]);
        const pick1 = matchPicks[roomId][userIds[0]];
        const pick2 = matchPicks[roomId][userIds[1]];
        matchPicks[roomId] = {};

        let currentInnings = await Innings.findOne({ matchId: match._id }).sort({ createdAt: -1 });
        if (!currentInnings) {
            const battingTeamId = match.teams[0]._id;
            const bowlingTeamId = match.teams[1]._id;
            currentInnings = new Innings({ matchId: match._id, battingTeam: battingTeamId, bowlingTeam: bowlingTeamId });
            await currentInnings.save();
        }

        const isUser1Batting = teams.find(t => t.userId.toString() === userIds[0])._id.toString() === currentInnings.battingTeam.toString();
        const batRes = isUser1Batting ? pick1 : pick2;
        const bowlRes = isUser1Batting ? pick2 : pick1;

        if (batRes === bowlRes) {
            currentInnings.wickets += 1;
            io.to(roomId).emit('match:ballResult', { result: 'OUT', batRes, bowlRes, runs: 0 });
        } else {
            currentInnings.runs += batRes;
            io.to(roomId).emit('match:ballResult', { result: 'RUNS', batRes, bowlRes, runs: batRes });
        }

        if (currentInnings.wickets >= 10) {
            const allInnings = await Innings.find({ matchId: match._id });
            if (allInnings.length === 1) {
                const secondInnings = new Innings({ matchId: match._id, battingTeam: currentInnings.bowlingTeam, bowlingTeam: currentInnings.battingTeam });
                await secondInnings.save();
                io.to(roomId).emit('match:inningsEnd', { innings: currentInnings, nextInnings: true });
            } else {
                match.status = 'completed';
                const inn1 = allInnings[0];
                const inn2 = currentInnings;
                if (inn1.runs > inn2.runs) match.winner = inn1.battingTeam;
                else if (inn2.runs > inn1.runs) match.winner = inn2.battingTeam;
                else match.isTie = true;
                await match.save();
                const room = await Room.findOne({ roomId });
                room.status = 'league_over';
                await room.save();

                await updatePointsTable(match._id);
                const pointsTable = await PointsTable.find({ roomId });
                io.to(roomId).emit('match:end', { match, winner: match.winner, isTie: match.isTie });
                io.to(roomId).emit('points:update', { pointsTable });
            }
        }
        await currentInnings.save();
        io.to(roomId).emit('match:scoreUpdate', { innings: await currentInnings.populate('battingTeam bowlingTeam') });
    }
};

module.exports = { submitXI, handleToss, handlePick };
