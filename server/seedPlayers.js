require('dotenv').config();
const mongoose = require('mongoose');
const Player = require('./models/Player');
const Auction = require('./models/Auction');
const Team = require('./models/Team');
const Room = require('./models/Room');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ipl-auction')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const { randomUUID } = require('crypto');

const seedPlayers = async () => {
    try {
        await Player.deleteMany({});
        await Auction.deleteMany({});
        await Team.deleteMany({});
        await Room.deleteMany({});
        console.log('Cleared existing data (Players, Auctions, Teams, Rooms)');

        const players = [];
        const add = (name, role, price) => {
            if (name && role && price) {
                players.push({
                    playerId: randomUUID(),
                    name: name.trim(),
                    role: role.trim(),
                    basePrice: price,
                    status: 'available'
                });
            }
        };

        // --- 2 Cr Data ---
        const raw2Cr = `
Virat Kohli,Batter,Rohit Sharma,Batter
MS Dhoni,WK-Batter,Jasprit Bumrah,Bowler
Rishabh Pant,WK-Batter,Shreyas Iyer,Batter
KL Rahul,WK-Batter,Hardik Pandya,All-Rounder
Suryakumar Yadav,Batter,Ravindra Jadeja,All-Rounder
Mitchell Starc,Bowler,Jos Buttler,WK-Batter
Arshdeep Singh,Bowler,Mohammed Shami,Bowler
Yuzvendra Chahal,Bowler,Mohammed Siraj,Bowler
Kagiso Rabada,Bowler,Liam Livingstone,All-Rounder
Glenn Maxwell,All-Rounder,Marcus Stoinis,All-Rounder
Rashid Khan,Bowler,Shubman Gill,Batter
Trent Boult,Bowler,Quinton de Kock,WK-Batter
Phil Salt,WK-Batter,David Warner,Batter
Faf du Plessis,Batter,Kane Williamson,Batter
Sam Curran,All-Rounder,Mitchell Marsh,All-Rounder
Harry Brook,Batter,Devon Conway,WK-Batter
Ishan Kishan,WK-Batter,Venkatesh Iyer,All-Rounder
Jake Fraser-McGurk,Batter,Aiden Markram,Batter
Harshal Patel,Bowler,Ravichandran Ashwin,All-Rounder
Bhuvneshwar Kumar,Bowler,Shardul Thakur,All-Rounder
Krunal Pandya,All-Rounder,Washington Sundar,All-Rounder
Axar Patel,All-Rounder,Kuldeep Yadav,Bowler
Pat Cummins,Bowler,Travis Head,Batter
Heinrich Klaasen,WK-Batter,Anrich Nortje,Bowler
Wanindu Hasaranga,All-Rounder,Maheesh Theekshana,Bowler
Adam Zampa,Bowler,Jofra Archer,Bowler
Josh Hazlewood,Bowler,T. Natarajan,Bowler
Khaleel Ahmed,Bowler,Avesh Khan,Bowler
Prasidh Krishna,Bowler,Noor Ahmad,Bowler
Will Jacks,All-Rounder,Tim David,Batter
Spencer Johnson,Bowler,Mustafizur Rahman,Bowler
Naveen-ul-Haq,Bowler,Umesh Yadav,Bowler
Tabraiz Shamsi,Bowler,Steve Smith,Batter
Jason Holder,All-Rounder,Chris Jordan,Bowler
Jonny Bairstow,WK-Batter,Rahmanullah Gurbaz,WK-Batter
Moeen Ali,All-Rounder,Daryl Mitchell,All-Rounder
Glenn Phillips,Batter,Gus Atkinson,Bowler
Rilee Rossouw,Batter,Tom Banton,WK-Batter
Fazalhaq Farooqi,Bowler,Gerald Coetzee,Bowler
David Willey,All-Rounder,Lockie Ferguson,Bowler
`;
        raw2Cr.trim().split('\n').forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 4) {
                add(parts[0], parts[1], 20000000);
                add(parts[2], parts[3], 20000000);
            }
        });

        // --- 1.50 Cr ---
        const raw150 = `
David Miller,Batter,1.50 Cr
Rachin Ravindra,All-Rounder,1.50 Cr
Rovman Powell,Batter,1.50 Cr
Ajinkya Rahane,Batter,1.50 Cr
Nitish Rana,All-Rounder,1.50 Cr
Azmatullah Omarzai,All-Rounder,1.50 Cr
Sherfane Rutherford,Batter,1.50 Cr
Mohammad Nabi,All-Rounder,1.50 Cr
`;
        raw150.trim().split('\n').forEach(line => {
            const p = line.split(',');
            if (p.length >= 2) add(p[0], p[1], 15000000);
        });

        // --- 1.25 Cr ---
        const raw125 = `
Marco Jansen,All-Rounder,1.25 Cr
Nathan Ellis,Bowler,1.25 Cr
James Anderson,Bowler,1.25 Cr
`;
        raw125.trim().split('\n').forEach(line => {
            const p = line.split(',');
            if (p.length >= 2) add(p[0], p[1], 12500000);
        });

        // --- 1.00 Cr ---
        const raw100 = `
Jitesh Sharma,WK-Batter,1.00 Cr
Rahul Chahar,Bowler,1.00 Cr
Mayank Agarwal,Batter,1.00 Cr
Akash Deep,Bowler,1.00 Cr
Tushar Deshpande,Bowler,1.00 Cr
Shahbaz Ahmed,All-Rounder,1.00 Cr
Jaydev Unadkat,Bowler,1.00 Cr
Alex Carey,WK-Batter,1.00 Cr
Ryan Rickelton,WK-Batter,1.00 Cr
`;
        raw100.trim().split('\n').forEach(line => {
            const p = line.split(',');
            if (p.length >= 2) add(p[0], p[1], 10000000);
        });

        // --- 75 Lakhs ---
        const raw75L = `
Prithvi Shaw,Batter,Rahul Tripathi,Batter
Manish Pandey,Batter,Deepak Hooda,All-Rounder
Sarfaraz Khan,Batter,R. Sai Kishore,Bowler
Umran Malik,Bowler,Ishant Sharma,Bowler
Nuwan Thushara,Bowler,Allah Ghazanfar,Bowler
Keshav Maharaj,Bowler,Donovan Ferreira,WK-Batter
K.S. Bharat,WK-Batter,Reece Topley,Bowler
Shamar Joseph,Bowler,Vijayakanth Viyaskanth,Bowler
Dewald Brevis,Batter,Matthew Breetzke,Batter
`;
        raw75L.trim().split('\n').forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 4) {
                add(parts[0], parts[1], 7500000);
                add(parts[2], parts[3], 7500000);
            }
        });

        // --- 30 Lakhs (Uncapped) ---
        const uncappedBatters = "Sameer Rizvi, Angkrish Raghuvanshi, Nehal Wadhera, Abhinav Manohar, Ashutosh Sharma, Ayush Badoni, Prerak Mankad, Karun Nair, Atharva Taide, Priyansh Arya, Ayush Mhatre, Shubham Dubey, Shaik Rasheed, Himmat Singh, Vansh Bedi, Swastik Chikara";
        uncappedBatters.split(',').forEach(n => add(n, 'Batter', 3000000));

        const uncappedAR = "Naman Dhir, Abdul Samad, Nitish Kumar Reddy, Ramandeep Singh, Anshul Kamboj, Nishant Sindhu, Arjun Tendulkar, Harpreet Brar, Swapnil Singh, Manoj Bhandage, Raj Angad Bawa, Suryansh Shedge, Prince Yadav, Yuvraj Chaudhary, Anukul Roy";
        uncappedAR.split(',').forEach(n => add(n, 'All-Rounder', 3000000));

        const uncappedBowlers = "Rasikh Dar, Vaibhav Arora, Yash Thakur, Vyshak Vijaykumar, Suyash Sharma, Mayank Yadav, Harshit Rana, Akash Madhwal, Simarjeet Singh, Kartik Tyagi, Mayank Markande, Shreyas Gopal, Manav Suthar, Mukesh Choudhary, Gurnoor Brar, Zeeshan Ansari, M. Siddharth, Digvesh Singh, Gurjapneet Singh, Kamlesh Nagarkoti";
        uncappedBowlers.split(',').forEach(n => add(n, 'Bowler', 3000000));

        const uncappedWK = "Kumar Kushagra, Robin Minz, Vishnu Vinod, Anuj Rawat, Luvnith Sisodia, Shrijith Krishnan, Aryan Juyal, Upendra Yadav";
        uncappedWK.split(',').forEach(n => add(n, 'WK-Batter', 3000000));

        await Player.insertMany(players);
        console.log(`Successfully seeded ${players.length} players!`);
        mongoose.connection.close();
        process.exit(0);

    } catch (err) {
        console.error('Seeding error:', err);
        mongoose.connection.close();
        process.exit(1);
    }
};

seedPlayers();
