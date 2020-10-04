const MongoClient = require('mongodb').MongoClient;

const user = "admin";
const pw = "q5xEsVlZsOwwimDs";
const clusterName = "cluster0.kt19q.mongodb.net";
const dbName = "nfl_data";
const connectDB = async () => {
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
        await listDatabases(client);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

const listDatabases = async (client) => {
    databasesList = await client.db().admin().listDatabases();

    console.log("Databases:");
    databasesList.databases.forEach(db => console.log(` - ${db.name}`));
};

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

        // Make the appropriate DB calls
        const result = await client.db(dbName).collection("weekly_stats").insertMany(stats);

        console.log(`${result.insertedCount} new listing(s) created.`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
};

const getAverageData = async (weekNumber, numberOfWeeks, teamA, teamB) => {
    const uri = `mongodb+srv://${user}:${pw}@${clusterName}/${dbName}?retryWrites=true&w=majority`;
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    let year = new Date().getFullYear();
    let week = weekNumber;

    const avgData = [];
    try {
        await client.connect();

        let avgData = {};
        for (let i = 1; i <= numberOfWeeks; i++) {
            week = week - 1;
            if (week < 1) {
                year = year - 1;
                week = 17;  // -- should we reset to 17 (end of regular season) or reset in the post season (18-21)???
            }
            console.log(`Year: ${year}, Week: ${week}`);

            // -- get stats filtered by week
            const result = await client.db(dbName).collection("weekly_stats")
                // .find({ $and: [{ "week": currentWeek }, { "year": year }, { $or: [{ "team": teamA }, { "team": teamB }] }] }).toArray();
                .find({ $and: [{ "week": week }, { "year": year }] }).toArray();

            // -- grab relevant games from results
            result.forEach(gameWeek => {
                gameWeek.games.filter(game => {
                    return game.homeTeam === teamA || game.homeTeam === teamB ||
                        game.awayTeam === teamA || game.awayTeam === teamB;
                }).forEach(game => {
                    // -- total up relevant offensive data
                    game.offense.filter(player => player.team === teamA || player.team === teamB).forEach(player => {

                        // -- DEBUG
                        // console.log(player.player);

                        if (!avgData[player.player]) {
                            avgData[player.player] = {
                                team: player.team,
                                totalPassingTD: parseInt(player.pass_td || 0),
                                totalPassingYards: parseInt(player.pass_yds || 0),
                                totalRushingTD: parseInt(player.rush_td || 0),
                                totalRushingYards: parseInt(player.rush_yds || 0),
                                totalReceivingTD: parseInt(player.rec_td || 0),
                                totalReceivingYards: parseInt(player.rec_yds || 0),
                                totalReceptions: parseInt(player.rec || 0),
                                totalInterceptions: parseInt(player.pass_int || 0),
                                totalFumblesLost: parseInt(player.fumbles_lost || 0),
                                weeksPlayed: 1,
                                weeks: [`${year} - Week ${week}`]
                            }
                        } else {
                            avgData[player.player].totalPassingTD += parseInt(player.pass_td || 0);
                            avgData[player.player].totalPassingYards += parseInt(player.pass_yds || 0);
                            avgData[player.player].totalRushingTD += parseInt(player.rush_td || 0);
                            avgData[player.player].totalRushingYards += parseInt(player.rush_yds || 0);
                            avgData[player.player].totalReceivingTD += parseInt(player.rec_td || 0);
                            avgData[player.player].totalReceivingYards += parseInt(player.rec_yds || 0);
                            avgData[player.player].totalReceptions += parseInt(player.rec || 0);
                            avgData[player.player].totalInterceptions += parseInt(player.pass_int || 0);
                            avgData[player.player].totalFumblesLost += parseInt(player.fumbles_lost || 0);
                            avgData[player.player].weeksPlayed += 1;
                            avgData[player.player]["weeks"].push(`${year} - Week ${week}`);
                        }
                    });

                    // -- total up relevant return data
                    game.returns.filter(player => player.team === teamA || player.team === teamB).forEach(player => {
                        if (!avgData[player.player]) {
                            avgData[player.player] = {
                                team: player.team,
                                totalKickReturnTD: parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0),
                                weeksPlayed: 1,
                                weeks: [`${year} - Week ${week}`]
                            }
                        } else {
                            avgData[player.player].totalKickReturnTD = (avgData[player.player].totalKickReturnTD || 0) +
                                parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0);
                            avgData[player.player].weeksPlayed += 1;
                            avgData[player.player]["weeks"].push(`${year} - Week ${week}`);
                        }
                    });

                    // -- TODO: total up relevant kicking data

                    // -- TODO: total up relevant defenseive data (might be taken care of in next section)

                    // -- total up relevant DST data
                    if (game.homeTeam === teamA || game.homeTeam === teamB) {
                        if (!avgData[`${game.homeTeam}-DST`]) {
                            avgData[`${game.homeTeam}-DST`] = {
                                team: game.homeTeam,
                                // totalDraftKingsPoints: parseInt(game["homeTeamDstTotal"].draftKingsPoints || 0)
                                totalDraftKingsPoints: parseInt(game["draftKings"]
                                    .find(player => player.name.includes(`${game.homeTeam}-DST`)).draftKingsPoints || 0)
                            }
                        } else {
                            // avgData[`${game.homeTeam}-DST`].totalDraftKingsPoints += parseInt(game["homeTeamDstTotal"].draftKingsPoints || 0);
                            avgData[`${game.homeTeam}-DST`].totalDraftKingsPoints += parseInt(game["draftKings"]
                                .find(player => player.name.includes(`${game.homeTeam}-DST`)).draftKingsPoints || 0);
                        }
                    } else if (game.awayTeam === teamA || game.awayTeam === teamB) {
                        if (!avgData[`${game.awayTeam}-DST`]) {
                            avgData[`${game.awayTeam}-DST`] = {
                                team: game.awayTeam,
                                // totalDraftKingsPoints: parseInt(game["awayTeamDstTotal"].draftKingsPoints || 0)
                                totalDraftKingsPoints: parseInt(game["draftKings"]
                                    .find(player => player.name.includes(`${game.awayTeam}-DST`)).draftKingsPoints || 0)
                            }
                        } else {
                            // avgData[`${game.awayTeam}-DST`].totalDraftKingsPoints += parseInt(game["awayTeamDstTotal"].draftKingsPoints || 0);
                            avgData[`${game.awayTeam}-DST`].totalDraftKingsPoints += parseInt(game["draftKings"]
                                .find(player => player.name.includes(`${game.awayTeam}-DST`)).draftKingsPoints || 0);
                        }
                    }
                })
            });

            // // -- calculate weekly average
            // Object.keys(avgData).forEach(player => {
            //     Object.keys(avgData[player]).filter(key => key !== "team" && !key.includes("weekAvg")).forEach(key => {
            //         const newKey = `${i}-weekAvg${key.split("total")[1]}`;
            //         avgData[player][newKey] = avgData[player][key] / (i * 1.0);
            //     });
            // });
        }

        // -- calculate weekly average
        Object.keys(avgData).forEach(player => {
            Object.keys(avgData[player]).filter(key => key !== "team").forEach(key => {
                const newKey = `avg${key.split("total")[1]}`;
                const weeksPlayer = player.includes("-DST") ? numberOfWeeks : avgData[player].weeksPlayed;
                avgData[player][newKey] = avgData[player][key] / (weeksPlayer * 1.0);
            });
        });

        // -- calculate averages
        // Object.keys(avgData).forEach(player => {
        //     Object.keys(avgData[player]).filter(key => key !== "team").forEach(key => {
        //         const newKey = `avg${key.split("total")[1]}`;
        //         avgData[player][newKey] = avgData[player][key] / numberOfWeeks;
        //     });
        // });

        // -- DEBUG
        // console.log(JSON.stringify(avgData));
        return avgData;

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

    return avgData;
}

module.exports.writeStats = writeStats;
module.exports.getAverageData = getAverageData;