const MongoClient = require('mongodb').MongoClient;
const { VERBOSE } = require("../index");

const user = "admin";
const pw = "q5xEsVlZsOwwimDs";
const clusterName = "cluster0.kt19q.mongodb.net";
const dbName = "nfl_data";

const getLatestStatWeek = async () => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();

        const result = await client.db(dbName).collection("latest_stat_week").findOne({});

        //  -- DEBUG
        if (VERBOSE) {
            console.log(result);
        }

        return result;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

const writeLatestStatWeek = async (latestYear, latestWeek) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    // client.connect(err => {
    //     const collection = client.db("test").collection("devices");
    //     // perform actions on the collection object
    //     client.close();
    // });

    try {
        // Connect to the MongoDB cluster
        await client.connect();

        // Make the appropriate DB calls
        const result = await client.db(dbName).collection("latest_stat_week").updateOne(
            {                   // Query parameter
                "placeholder": "abc"
            },
            {                   // Update document
                $setOnInsert: { placeholder: "abc" },
                $set: {
                    week: latestWeek,
                    year: latestYear
                },
            },
            { upsert: true }    // Options
        );

        if (VERBOSE) {
            console.log(`${result.upsertedCount} new listing(s) created.`);
            console.log(`${result.modifiedCount} listing(s) modified.`);
        }

        return true;

    } catch (e) {
        console.error(e);
        return false;
    } finally {
        await client.close();
    }
}

const writeStats = async (stats) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    // client.connect(err => {
    //     const collection = client.db("test").collection("devices");
    //     // perform actions on the collection object
    //     client.close();
    // });

    try {
        // Connect to the MongoDB cluster
        await client.connect();

        let totalUpserted = 0, totalModified = 0;
        for (const stat of stats) {
            const result = await client.db(dbName).collection("weekly_stats").updateOne(
                {                   // Query parameter
                    year: stat.year,
                    week: stat.week,
                    homeTeam: stat.homeTeam,
                    awayTeam: stat.awayTeam
                },
                {                   // Update document
                    $setOnInsert: {
                        year: stat.year,
                        week: stat.week,
                        homeTeam: stat.homeTeam,
                        awayTeam: stat.awayTeam
                    },
                    $set: {
                        stats: stat.stats
                    }
                },
                { upsert: true }    // Options
            );
            totalUpserted += result.upsertedCount;
            totalModified += result.modifiedCount;
        }

        if (VERBOSE) {
            console.log(`${totalUpserted} new listing(s) created.`);
            console.log(`${totalModified} listing(s) modified.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
};

const getStoredGameData = async (year, week, homeTeam, awayTeam) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();

        const result = await client.db(dbName).collection("weekly_stats")
            .findOne({                   // Query parameter
                $and: [
                    { "year": year },
                    { "week": week },
                    { "homeTeam": homeTeam },
                    { "awayTeam": awayTeam }
                ]
            });
        // console.log(JSON.stringify(result));
        return result;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

// -- this is where the prediction algorithm is that we need to work on
const getRelevantGamesData = async (weekNumber, numberOfWeeks, teamA, teamB) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    let year = new Date().getFullYear();
    let week = weekNumber;

    // const avgData = [];
    const weeks = [];
    try {
        await client.connect();

        let avgData = {};
        for (let i = 1; i <= numberOfWeeks; i++) {
            week = week - 1;
            if (week < 1) {
                year = year - 1;
                week = 17;  // -- should we reset to 17 (end of regular season) or reset in the post season (18-21)???
            }
            if (VERBOSE) {
                console.log(`Year: ${year}, Week: ${week}`);
            }

            const results = await client.db(dbName).collection("weekly_stats")
                .find({
                    $and: [
                        { "week": week },
                        { "year": year },
                        {
                            $or: [
                                { "homeTeam": teamA },
                                { "homeTeam": teamB },
                                { "awayTeam": teamA },
                                { "awayTeam": teamB }
                            ]
                        },
                    ]
                }).toArray();

            if (!results || results.length === 0) {
                console.log(`Data for ${year} - Week ${week} - ${teamA} vs ${teamB} not found in database.`);
                weeks.push({
                    week,
                    year,
                    games: []
                });
            } else {
                weeks.push({
                    week,
                    year,
                    games: results
                });

                // results.forEach(result => {
                //     const game = result.stats;
                //     game["homeTeam"] = result.homeTeam;
                //     game["awayTeam"] = result.awayTeam;

                //     // -- total up relevant offensive data
                //     game.offense.filter(player => player.team === teamA || player.team === teamB).forEach(player => {

                //         // -- DEBUG
                //         // console.log(player.player);

                //         if (!avgData[player.player]) {
                //             avgData[player.player] = {
                //                 team: player.team,
                //                 totalPassingTD: parseInt(player.pass_td || 0),
                //                 totalPassingYards: parseInt(player.pass_yds || 0),
                //                 totalRushingTD: parseInt(player.rush_td || 0),
                //                 totalRushingYards: parseInt(player.rush_yds || 0),
                //                 totalReceivingTD: parseInt(player.rec_td || 0),
                //                 totalReceivingYards: parseInt(player.rec_yds || 0),
                //                 totalReceptions: parseInt(player.rec || 0),
                //                 totalInterceptions: parseInt(player.pass_int || 0),
                //                 totalFumblesLost: parseInt(player.fumbles_lost || 0),
                //                 weeksPlayed: 1,
                //                 weeks: [`${year} - Week ${week}`]
                //             }
                //         } else {
                //             avgData[player.player].totalPassingTD += parseInt(player.pass_td || 0);
                //             avgData[player.player].totalPassingYards += parseInt(player.pass_yds || 0);
                //             avgData[player.player].totalRushingTD += parseInt(player.rush_td || 0);
                //             avgData[player.player].totalRushingYards += parseInt(player.rush_yds || 0);
                //             avgData[player.player].totalReceivingTD += parseInt(player.rec_td || 0);
                //             avgData[player.player].totalReceivingYards += parseInt(player.rec_yds || 0);
                //             avgData[player.player].totalReceptions += parseInt(player.rec || 0);
                //             avgData[player.player].totalInterceptions += parseInt(player.pass_int || 0);
                //             avgData[player.player].totalFumblesLost += parseInt(player.fumbles_lost || 0);

                //             const weeksString = `${year} - Week ${week}`;
                //             if (!avgData[player.player]["weeks"].includes(weeksString)) {
                //                 avgData[player.player].weeksPlayed += 1;
                //                 avgData[player.player]["weeks"].push(weeksString);
                //             }
                //         }
                //     });

                //     // -- total up relevant return data
                //     game.returns.filter(player => player.team === teamA || player.team === teamB).forEach(player => {
                //         if (!avgData[player.player]) {
                //             avgData[player.player] = {
                //                 team: player.team,
                //                 totalKickReturnTD: parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0),
                //                 weeksPlayed: 1,
                //                 weeks: [`${year} - Week ${week}`]
                //             }
                //         } else {
                //             avgData[player.player].totalKickReturnTD = (avgData[player.player].totalKickReturnTD || 0) +
                //                 parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0);

                //             const weeksString = `${year} - Week ${week}`;
                //             if (!avgData[player.player]["weeks"].includes(weeksString)) {
                //                 avgData[player.player].weeksPlayed += 1;
                //                 avgData[player.player]["weeks"].push(weeksString);
                //             }
                //         }
                //     });

                //     // -- total up relevant kicking data
                //     game.kicking.filter(player => player.team === teamA || player.team === teamB).forEach(player => {
                //         if (!avgData[player.player]) {
                //             avgData[player.player] = {
                //                 team: player.team,
                //                 totalExtraPoints: parseInt(player.xpm || 0),
                //                 totalFieldGoals: parseInt(player.fgm || 0),
                //                 weeksPlayed: 1,
                //                 weeks: [`${year} - Week ${week}`]
                //             }
                //         } else {
                //             avgData[player.player].totalExtraPoints = (avgData[player.player].totalExtraPoints || 0) +
                //                 parseInt(player.xpm || 0);
                //             avgData[player.player].totalFieldGoals = (avgData[player.player].totalFieldGoals || 0) +
                //                 parseInt(player.fgm || 0);

                //             const weeksString = `${year} - Week ${week}`;
                //             if (!avgData[player.player]["weeks"].includes(weeksString)) {
                //                 avgData[player.player].weeksPlayed += 1;
                //                 avgData[player.player]["weeks"].push(weeksString);
                //             }
                //         }
                //     });

                //     // -- total up relevant DST data
                //     if (game.homeTeam === teamA || game.homeTeam === teamB) {
                //         if (!avgData[`${game.homeTeam}-DST`]) {
                //             avgData[`${game.homeTeam}-DST`] = {
                //                 team: game.homeTeam,
                //                 totalDraftKingsPoints: parseInt(game["draftKings"]
                //                     .find(player => player.name === `${game.homeTeam}-DST`).draftKingsPoints || 0)
                //             }
                //         } else {
                //             avgData[`${game.homeTeam}-DST`].totalDraftKingsPoints += parseInt(game["draftKings"]
                //                 .find(player => player.name.includes(`${game.homeTeam}-DST`)).draftKingsPoints || 0);
                //         }

                //     } else if (game.awayTeam === teamA || game.awayTeam === teamB) {
                //         if (!avgData[`${game.awayTeam}-DST`]) {
                //             avgData[`${game.awayTeam}-DST`] = {
                //                 team: game.awayTeam,
                //                 totalDraftKingsPoints: parseInt(game["draftKings"]
                //                     .find(player => player.name === `${game.awayTeam}-DST`).draftKingsPoints || 0)
                //             }
                //         } else {
                //             avgData[`${game.awayTeam}-DST`].totalDraftKingsPoints += parseInt(game["draftKings"]
                //                 .find(player => player.name.includes(`${game.awayTeam}-DST`)).draftKingsPoints || 0);
                //         }
                //     }
                // });
            }
        }

        // // -- calculate weekly average
        // Object.keys(avgData).forEach(player => {
        //     Object.keys(avgData[player]).filter(key => key !== "team" && !key.includes("weeks")).forEach(key => {
        //         const newKey = `avg${key.split("total")[1]}`;
        //         const weeksPlayed = player.includes("-DST") ? numberOfWeeks : avgData[player].weeksPlayed;
        //         avgData[player][newKey] = avgData[player][key] / (weeksPlayed * 1.0);
        //     });
        // });

        // return avgData;

        return weeks;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

    return avgData;
}

const storePlayerSalaries = async (playerSalaries, week, homeTeam, awayTeam) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    let year = new Date().getFullYear();

    try {
        await client.connect();

        const result = await client.db(dbName).collection("game_salaries").updateOne(
            {                   // Query parameter
                $and: [
                    { "week": week },
                    { "year": year },
                    { "homeTeam": homeTeam },
                    { "awayTeam": awayTeam }
                ]
            },
            {                   // Update document
                $setOnInsert: { week, year, homeTeam, awayTeam },
                $set: { playerSalaries },
            },
            { upsert: true }    // Options
        );

        // if (VERBOSE) {
        console.log(`${result.upsertedCount} new listing(s) created.`);
        console.log(`${result.modifiedCount} listing(s) modified.`);
        // }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

const retrievePlayerSalaries = async (year, week, teamA, teamB) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();

        const result = await client.db(dbName).collection("game_salaries").findOne(
            {                   // Query parameter
                $and: [
                    { "week": week },
                    { "year": year },
                    { $or: [{ "homeTeam": teamA }, { "homeTeam": teamB },] },
                    { $or: [{ "awayTeam": teamA }, { "awayTeam": teamB },] }
                ]
            }
        );

        return result.playerSalaries;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

const retrieveAllPlayerSalaries = async () => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();

        const result = await client.db(dbName).collection("game_salaries").find({}).toArray();
        // console.log(JSON.stringify(result));
        return result;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

module.exports.getLatestStatWeek = getLatestStatWeek;
module.exports.writeLatestStatWeek = writeLatestStatWeek;
module.exports.writeStats = writeStats;
module.exports.getStoredGameData = getStoredGameData;
module.exports.getRelevantGamesData = getRelevantGamesData;
module.exports.storePlayerSalaries = storePlayerSalaries;
module.exports.retrievePlayerSalaries = retrievePlayerSalaries;
module.exports.retrieveAllPlayerSalaries = retrieveAllPlayerSalaries;