const { performance } = require('perf_hooks');

// const { TEAM_ABBRV, getStats } = require("./utility/espn");
const {
    TEAM_ABBRV,
    getStats
} = require("./utility/pro-football-ref");
const {
    getLatestStatWeek,
    writeLatestStatWeek,
    writeStats,
    getRelevantGamesData,
    getStoredGameData,
    storePlayerSalaries,
    retrievePlayerSalaries,
    retrieveAllPlayerSalaries
} = require("./utility/mongo");
const {
    getDraftKingsValue,
    getPlayerSalaries,
    getCurrentGames
} = require("./utility/draft-kings");

const VERBOSE = true;

// const testSalaries = require("./game-salaries.json");

/*
 * TODOS
 * 1) Create another script that generates the best DraftKings teams for each game we have stored in the DB (ignore DK salaries for now)
 *      - create a new table to store these in
 * 2) Compare results generated from "generate-team" to the values above
 *      - start to work on tweaking an algorithm to get the most consistent results (# of week we look back, contribution % of each week, etc)
 * 3) Figure out how to work in DraftKings salaries
 * 4) References for further strategy development
 *      - http://www.sloansportsconference.com/wp-content/uploads/2014/06/DraftKings.pdf
 */

const updateStats = async () => {
    // -- retrieve last week that has data
    const latestStatWeek = await getLatestStatWeek();

    let stats = [], latestYear, latestWeek;
    if (latestStatWeek) {
        // -- grab any data from that week forward (in case we missed a game that week)
        [stats, latestYear, latestWeek] = await getStats(latestStatWeek.year, latestStatWeek.week);
    } else {
        // -- grab all data
        [stats, latestYear, latestWeek] = await getStats(-1, -1);
    }

    // -- write latest stats to database
    const success = await writeLatestStatWeek(latestYear, latestWeek);
    if (success) {
        await writeStats(stats);
    } else {
        console.log("Error writing latest stat week to database");
    }
}

const generateTeam = async (weekNumber, numberOfWeeks, teamA, teamB, keepPlayers = [], removePlayers = [], useOldWay = false) => {

    console.log(`Generating team for week ${weekNumber} - ${teamA} vs ${teamB}...`);
    console.log(`Including players: ${JSON.stringify(keepPlayers)}`);
    console.log(`Ignoring players: ${JSON.stringify(removePlayers)}`);

    // -- retrieve data and build out weekly averages
    // *** this is where the prediction algorithm is that we need to work on ***
    let playerStats = [];
    if (!useOldWay) {
        // DKPlayers = await getAverageData(weekNumber, numberOfWeeks, teamA, teamB);
        playerStats = await getAverageData(weekNumber, teamA, teamB);

        playerStats = playerStats.map(player => {
            return {
                ...player,
                ignorePlayer: removePlayers.includes(player.name.trim().toLowerCase())
            };
        });
    } else {
        const avgData = await getAverageDataOld(weekNumber, numberOfWeeks, teamA, teamB);

        // -- calculate DraftKings points based on rules and remove designated players
        playerStats = getDraftKingsValue(avgData, numberOfWeeks).map(player => {
            return {
                ...player,
                ignorePlayer: removePlayers.includes(player.name.trim().toLowerCase())
            };
        });
    }

    let playerSalaries = [];
    let homeTeam, awayTeam;

    // -- retrieve stored player salaries from draft-kings
    [playerSalaries, homeTeam, awayTeam] = await getPlayerSalaries(teamA, teamB);

    // -- store data in mongo
    await storePlayerSalaries(playerSalaries, weekNumber, homeTeam, awayTeam);

    // -- DEBUG
    const lineups = {
        [teamA]: {},
        [teamB]: {}
    };
    playerSalaries.forEach(player => {
        switch (player.position) {
            case "QB":
                if (!lineups[player.team]["QB"]) {
                    lineups[player.team]["QB"] = player.name;
                }
                break;
            case "RB":
                if (!lineups[player.team]["RB1"]) {
                    lineups[player.team]["RB1"] = player.name;
                } else if (!lineups[player.team]["RB2"]) {
                    lineups[player.team]["RB2"] = player.name;
                } else if (!lineups[player.team]["RB3"]) {
                    lineups[player.team]["RB3"] = player.name;
                }
                break;
            case "WR":
                if (!lineups[player.team]["WR1"]) {
                    lineups[player.team]["WR1"] = player.name;
                } else if (!lineups[player.team]["WR2"]) {
                    lineups[player.team]["WR2"] = player.name;
                } else if (!lineups[player.team]["WR3"]) {
                    lineups[player.team]["WR3"] = player.name;
                } else if (!lineups[player.team]["WR4"]) {
                    lineups[player.team]["WR4"] = player.name;
                }
                break;
            case "K":
                if (!lineups[player.team]["K"]) {
                    lineups[player.team]["K"] = player.name;
                }
                break;
            case "TE":
                if (!lineups[player.team]["TE1"]) {
                    lineups[player.team]["TE1"] = player.name;
                } else if (!lineups[player.team]["TE2"]) {
                    lineups[player.team]["TE2"] = player.name;
                }
                break;
            case "DST":
                if (!lineups[player.team]["DST"]) {
                    lineups[player.team]["DST"] = player.name;
                }
                break;
        }
    });
    console.log(`Lineups: ${JSON.stringify(lineups)}`);


    // -- TEMP for comparing our predicted value vs DK's FPPG
    // playerSalaries.sort((a, b) => {
    //     return a.dkPPG > b.dkPPG ? -1 : 1;
    // })
    // console.log();
    // console.log(JSON.stringify(playerSalaries));
    // const tempList = playerStats.sort((a, b) => {
    //     return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    // }).map(player => {
    //     return {
    //         name: player.name,
    //         team: player.team,
    //         draftKingsPoints: player.draftKingsPoints
    //     }
    // })
    // console.log();
    // console.log(JSON.stringify(tempList));


    console.log();
    // -- TEMP - to cut down on number of players looping through
    const topPredictedTeams = getTopTeams(playerStats, playerSalaries);
    // const topPredictedTeams = getTopTeams(playerStats.slice(0, -10), playerSalaries);

    // -- filter only teams that contains players in "keepPlayers" array
    const filteredTopPredictedTeams = topPredictedTeams.filter(team => {

        // console.log(`Team: ${JSON.stringify(team)}`);
        // console.log(`KeepPlayers: ${JSON.stringify(keepPlayers)}`);

        let containsAllPlayers = true;
        for (const keepPlayer of keepPlayers) {
            let containsPlayer = false;
            for (const position in team) {

                // console.log(`Player: ${team[position].player}`);

                // if (team[position].player && team[position].player === keepPlayer) {
                if (team[position].player && namesAreEqual2(team[position].player, keepPlayer)) {
                    containsPlayer = true;
                    break;
                }
            }

            // console.log(`Contains player: ${containsPlayer}`);

            // -- skip team if a single "keepPlayer" is not found
            if (!containsPlayer) {
                return false;
                // containsAllPlayers = false;
                // break;
            }
        }

        // return containsAllPlayers;
        return true;
    });

    console.log();
    const numberOfTeams = 10;
    console.log(JSON.stringify(filteredTopPredictedTeams.slice(0, numberOfTeams + 1)));
};

const storeSalaryData = async (week) => {
    // -- get current DraftKings games
    const weeklyTeams = await getCurrentGames();

    for (const gameTeams of weeklyTeams) {
        // -- retrieve DraftKings salary lineups
        [playerSalaries, homeTeam, awayTeam] = await getPlayerSalaries(gameTeams[0], gameTeams[1]);

        // -- store data in mongo
        storePlayerSalaries(playerSalaries, week, homeTeam, awayTeam);
    }
};

const runPlayerAlgorithmTest = async () => {
    // 1) pull stored DraftKings salary (doing this because this will be the limiter in available data, not statisical data)

    // -- retrieve stored player salaries from mongo
    const storedDkGames = await retrieveAllPlayerSalaries();

    // -- DEBUG
    // console.log(JSON.stringify([storedDkGames[0]]));

    // 2) pull stored statistical data based on year/week/teams from the DK salary data and merge

    // -- loop through storedDKGames to grab statistics by year/week/teams
    // for (const dkGame of storedDkGames) {
    for (const dkGame of storedDkGames.slice(0, 1)) {  // -- DEBUG - temp for testing
        // -- get actual stats for the particular game
        const actualGameData = await getStoredGameData(dkGame.year, dkGame.week, dkGame.homeTeam, dkGame.awayTeam);
        if (!actualGameData) {
            console.log(`No game data found, skipping...`);
            continue;
        }

        // -- get predicted stats for particular game
        const numberOfWeeks = 3;
        const useOldWay = false;
        let predictedGameData = [];
        if (useOldWay) {
            const avgStatData = await getAverageDataOld(dkGame.week, numberOfWeeks, dkGame.homeTeam, dkGame.awayTeam);
            predictedGameData = getDraftKingsValue(avgStatData, numberOfWeeks);
        } else {
            // predictedGameData = await getAverageData(dkGame.week, numberOfWeeks, dkGame.homeTeam, dkGame.awayTeam);
            predictedGameData = await getAverageData(dkGame.week, dkGame.homeTeam, dkGame.awayTeam);
        }

        let dkPlayers = actualGameData.stats.draftKings.map(actualPlayer => {
            const matchingPlayer = predictedGameData.find(predictedPlayer => predictedPlayer.name === actualPlayer.name);
            if (matchingPlayer) {
                return {
                    name: actualPlayer.name,
                    team: actualPlayer.team,
                    actualPoints: actualPlayer.draftKingsPoints,
                    predictedPoints: matchingPlayer.draftKingsPoints
                }
            } else {
                console.log(`***** no matching player for: ${actualPlayer.name}`);
                return null;
            }
        }).filter(player => !!player);

        // -- add actual and predicted position values
        dkPlayers = [...dkPlayers].sort((a, b) => {
            return a.actualPoints > b.actualPoints ? -1 : 1;
        }).map((player, index) => {
            player["actualPosition"] = index + 1;
            return player;
        });
        dkPlayers = [...dkPlayers].sort((a, b) => {
            return a.predictedPoints > b.predictedPoints ? -1 : 1;
        }).map((player, index) => {
            player["predictedPosition"] = index + 1;
            return player;
        });

        const actualSorted = [...dkPlayers].sort((a, b) => {
            return a.actualPoints > b.actualPoints ? -1 : 1;
        });
        const predictedSorted = [...dkPlayers].sort((a, b) => {
            return a.predictedPoints > b.predictedPoints ? -1 : 1;
        });


        if (VERBOSE) {
            // -- DEBUG
            console.log();
            console.log(`Actual Points: ${JSON.stringify(actualSorted)}`);
            console.log();
            console.log(`Predicted Points: ${JSON.stringify(predictedSorted)}`);
        }
    }

    // 4) display top 10? 20? 100? 

    // 5) now repeat the process using generateTeam() call to see what we "predicted" and compare the results
};

const runTeamAlgorithmTest = async () => {
    // 1) pull stored DraftKings salary (doing this because this will be the limiter in available data, not statisical data)

    // -- retrieve stored player salaries from mongo
    const storedDkGames = await retrieveAllPlayerSalaries();

    // -- DEBUG
    // console.log(JSON.stringify([storedDkGames[0]]));

    // 2) pull stored statistical data based on year/week/teams from the DK salary data and merge

    // -- loop through storedDKGames to grab statistics by year/week/teams
    const positions = [];
    // for (const dkGame of storedDkGames) {
    for (const dkGame of storedDkGames.slice(0, 1)) {  // -- DEBUG - temp for testing
        console.log(`Game: ${dkGame.year} - Week ${dkGame.week}, ${dkGame.homeTeam} vs ${dkGame.awayTeam}`);
        // -- get actual stats for the particular game
        const gameData = await getStoredGameData(dkGame.year, dkGame.week, dkGame.homeTeam, dkGame.awayTeam);
        if (!gameData) {
            console.log(`No game data found, skipping...`);
            continue;
        }

        // -- DEBUG
        // console.log(JSON.stringify(gameData));

        // intermediate step - display the top team (within the salary cap)


        // (steps 3 and 4 are probably going to look very similar to what we do in part of the "generateTeam()" function)
        // 3) build out list of all possible teams under salary cap
        const isActualData = true;
        const topActualTeams = getTopTeams(gameData.stats.draftKings, dkGame.playerSalaries, isActualData);

        // -- get predicted stats for particular game
        const numberOfWeeks = 3;
        const useOldWay = false;
        let DKPlayers = [];
        if (useOldWay) {
            const avgStatData = await getAverageDataOld(dkGame.week, numberOfWeeks, dkGame.homeTeam, dkGame.awayTeam);
            DKPlayers = getDraftKingsValue(avgStatData, numberOfWeeks);
        } else {
            // DKPlayers = await getAverageData(dkGame.week, numberOfWeeks, dkGame.homeTeam, dkGame.awayTeam);
            DKPlayers = await getAverageData(dkGame.week, dkGame.homeTeam, dkGame.awayTeam);
        }

        let topPredictedTeams = getTopTeams(DKPlayers, dkGame.playerSalaries);

        // how far down to we have to go to match the team?
        let predictedTeamPosition = -1;
        for (let i = 0; i < topPredictedTeams.length; i++) {
            // if (topPredictedTeams[i].totalDraftKingsPoints >= topActualTeams[0].totalDraftKingsPoints) {
            //     predictedTeamPosition = i;
            //     break;
            // }

            if (predictedTeamPosition > -1) break;
            if (topPredictedTeams[i].captain.player === topActualTeams[0].captain.player) {
                let playersFound = {
                    "flex1": false,
                    "flex2": false,
                    "flex3": false,
                    "flex4": false,
                    "flex5": false,
                }
                for (let j = 1; j <= 5; j++) {
                    if (!topPredictedTeams[i][`flex${j}`]) {
                        console.log(`Missing flex player ${j} in team: ${JSON.stringify(topPredictedTeams[i])}`);
                        break;
                    }
                    for (let k = 1; k <= 5; k++) {
                        if (!topActualTeams[0][`flex${k}`]) {
                            console.log(`Missing flex player ${k} in team: ${JSON.stringify(topActualTeams[0])}`);
                            break;
                        }
                        if (topPredictedTeams[i][`flex${j}`].player === topActualTeams[0][`flex${k}`].player) {
                            playersFound[`flex${j}`] = true;
                            break;
                        }
                    }
                    if (!playersFound[`flex${j}`]) {
                        // -- player not found at all, jump to next team
                        break;
                    }
                }

                if (playersFound["flex1"] && playersFound["flex2"] && playersFound["flex3"] && playersFound["flex4"] && playersFound["flex5"]) {
                    predictedTeamPosition = i;
                    // topPredictedTeams[predictedTeamPosition]["differenceFromMatchingTeam"] = topActualTeams
                    break;
                }
            }
        }
        positions.push([predictedTeamPosition, topPredictedTeams.length]);

        // -- loop through and match teams, then compare actual vs predicted point difference
        // for (let x = 0; x < topPredictedTeams.length; x++) {
        for (let x = 0; x < 100; x++) {
            topTeamPosition = -1;
            for (let i = 0; i < topActualTeams.length; i++) {
                if (topTeamPosition > -1) break;
                if (topActualTeams[i].captain.player === topPredictedTeams[x].captain.player) {
                    let playersFound = {
                        "flex1": false,
                        "flex2": false,
                        "flex3": false,
                        "flex4": false,
                        "flex5": false,
                    }
                    for (let j = 1; j <= 5; j++) {
                        if (!topActualTeams[i][`flex${j}`]) {
                            console.log(`Missing flex player ${j} in team: ${JSON.stringify(topActualTeams[i])}`);
                            break;
                        }
                        for (let k = 1; k <= 5; k++) {
                            if (!topPredictedTeams[x][`flex${k}`]) {
                                console.log(`Missing flex player ${k} in team: ${JSON.stringify(topPredictedTeams[x])}`);
                                break;
                            }
                            if (topActualTeams[i][`flex${j}`].player === topPredictedTeams[x][`flex${k}`].player) {
                                playersFound[`flex${j}`] = true;
                                break;
                            }
                        }
                        if (!playersFound[`flex${j}`]) {
                            // -- player not found at all, jump to next team
                            break;
                        }
                    }

                    if (playersFound["flex1"] && playersFound["flex2"] && playersFound["flex3"] && playersFound["flex4"] && playersFound["flex5"]) {
                        topTeamPosition = i;
                        topPredictedTeams[x]["actualPoints"] = topActualTeams[i].totalDraftKingsPoints;
                        topPredictedTeams[x]["differenceFromMatchingTeam"] = topActualTeams[i].totalDraftKingsPoints - topPredictedTeams[x].totalDraftKingsPoints;

                        // -- DEBUG
                        console.log("REACHED HERE: " + x);
                        console.log(JSON.stringify(topPredictedTeams[x]));

                        break;
                    }
                }
            }
        }

        if (VERBOSE) {
            topPredictedTeams.forEach(predictedTeam => {
                predictedTeam["differenceFromTop"] = topActualTeams[0].totalDraftKingsPoints - predictedTeam.totalDraftKingsPoints;
            });

            // -- DEBUG
            console.log();
            console.log(`Top actual teams: ${JSON.stringify(topActualTeams.slice(0, 1))}`);
            console.log();
            // console.log(`Top predicted teams: ${JSON.stringify(topPredictedTeams.filter(team => team.captain.player === topActualTeams[0].captain.player).slice(0, 101))}`);
            console.log(`Top predicted teams: ${JSON.stringify(topPredictedTeams.slice(0, 101))}`);
        }
    }

    console.log();
    for (const [position, length] of positions) {
        console.log(`Position: ${position} out of ${length}`);
    }

    // 4) display top 10? 20? 100? 

    // 5) now repeat the process using generateTeam() call to see what we "predicted" and compare the results
};

// const getAverageData = async (weekNumber, numberOfWeeks, teamA, teamB) => {
const getAverageData = async (weekNumber, teamA, teamB) => {
    const numberOfWeeks = 17;
    const weeks = await getRelevantGamesData(weekNumber, numberOfWeeks, teamA, teamB);

    const averagePlayerData = {};

    // -- loop through each week
    // TEMP - switch this to for/of loop if making async calls inside
    weeks.forEach(gameWeek => {
        // -- loop through each game
        gameWeek.games.forEach(game => {
            // -- average out DK points (trying this instead of calculating all stats and building points off of there)
            game.stats.draftKings
                // -- filter out irrelevant players picked up from past game week data
                .filter(draftKingsPlayer => draftKingsPlayer.team === teamA || draftKingsPlayer.team === teamB)
                .forEach(draftKingsPlayer => {
                    if (!averagePlayerData[draftKingsPlayer.name]) {
                        averagePlayerData[draftKingsPlayer.name] = {
                            name: draftKingsPlayer.name,
                            team: draftKingsPlayer.team,
                            weeklyStats: [{
                                week: game.week,
                                year: game.year,
                                draftKingsPoints: parseFloat(draftKingsPlayer.draftKingsPoints || 0),

                                rushAttempts: parseFloat(draftKingsPlayer.rush_att || 0),
                                passTargets: parseFloat(draftKingsPlayer.targets || 0)
                            }],
                            totalDraftKingsPoints: parseFloat(draftKingsPlayer.draftKingsPoints || 0)
                        }
                    } else {
                        averagePlayerData[draftKingsPlayer.name].totalDraftKingsPoints
                            += parseFloat(draftKingsPlayer.draftKingsPoints || 0);

                        // -- only add new data if the week hasn't been calculated alreday 
                        if (!averagePlayerData[draftKingsPlayer.name].weeklyStats.find(stat => stat.week === game.week && stat.year === game.year)) {
                            if (draftKingsPlayer.draftKingsPoints && parseFloat(draftKingsPlayer.draftKingsPoints || 0) > 0) {
                                // -- skip week if no points given that week (this really screws up the average)
                                // -- this may be due to injury or a by week
                                averagePlayerData[draftKingsPlayer.name].weeklyStats.push({
                                    week: game.week,
                                    year: game.year,
                                    draftKingsPoints: parseFloat(draftKingsPlayer.draftKingsPoints || 0),

                                    rushAttempts: parseFloat(draftKingsPlayer.rush_att || 0),
                                    passTargets: parseFloat(draftKingsPlayer.targets || 0)
                                });
                            }
                        } else {
                            // -- DEBUG
                            console.log(`********** Does this actualy happen? ${draftKingsPlayer.name}, ${game.week}, ${game.year}`);
                        }
                    }
                });
            game.stats.offense.forEach(offensivePlayer => {
                if (averagePlayerData[offensivePlayer.player]) {
                    const weekStats = averagePlayerData[offensivePlayer.player].weeklyStats.find(stat => stat.week === game.week && stat.year === game.year);
                    if (weekStats) {
                        weekStats["rushAttempts"] = parseFloat(offensivePlayer.rush_att || 0);
                        weekStats["passTargets"] = parseFloat(offensivePlayer.targets || 0);
                    }
                }
            });
        });
    });

    const currentYear = new Date().getFullYear();

    // filter out players that havent played this year
    let currentYearPlayerStats = Object.values(averagePlayerData)
        .filter(player => player.weeklyStats.some(stat => stat.year === currentYear));

    // filter out players that havent played in the last game
    let playerStats = [];
    const filterOutLastGame = true;
    if (filterOutLastGame) {
        playerStats = Object.values(currentYearPlayerStats)
            .filter(player => player.weeklyStats.some(stat => stat.year === currentYear && stat.week === (weekNumber - 1)));

        let difference = currentYearPlayerStats.filter(x => !playerStats.includes(x));
        difference.sort((a, b) => b.totalDraftKingsPoints - a.totalDraftKingsPoints);
        console.log(`Players that missed the last game: ${JSON.stringify(difference)}`);
        console.log("TURN THIS OFF TO INCLUDE ALL PLAYERS");
    } else {
        playerStats = currentYearPlayerStats;
    }

    // -- calculate weekly average
    playerStats.forEach(player => {
        let dkPointsFloor = Number.MAX_SAFE_INTEGER;
        let dkPointsCeiling = Number.MIN_SAFE_INTEGER;

        const values = [...player.weeklyStats];

        values.forEach(val => {
            if (val.draftKingsPoints > dkPointsCeiling) {
                dkPointsCeiling = val.draftKingsPoints;
            }
            if (val.draftKingsPoints < dkPointsFloor) {
                dkPointsFloor = val.draftKingsPoints;
            }
        });
        player["dkPointsFloor"] = dkPointsFloor;
        player["dkPointsCeiling"] = dkPointsCeiling;

        // -- calculate average
        const avgPoints = values
            .reduce((total, val) => total + val.draftKingsPoints, 0) / (values.length * 1.0);

        // -- calculate standard deviation
        let varianceTotal = 0;
        player.weeklyStats.forEach(stat => {
            varianceTotal += Math.pow((stat.draftKingsPoints - avgPoints), 2);
        });
        const variance = varianceTotal / player.weeklyStats.length;  // population size
        // const variance = varianceTotal / (player.weeklyStats.length - 1);  // sample size
        const stdDev = Math.sqrt(variance);
        player["stdDev"] = stdDev;
        player.weeklyStats.forEach(stat => {
            stat["isOutlier"] = Math.abs(avgPoints - stat.draftKingsPoints) > stdDev * 2;
        });

        // -- calculate weighted average
        let totalWeights = 0;
        let weightedSum = 0;
        const observations = [];
        const weights = [];
        const CURRENT_YEAR_WEIGHT = 5;
        values.forEach(val => {
            observations.push(val.draftKingsPoints);
            if (val.year === currentYear) {
                weightedSum += val.draftKingsPoints * CURRENT_YEAR_WEIGHT;
                totalWeights += CURRENT_YEAR_WEIGHT;

                // -- for weighted std dev
                weights.push(CURRENT_YEAR_WEIGHT);
            } else {
                weightedSum += val.draftKingsPoints * 1;
                totalWeights += 1;

                // -- for weighted std dev
                weights.push(1);
            }
        });
        let totalWeightedObservations = 0;
        let weightSum = 0;
        for (let i = 0; i < observations.length; i++) {
            totalWeightedObservations += observations[i] * weights[i];
            weightSum += weights[i];
        }
        const wAvg = totalWeightedObservations / (weightSum * 1.0);
        player["wAvgDraftKingsPoints"] = wAvg;

        // -- calculate weighted standard deviation
        let num = 0;
        let den2 = 0;
        for (let i = 0; i < observations.length; i++) {
            num += weights[i] * Math.pow(observations[i] - wAvg, 2);
            den2 += weights[i];
        }
        const wVariance = num / (((weights.length - 1) / weights.length) * den2);
        const wStdDev = Math.sqrt(wVariance);
        player["wStdDev"] = wStdDev;
        player.weeklyStats.forEach(stat => {
            stat["isOutlier2"] = Math.abs(wAvg - stat.draftKingsPoints) > wStdDev * 2;
        });

        // -- remove outliers
        let newTotal = 0;
        let statCount = 0;
        player.weeklyStats.filter(stat => !stat.isOutlier).forEach(stat => {
            newTotal += stat.draftKingsPoints;
            statCount++;
        });
        // player["newAvgDraftKingsPoints"] = newTotal / (statCount * 1.0);
        let newTotal2 = 0;
        let statCount2 = 0;
        player.weeklyStats.filter(stat => !stat.isOutlier2).forEach(stat => {
            newTotal2 += stat.draftKingsPoints;
            statCount2++;
        });
        // player["avgDraftKingsPoints"] = avgPoints;   // -- regular average
        // player["avgDraftKingsPoints"] = newTotal / (statCount * 1.0);    // -- std dev average
        player["avgDraftKingsPoints"] = newTotal2 / (statCount2 * 1.0); // -- weighted std dev average

        // ***** I dont think we have enough data for IQR to make sense here.
        //       Better to just stick with weighted average w/ std dev *****
        // // -- calculate interquartile range
        // const values = player.weeklyStats.map(stats => stats.draftKingsPoints);
        // const [q1, q3, iqr] = IQR(values);
        // player["iqr"] = [q1, q3, iqr];
        // player.weeklyStats.forEach(stat => {
        //     stat["isOutlier2"] = stat.draftKingsPoints < (q1 - iqr) || stat.draftKingsPoints > (q3 + iqr);
        // });
        // let newTotal2 = 0;
        // let statCount2 = 0;
        // player.weeklyStats.filter(stat => !stat.isOutlier2).forEach(stat => {
        //     newTotal2 += stat.draftKingsPoints;
        //     statCount2++;
        // });
        // player["newAvgDraftKingsPoints2"] = newTotal2 / (statCount2 * 1.0);

        // -- calculate rushing attempts and passing targets
        const totalRushingAttempts = values.reduce((total, val) => total + val.rushAttempts, 0);
        const averageRushingAttempts = totalRushingAttempts / (values.length * 1.0);
        const totalPassingTargets = values.reduce((total, val) => total + val.passTargets, 0);
        const averagePassingTargets = totalPassingTargets / (values.length * 1.0);
        const totalCombinedAttempts = totalRushingAttempts + totalPassingTargets;
        const averageCombinedAttempts = totalCombinedAttempts / (values.length * 1.0);
        // player["totalRushingAttempts"] = totalRushingAttempts;
        player["averageRushingAttempts"] = averageRushingAttempts;
        // player["totalPassingTargets"] = totalPassingTargets;
        player["averagePassingTargets"] = averagePassingTargets;
        player["averageCombinedAttempts"] = averageCombinedAttempts;
    });

    // -- DEBUG (rushing and pass stats printed)
    // console.log();
    // playerStats.sort((a, b) => b.averageRushingAttempts - a.averageRushingAttempts);
    // console.log(`Rushing: ${JSON.stringify(playerStats)}`);
    // console.log();
    // playerStats.sort((a, b) => b.averagePassingTargets - a.averagePassingTargets);
    // console.log(`Passing: ${JSON.stringify(playerStats)}`);

    // const DKPlayers = playerStats.map(player => {
    //     return {
    //         name: player.name,
    //         team: player.team,
    //         draftKingsPoints: player.avgDraftKingsPoints
    //     }
    // });

    playerStats.forEach(player => {
        player["draftKingsPoints"] = player.avgDraftKingsPoints;
    });

    // return [DKPlayers, playerStats];
    return playerStats;
};

// const median = (values) => {
//     if (values.length === 0) return 0;

//     values.sort(function (a, b) {
//         return a - b;
//     });

//     var half = Math.floor(values.length / 2);

//     if (values.length % 2)  // odd length
//         return values[half];

//     // even length
//     return (values[half - 1] + values[half]) / 2.0;
// };

// const IQR = (values) => {
//     if (values.length === 0) return null;

//     values.sort(function (a, b) {
//         return a - b;
//     });

//     var half = Math.floor(values.length / 2);

//     if (values.length % 2) { // odd length
//         const q1 = median(values.slice(0, half));
//         const q3 = median(values.slice(half + 1));
//         return [q1, q3, q3 - q1];
//     } else { // even length
//         const q1 = median(values.slice(0, half));
//         const q3 = median(values.slice(half));
//         return [q1, q3, q3 - q1];
//     }
// };

const getAverageDataOld = async (weekNumber, numberOfWeeks, teamA, teamB) => {
    const weeks = await getRelevantGamesData(weekNumber, numberOfWeeks, teamA, teamB);

    let avgData = {};

    // -- loop through each week
    weeks.forEach(gameWeek => {
        // -- loop through each game
        gameWeek.games.forEach(game => {
            // -- total up relevant offensive data
            game.stats.offense.filter(player => player.team === teamA || player.team === teamB).forEach(player => {

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
                        weeks: [`${gameWeek.year} - Week ${gameWeek.week}`]
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

                    const weeksString = `${gameWeek.year} - Week ${gameWeek.week}`;
                    if (!avgData[player.player]["weeks"].includes(weeksString)) {
                        avgData[player.player].weeksPlayed += 1;
                        avgData[player.player]["weeks"].push(weeksString);
                    }
                }
            });

            // -- total up relevant return data
            game.stats.returns.filter(player => player.team === teamA || player.team === teamB).forEach(player => {
                if (!avgData[player.player]) {
                    avgData[player.player] = {
                        team: player.team,
                        totalKickReturnTD: parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0),
                        weeksPlayed: 1,
                        weeks: [`${gameWeek.year} - Week ${gameWeek.week}`]
                    }
                } else {
                    avgData[player.player].totalKickReturnTD = (avgData[player.player].totalKickReturnTD || 0) +
                        parseInt(player.kick_ret_td || 0) + parseInt(player.punt_ret_td || 0);

                    const weeksString = `${gameWeek.year} - Week ${gameWeek.week}`;
                    if (!avgData[player.player]["weeks"].includes(weeksString)) {
                        avgData[player.player].weeksPlayed += 1;
                        avgData[player.player]["weeks"].push(weeksString);
                    }
                }
            });

            // -- total up relevant kicking data
            game.stats.kicking.filter(player => player.team === teamA || player.team === teamB).forEach(player => {
                if (!avgData[player.player]) {
                    avgData[player.player] = {
                        team: player.team,
                        totalExtraPoints: parseInt(player.xpm || 0),
                        totalFieldGoals: parseInt(player.fgm || 0),
                        weeksPlayed: 1,
                        weeks: [`${gameWeek.year} - Week ${gameWeek.week}`]
                    }
                } else {
                    avgData[player.player].totalExtraPoints = (avgData[player.player].totalExtraPoints || 0) +
                        parseInt(player.xpm || 0);
                    avgData[player.player].totalFieldGoals = (avgData[player.player].totalFieldGoals || 0) +
                        parseInt(player.fgm || 0);

                    const weeksString = `${gameWeek.year} - Week ${gameWeek.week}`;
                    if (!avgData[player.player]["weeks"].includes(weeksString)) {
                        avgData[player.player].weeksPlayed += 1;
                        avgData[player.player]["weeks"].push(weeksString);
                    }
                }
            });

            // -- total up relevant DST data
            if (game.homeTeam === teamA || game.homeTeam === teamB) {
                if (!avgData[`${game.homeTeam}-DST`]) {
                    avgData[`${game.homeTeam}-DST`] = {
                        team: game.homeTeam,
                        totalDraftKingsPoints: parseInt(game.stats["draftKings"]
                            .find(player => player.name === `${game.homeTeam}-DST`).draftKingsPoints || 0)
                    }
                } else {
                    avgData[`${game.homeTeam}-DST`].totalDraftKingsPoints += parseInt(game.stats["draftKings"]
                        .find(player => player.name.includes(`${game.homeTeam}-DST`)).draftKingsPoints || 0);
                }

            } else if (game.awayTeam === teamA || game.awayTeam === teamB) {
                if (!avgData[`${game.awayTeam}-DST`]) {
                    avgData[`${game.awayTeam}-DST`] = {
                        team: game.awayTeam,
                        totalDraftKingsPoints: parseInt(game.stats["draftKings"]
                            .find(player => player.name === `${game.awayTeam}-DST`).draftKingsPoints || 0)
                    }
                } else {
                    avgData[`${game.awayTeam}-DST`].totalDraftKingsPoints += parseInt(game.stats["draftKings"]
                        .find(player => player.name.includes(`${game.awayTeam}-DST`)).draftKingsPoints || 0);
                }
            }
        });

        // // -- calculate weekly average
        // Object.keys(avgData).forEach(player => {
        //     Object.keys(avgData[player]).filter(key => key !== "team" && !key.includes("weekAvg")).forEach(key => {
        //         const newKey = `${i}-weekAvg${key.split("total")[1]}`;
        //         avgData[player][newKey] = avgData[player][key] / (i * 1.0);
        //     });
        // });
    });

    // for (let i = 1; i <= numberOfWeeks; i++) {
    //     week = week - 1;
    //     if (week < 1) {
    //         year = year - 1;
    //         week = 17;  // -- should we reset to 17 (end of regular season) or reset in the post season (18-21)???
    //     }
    //     console.log(`Year: ${year}, Week: ${week}`);

    //     // -- get stats filtered by week
    //     // const result = await client.db(dbName).collection("weekly_stats")
    //     //     .find({ $and: [{ "week": week }, { "year": year }] }).toArray();

    //     const results = await client.db(dbName).collection("weekly_stats")
    //         .find({
    //             $and: [
    //                 { "week": week },
    //                 { "year": year },
    //                 {
    //                     $or: [
    //                         { "homeTeam": teamA },
    //                         { "homeTeam": teamB },
    //                         { "awayTeam": teamA },
    //                         { "awayTeam": teamB }
    //                     ]
    //                 },
    //             ]
    //         }).toArray();

    //     if (!results || results.length === 0) {
    //         console.log(`Data for ${year} - Week ${week} - ${teamA} vs ${teamB} not found in database.`);
    //         return [];
    //     }

    //     results.forEach(result => {
    //         const game = result.stats;
    //         game["homeTeam"] = result.homeTeam;
    //         game["awayTeam"] = result.awayTeam;


    //     });
    // }

    // -- calculate weekly average
    Object.keys(avgData).forEach(player => {
        Object.keys(avgData[player]).filter(key => key !== "team" && !key.includes("weeks")).forEach(key => {
            const newKey = `avg${key.split("total")[1]}`;
            const weeksPlayed = player.includes("-DST") ? numberOfWeeks : avgData[player].weeksPlayed;
            avgData[player][newKey] = avgData[player][key] / (weeksPlayed * 1.0);
        });
    });

    return avgData;
};

const getTopTeams = (playerStats, playerSalaries, isActualData = false) => {
    // -- merge salary data into player data
    playerStats.forEach(player => {
        const name = player.name.trim().toLowerCase();
        const nameArray = name.split(" ");
        const firstNameInitial = nameArray[0].charAt(0);
        const lastName = nameArray.slice(1).join(" ");
        const team = player.team;

        const playerSalary = playerSalaries.find(playerSal => {
            const playerSalName = playerSal.name.trim().toLowerCase();
            const palyerSalNameArray = playerSalName.split(" ");
            const playerSalFirstNameInitial = palyerSalNameArray[0].charAt(0);
            const playerSalLastName = palyerSalNameArray.slice(1).join(" ");
            // return playerSal.team === team &&
            //     (
            //         playerSalName === name ||
            //         playerSalName.replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "") === name ||
            //         (
            //             playerSalLastName === lastName && // -- compare last names
            //             playerSalFirstNameInitial === firstNameInitial // -- compare first initial
            //         )
            //     );
            return namesAreEqual(player, playerSal);
        });

        if (playerSalary && !playerSalary.injured && !player.ignorePlayer) {
            // -- player good to go
            player["position"] = playerSalary.position;
            player["salary"] = playerSalary.salary;
            player["dollarsPerPoint"] = playerSalary.salary / player["draftKingsPoints"];
            player["pointsPer1000Dollar"] = (player["draftKingsPoints"] / playerSalary.salary) * 1000.0;
        } else if (playerSalary && playerSalary.injured) {
            // -- player injured
            if (VERBOSE) {
                console.log(`Injured: ${name} from ${team}`);
            }

            player["salary"] = -1;
            player["dollarsPerPoint"] = -1;
            player["pointsPerDollar"] = -1;
        } else if (playerSalary && player.ignorePlayer) {
            // -- ignoring player from command args
            if (VERBOSE) {
                console.log(`Manually ignore: ${name} from ${team}`);
            }

            player["salary"] = -1;
            player["dollarsPerPoint"] = -1;
            player["pointsPerDollar"] = -1;
        } else {
            // -- player doesn't have a matching salary
            if (VERBOSE) {
                console.log(`No matching salary for ${name} from ${team}`);
            }

            player["salary"] = -1;
            player["dollarsPerPoint"] = -1;
            player["pointsPerDollar"] = -1;
        }
    });

    // -- check for salary players that we dont have stats for
    playerSalaries.forEach(playerSal => {
        const playerSalName = playerSal.name.trim().toLowerCase();
        const palyerSalNameArray = playerSalName.split(" ");
        const playerSalFirstNameInitial = palyerSalNameArray[0].charAt(0);
        const playerSalLastName = palyerSalNameArray.slice(1).join(" ");

        const playerFound = playerStats.find(player => {
            const name = player.name.trim().toLowerCase();
            const nameArray = name.split(" ");
            const firstNameInitial = nameArray[0].charAt(0);
            const lastName = nameArray.slice(1).join(" ");
            const team = player.team;
            // return playerSal.team === team &&
            //     (
            //         // -- name comparison
            //         playerSalName === name ||
            //         playerSalName.replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "") === name ||
            //         (
            //             playerSalLastName === lastName && // -- compare last names
            //             playerSalFirstNameInitial === firstNameInitial // -- compare first initial
            //         )
            //     );
            return namesAreEqual(playerSal, player);
        });

        if (!playerFound) {
            // -- player doesn't have matching statistics
            if (VERBOSE) {
                console.log(`No matching statistics for ${playerSalName} from ${playerSal.team}`);
            }
        }
    });

    // -- filter out players we dont have values for, are injured, or are just ignoring
    let filteredPlayers = playerStats.filter(player => player["salary"] !== -1);

    // -- DEBUG (rushing and pass stats printed)
    console.log();
    filteredPlayers.sort((a, b) => b.averageRushingAttempts - a.averageRushingAttempts);
    console.log(`Rushing: ${JSON.stringify(filteredPlayers)}`);
    console.log();
    filteredPlayers.sort((a, b) => b.averagePassingTargets - a.averagePassingTargets);
    console.log(`Passing: ${JSON.stringify(filteredPlayers)}`);
    console.log();
    filteredPlayers.sort((a, b) => b.averageCombinedAttempts - a.averageCombinedAttempts);
    console.log(`Combined Attempts: ${JSON.stringify(filteredPlayers)}`);

    // -- sort by average DK points
    filteredPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });

    // -- DEBUG - for when we run into the javacsript heap out of memory issue
    if (filteredPlayers.length > 25) {
        filteredPlayers = filteredPlayers.slice(0, 26);
    }

    const pointsTitle = isActualData ? "actualPoints" : "predictedPoints";

    // -- DEBUG
    // console.log(`Filtered Players Length: ${filteredPlayers.length}`);


    // -- performance monitor
    const t0 = performance.now();

    // -- make a combination of every single possible team
    const possibleTeams = [];
    for (let captain = 0; captain < filteredPlayers.length; captain++) {
        for (let flexOne = 0; flexOne < filteredPlayers.length; flexOne++) {
            if (flexOne === captain) continue;
            for (let flexTwo = flexOne + 1; flexTwo < filteredPlayers.length; flexTwo++) {
                if (flexTwo === captain) continue;
                for (let flexThree = flexTwo + 1; flexThree < filteredPlayers.length; flexThree++) {
                    if (flexThree === captain) continue;
                    for (let flexFour = flexThree + 1; flexFour < filteredPlayers.length; flexFour++) {
                        if (flexFour === captain) continue;
                        for (let flexFive = flexFour + 1; flexFive < filteredPlayers.length; flexFive++) {
                            if (flexFive === captain) continue;
                            const totalSalary = (filteredPlayers[captain].salary * 1.5) +
                                filteredPlayers[flexOne].salary +
                                filteredPlayers[flexTwo].salary +
                                filteredPlayers[flexThree].salary +
                                filteredPlayers[flexFour].salary +
                                filteredPlayers[flexFive].salary;
                            const totalDraftKingsPoints = (filteredPlayers[captain].draftKingsPoints * 1.5) +
                                filteredPlayers[flexOne].draftKingsPoints +
                                filteredPlayers[flexTwo].draftKingsPoints +
                                filteredPlayers[flexThree].draftKingsPoints +
                                filteredPlayers[flexFour].draftKingsPoints +
                                filteredPlayers[flexFive].draftKingsPoints;
                            possibleTeams.push({
                                "captain": {
                                    player: filteredPlayers[captain].name,
                                    team: filteredPlayers[captain].team,
                                    position: filteredPlayers[captain].position,
                                    [pointsTitle]: (filteredPlayers[captain].draftKingsPoints * 1.5)
                                },
                                "flex1": {
                                    player: filteredPlayers[flexOne].name,
                                    team: filteredPlayers[flexOne].team,
                                    position: filteredPlayers[flexOne].position,
                                    [pointsTitle]: filteredPlayers[flexOne].draftKingsPoints
                                },
                                "flex2": {
                                    player: filteredPlayers[flexTwo].name,
                                    team: filteredPlayers[flexTwo].team,
                                    position: filteredPlayers[flexTwo].position,
                                    [pointsTitle]: filteredPlayers[flexTwo].draftKingsPoints
                                },
                                "flex3": {
                                    player: filteredPlayers[flexThree].name,
                                    team: filteredPlayers[flexThree].team,
                                    position: filteredPlayers[flexThree].position,
                                    [pointsTitle]: filteredPlayers[flexThree].draftKingsPoints
                                },
                                "flex4": {
                                    player: filteredPlayers[flexFour].name,
                                    team: filteredPlayers[flexFour].team,
                                    position: filteredPlayers[flexFour].position,
                                    [pointsTitle]: filteredPlayers[flexFour].draftKingsPoints
                                },
                                "flex5": {
                                    player: filteredPlayers[flexFive].name,
                                    team: filteredPlayers[flexFive].team,
                                    position: filteredPlayers[flexFive].position,
                                    [pointsTitle]: filteredPlayers[flexFive].draftKingsPoints
                                },
                                totalSalary,
                                totalDraftKingsPoints
                            });
                        }
                    }
                }
            }
        }
    }

    // -- filter out invalid teams
    const positions = ["flex1", "flex2", "flex3", "flex4", "flex5"];
    const filteredPossibleTeams = possibleTeams
        .filter(team => team.totalSalary <= 50000)  // -- filter out salary totals over $50,000
        .filter(team => {   // -- filter out teams that don't have players from both teams
            const captainTeamName = team.captain.team;
            let hasSeparateTeams = false;
            positions.forEach(position => {
                if (team[position].team !== captainTeamName) {
                    hasSeparateTeams = true;
                }
            });

            return hasSeparateTeams;
        });

    if (VERBOSE) {
        // -- DEBUG
        const t1 = performance.now()
        console.log();
        console.log("Call to build teams took " + (t1 - t0) + " milliseconds.");
        console.log(`Possible unflitered combinations: ${possibleTeams.length}`);
        console.log(`Possible flitered combinations: ${filteredPossibleTeams.length}`);
    }

    // -- sort by top predicted DraftKings points
    filteredPossibleTeams.sort((a, b) => {
        return a.totalDraftKingsPoints > b.totalDraftKingsPoints ? -1 : 1;
    });

    // const displayedTeamsCount = 100;
    // const topTeams = filteredPossibleTeams.slice(0, displayedTeamsCount + 1);

    // console.log();
    // console.log(`Top ${displayedTeamsCount} teams by predicted points...`);
    // console.log(JSON.stringify(topTeams));

    return filteredPossibleTeams;
}

const namesAreEqual = (playerOne, playerTwo) => {
    const playerSalName = playerOne.name.trim().toLowerCase().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "").replace(" iv", "").replace(" v", "");
    const palyerSalNameArray = playerSalName.split(" ");
    const playerSalFirstNameInitial = palyerSalNameArray[0].charAt(0);
    const playerSalLastName = palyerSalNameArray.slice(1).join(" ");

    const name = playerTwo.name.trim().toLowerCase().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "").replace(" iv", "").replace(" v", "");
    const nameArray = name.split(" ");
    const firstNameInitial = nameArray[0].charAt(0);
    const lastName = nameArray.slice(1).join(" ");
    return playerOne.team === playerTwo.team &&
        (
            // -- name comparison
            playerSalName === name ||
            playerSalName === name ||
            (
                playerSalLastName === lastName && // -- compare last names
                playerSalFirstNameInitial === firstNameInitial // -- compare first initial
            )
        );
}

const namesAreEqual2 = (playerOne, playerTwo) => {
    const playerSalName = playerOne.trim().toLowerCase().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "").replace(" iv", "").replace(" v", "");
    const palyerSalNameArray = playerSalName.split(" ");
    const playerSalFirstNameInitial = palyerSalNameArray[0].charAt(0);
    const playerSalLastName = palyerSalNameArray.slice(1).join(" ");

    const name = playerTwo.trim().toLowerCase().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "").replace(" iv", "").replace(" v", "");
    const nameArray = name.split(" ");
    const firstNameInitial = nameArray[0].charAt(0);
    const lastName = nameArray.slice(1).join(" ");
    return (
        // -- name comparison
        playerSalName === name ||
        playerSalName === name ||
        (
            playerSalLastName === lastName && // -- compare last names
            playerSalFirstNameInitial === firstNameInitial // -- compare first initial
        )
    );
}

const run = async () => {
    const args = process.argv.slice(2);
    // console.log('args: ', args);
    switch (args[0]) {
        case '--update-stats':    // `node index.js --update-stats`
            console.log("Updating stored stats...");

            updateStats();
            break;
        case '--generate-team':   // `node index.js --generate-team {weekNumber} {teamA} {teamB} [{playersToKeep} {playersToRemove}]` (assuming current year)
            console.log("Generating DraftKings teams...");

            const [weekNumber, teamA, teamB, playersToKeepStr, playersToRemoveStr] = args.slice(1);
            const playersToKeep = (playersToKeepStr && playersToKeepStr !== " " ?
                playersToKeepStr.split(",") : []).map(name => name.trim().toLowerCase());
            const playersToRemove = (playersToRemoveStr ?
                playersToRemoveStr.split(",") : []).map(name => name.trim().toLowerCase());

            // -- DEBUG
            // console.log(playersToKeepStr, playersToRemoveStr);
            // console.log(playersToKeep, playersToRemove);

            if (teamA === teamB) {
                console.log("Teams need to be different.");
                return;
            }

            const numberOfWeeks = 17;
            // const numberOfWeeks = 3;
            const useOldWay = false;
            generateTeam(parseInt(weekNumber), numberOfWeeks, teamA.toUpperCase(), teamB.toUpperCase(), playersToKeep, playersToRemove, useOldWay);
            break;
        case '--team-abbrv':    // `node index.js --team-abbrv`
            console.log("Team abbreviations...");

            orderedAbbrv = {};
            Object.keys(TEAM_ABBRV).sort().forEach(function (key) {
                orderedAbbrv[key] = TEAM_ABBRV[key];
            });

            Object.keys(orderedAbbrv).forEach(key => {
                console.log(`\t${key}: ${orderedAbbrv[key]}`);
            });
            break;
        case '--current-dk-games':  // `node index.js --current-dk-games`
            console.log("Retrieving list of current DraftKings games...");

            const teamAbbrvs = await getCurrentGames();
            console.log(teamAbbrvs);
            break;
        case '--store-salary-data': // `node index.js --store-salary-data {week}`
            console.log("Storing all current DraftKings salary lineups...");

            const [week] = args.slice(1);

            storeSalaryData(parseInt(week));
            break;
        case '--run-player-test': // `node index.js --run-test`
            console.log("Running player algorithm test on previously stored data...");

            runPlayerAlgorithmTest();
            break;
        case '--run-team-test': // `node index.js --run-test`
            console.log("Running team algorithm test on previously stored data...");

            runTeamAlgorithmTest();
            break;
        case '--help':  // `node index.js --help`
            console.log("Options...");
            console.log("\t--current-dk-games\n\t\t=> list all available NFL Captain's games");
            console.log("\t--team-abbrv\n\t\t=> list valid NFL team name abbreviations");
            console.log("\t--update-stats\n\t\t=> grab latest stats from pro-footbal-reference.com and store stats in DB");
            console.log("\t--store-salary-data {week}\n\t\t=> retrieve current salary lineups and store stats in DB");
            console.log("\t--generate-team {weekNumber} {teamA} {teamB} [{playersToKeep} {playersToRemove}]\n\t\t=> generate DraftKings lineups based on predicted stats");
            console.log("\t--run-player-test\n\t\t=> run algorithm test for player points prediction on historical data");
            console.log("\t--run-team-test\n\t\t=> run algorithm test for DraftKings team prediction on historical data");
            break;
        default:
            console.log('Invalid args. Run `node index.js --help` for valid command list.');
    }
}

module.exports.VERBOSE = VERBOSE;

run();