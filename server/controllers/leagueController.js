const Match = require('../models/Match');
const Team = require('../models/Team');
const PointsTable = require('../models/PointsTable');
const Season = require('../models/Season');

const generateFixtures = async (roomId, seasonId) => {
    const teams = await Team.find({ roomId });
    const fixtures = [];

    // Basic round-robin fixture generation
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            fixtures.push({
                roomId,
                seasonId,
                teams: [teams[i]._id, teams[j]._id],
                status: 'scheduled'
            });
        }
    }

    await Match.insertMany(fixtures);
    return fixtures;
};

const updatePointsTable = async (matchId) => {
    const match = await Match.findById(matchId).populate('teams');
    if (!match || match.status !== 'completed') return;

    const pointsPerWin = 2;
    const pointsPerTie = 1;

    for (const teamId of match.teams) {
        let entry = await PointsTable.findOne({ roomId: match.roomId, teamId });
        if (!entry) {
            entry = new PointsTable({ roomId: match.roomId, teamId });
        }

        entry.played += 1;
        if (match.isTie) {
            entry.tie += 1;
            entry.points += pointsPerTie;
        } else if (match.winner.toString() === teamId._id.toString()) {
            entry.won += 1;
            entry.points += pointsPerWin;
        } else {
            entry.lost += 1;
        }
        await entry.save();
    }
};

module.exports = { generateFixtures, updatePointsTable };
