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
    getAverageData,
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

const generateTeam = async (weekNumber, numberOfWeeks, teamA, teamB) => {

    console.log(`Generating team for week ${weekNumber} - ${teamA} vs ${teamB}...`);

    // -- retrieve data and build out weekly averages
    // *** this is where the prediction algorithm is that we need to work on ***
    const avgData = await getAverageData(weekNumber, numberOfWeeks, teamA, teamB);

    // -- calculate DraftKings points based on rules
    const DKPlayers = getDraftKingsValue(avgData, numberOfWeeks);

    let playerSalaries = [];
    let homeTeam, awayTeam;

    // -- retrieve stored player salaries from draft-kings
    [playerSalaries, homeTeam, awayTeam] = await getPlayerSalaries(teamA, teamB);

    // -- store data in mongo
    await storePlayerSalaries(playerSalaries, weekNumber, homeTeam, awayTeam);

    // -- DEBUG
    // console.log();
    // console.log(JSON.stringify(playerSalaries));

    console.log();

    const topPredictedTeams = getTopTeams(DKPlayers, playerSalaries);

    console.log();
    console.log(JSON.stringify(topPredictedTeams));
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

    // weeklyTeams.forEach(gameTeams => {
    //     // -- retrieve DraftKings salary lineups
    //     [playerSalaries, homeTeam, awayTeam] = await getPlayerSalaries(gameTeams[0], gameTeams[1]);

    //     // -- store data in mongo
    //     storePlayerSalaries(playerSalaries, week, homeTeam, awayTeam);
    // });
};

const runAlgorithmTest = async () => {
    // 1) pull stored DraftKings salary (doing this because this will be the limiter in available data, not statisical data)

    // -- retrieve stored player salaries from mongo
    const storedDkGames = await retrieveAllPlayerSalaries();

    // -- DEBUG
    // console.log(JSON.stringify([storedDkGames[0]]));

    // 2) pull stored statistical data based on year/week/teams from the DK salary data and merge

    // -- loop through storedDKGames to grab statistics by year/week/teams
    // for (const dkGame of storedDkGames) {
    for (const dkGame of [storedDkGames[0]]) {  // -- DEBUG - temp for testing
        // -- get actual stats for the particular game
        const gameData = await getStoredGameData(dkGame.year, dkGame.week, dkGame.homeTeam, dkGame.awayTeam);

        // -- DEBUG
        // console.log(JSON.stringify(gameData));

        // intermediate step - display the top team (within the salary cap)


        // (steps 3 and 4 are probably going to look very similar to what we do in part of the "generateTeam()" function)
        // 3) build out list of all possible teams under salary cap
        const isActualData = true;
        const topActualTeams = getTopTeams(gameData.stats.draftKings, dkGame.playerSalaries, isActualData);

        // -- DEBUG
        console.log();
        console.log(JSON.stringify(topActualTeams));

    }

    // 4) display top 10? 20? 100? 

    // 5) now repeat the process using generateTeam() call to see what we "predicted" and compare the results
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
            return playerSal.team === team &&
                (
                    playerSalName === name ||
                    playerSalName.replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "") === name ||
                    (
                        playerSalLastName === lastName && // -- compare last names
                        playerSalFirstNameInitial === firstNameInitial // -- compare first initial
                    )
                );
        });

        if (playerSalary && !playerSalary.injured) {
            player["position"] = playerSalary.position;
            player["salary"] = playerSalary.salary;
            player["dollarsPerPoint"] = playerSalary.salary / player["draftKingsPoints"];
            player["pointsPerDollar"] = player["draftKingsPoints"] / playerSalary.salary;
        } else if (playerSalary && playerSalary.injured) {
            console.log(`Injured: ${name} from ${team}`);

            player["salary"] = -1;
            player["dollarsPerPoint"] = -1;
            player["pointsPerDollar"] = -1;
        } else {
            console.log(`No matching salary for ${name} from ${team}`);

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
            return playerSal.team === team &&
                (
                    // -- name comparison
                    playerSalName === name ||
                    playerSalName.replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", "") === name ||
                    (
                        playerSalLastName === lastName && // -- compare last names
                        playerSalFirstNameInitial === firstNameInitial // -- compare first initial
                    )
                );
        });

        if (!playerFound) {
            console.log(`No matching statistics for ${playerSalName} from ${playerSal.team}`);
        }
    });

    // -- filter out players we dont have values for
    const filteredPlayers = playerStats.filter(player => player["salary"] !== -1);

    // -- sort by average DK points
    filteredPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });


    // -- performance monitor
    const t0 = performance.now();

    const pointsTitle = isActualData ? "actualPoints" : "predictedPoints";

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

    const t1 = performance.now()
    // -- DEBUG
    console.log();
    console.log("Call to build teams took " + (t1 - t0) + " milliseconds.");
    console.log(`Possible unflitered combinations: ${possibleTeams.length}`);
    console.log(`Possible flitered combinations: ${filteredPossibleTeams.length}`);

    // -- sort by top predicted DraftKings points
    filteredPossibleTeams.sort((a, b) => {
        return a.totalDraftKingsPoints > b.totalDraftKingsPoints ? -1 : 1;
    });

    const displayedTeamsCount = 100;
    const topTeams = filteredPossibleTeams.slice(0, displayedTeamsCount + 1);

    // console.log();
    // console.log(`Top ${displayedTeamsCount} teams by predicted points...`);
    // console.log(JSON.stringify(topTeams));

    return topTeams;
}

const run = async () => {
    const args = process.argv.slice(2);
    // console.log('args: ', args);
    switch (args[0]) {
        case '--update-stats':    // `node index.js --update-stats`
            console.log("Updating stored stats...");

            updateStats();
            break;
        case '--generate-team':   // `node index.js --generate-team {weekNumber} {teamA} {teamB}` (assuming current year)
            console.log("Generating DraftKings teams...");

            const [weekNumber, teamA, teamB] = args.slice(1);

            if (teamA === teamB) {
                console.log("Teams need to be different.");
                return;
            }

            const numberOfWeeks = 3;

            generateTeam(parseInt(weekNumber), numberOfWeeks, teamA.toUpperCase(), teamB.toUpperCase());
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
        case '--run-test': // `node index.js --run-test`
            console.log("Running algorithm test on previously stored data...");

            runAlgorithmTest();
            break;
        case '--help':  // `node index.js --help`
            console.log("Options...");
            console.log("\t--current-dk-games\n\t\t=> list all available NFL Captain's games");
            console.log("\t--team-abbrv\n\t\t=> list valid NFL team name abbreviations");
            console.log("\t--update-stats\n\t\t=> grab latest stats from pro-footbal-reference.com and store stats in DB");
            console.log("\t--store-salary-data {week}\n\t\t=> retrieve current salary lineups and store stats in DB");
            console.log("\t--generate-team {weekNumber} {teamA} {teamB}\n\t\t=> generate DraftKings lineups based on predicted stats");
            console.log("\t--run-test\n\t\t=> run algorithm test on historical data");
            break;
        default:
            console.log('Invalid args. Run `node index.js --help` for valid command list.');
    }
}

run();