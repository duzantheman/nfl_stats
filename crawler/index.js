const { performance } = require('perf_hooks');

// const { TEAM_ABBRV, getStats } = require("./utility/espn");
const { TEAM_ABBRV, getStats } = require("./utility/pro-football-ref");
const { writeStats, getAverageData, storePlayerSalaries } = require("./utility/mongo");
const { getDraftKingsValue, getPlayerSalaries, getCurrentGames } = require("./utility/draft-kings");

const testSalaries = require("./game-salaries.json");

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
    const stats = await getStats();
    // console.log(JSON.stringify(stats));
    await writeStats(stats);
}

const generateTeam = async (weekNumber, numberOfWeeks, teamA, teamB, useTestData = false) => {

    console.log(`Generating team for week ${weekNumber} - ${teamA} vs ${teamB}...`);

    // -- retrieve data and build out weekly averages
    // *** this is where the prediction algorithm is that we need to work on ***
    const avgData = await getAverageData(weekNumber, numberOfWeeks, teamA, teamB);

    // -- DEBUG
    // console.log(JSON.stringify(avgData));

    // -- calculate DraftKings points based on rules
    const DKPlayers = getDraftKingsValue(avgData, numberOfWeeks);

    let playerSalaries = [];
    let homeTeam, awayTeam;
    if (useTestData) {
        // -- retrieve stored player salaries from mongo
    } else {
        // -- retrieve stored player salaries from draft-kings
        [playerSalaries, homeTeam, awayTeam] = await getPlayerSalaries(teamA, teamB);

        // -- store data in mongo
        storePlayerSalaries(playerSalaries, weekNumber, homeTeam, awayTeam);
    }

    // -- DEBUG
    console.log();
    console.log(JSON.stringify(playerSalaries));

    console.log();

    // -- merge salary data into player data
    DKPlayers.forEach(dkPlayer => {
        const name = dkPlayer.name.trim().toLowerCase();
        const nameArray = name.split(" ");
        const firstNameInitial = nameArray[0].charAt(0);
        const lastName = nameArray.slice(1).join(" ");
        const team = dkPlayer.team;

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
            dkPlayer["salary"] = playerSalary.salary;
            dkPlayer["dollarsPerPoint"] = playerSalary.salary / dkPlayer["draftKingsPoints"];
            dkPlayer["pointsPerDollar"] = dkPlayer["draftKingsPoints"] / playerSalary.salary;
        } else if (playerSalary && playerSalary.injured) {
            console.log(`Injured: ${name} from ${team}`);

            dkPlayer["salary"] = -1;
            dkPlayer["dollarsPerPoint"] = -1;
            dkPlayer["pointsPerDollar"] = -1;
        } else {
            console.log(`No matching salary for ${name} from ${team}`);

            dkPlayer["salary"] = -1;
            dkPlayer["dollarsPerPoint"] = -1;
            dkPlayer["pointsPerDollar"] = -1;
        }
    });

    // -- check for salary players that we dont have stats for
    playerSalaries.forEach(playerSal => {
        const playerSalName = playerSal.name.trim().toLowerCase();
        const palyerSalNameArray = playerSalName.split(" ");
        const playerSalFirstNameInitial = palyerSalNameArray[0].charAt(0);
        const playerSalLastName = palyerSalNameArray.slice(1).join(" ");

        const playerFound = DKPlayers.find(dkPlayer => {
            const name = dkPlayer.name.trim().toLowerCase();
            const nameArray = name.split(" ");
            const firstNameInitial = nameArray[0].charAt(0);
            const lastName = nameArray.slice(1).join(" ");
            const team = dkPlayer.team;
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
    const filteredPlayers = DKPlayers.filter(player => player["salary"] !== -1);

    // -- sort by average DK points
    filteredPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });


    // -- DEBUG
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
                                // "captain": filteredPlayers[captain].name,
                                // "flex1": filteredPlayers[flexOne].name,
                                // "flex2": filteredPlayers[flexTwo].name,
                                // "flex3": filteredPlayers[flexThree].name,
                                // "flex4": filteredPlayers[flexFour].name,
                                // "flex5": filteredPlayers[flexFive].name,
                                "captain": {
                                    player: filteredPlayers[captain].name,
                                    team: filteredPlayers[captain].team,
                                    avgPoints: filteredPlayers[captain].draftKingsPoints
                                },
                                "flex1": {
                                    player: filteredPlayers[flexOne].name,
                                    team: filteredPlayers[flexOne].team,
                                    avgPoints: filteredPlayers[flexOne].draftKingsPoints
                                },
                                "flex2": {
                                    player: filteredPlayers[flexTwo].name,
                                    team: filteredPlayers[flexTwo].team,
                                    avgPoints: filteredPlayers[flexTwo].draftKingsPoints
                                },
                                "flex3": {
                                    player: filteredPlayers[flexThree].name,
                                    team: filteredPlayers[flexThree].team,
                                    avgPoints: filteredPlayers[flexThree].draftKingsPoints
                                },
                                "flex4": {
                                    player: filteredPlayers[flexFour].name,
                                    team: filteredPlayers[flexFour].team,
                                    avgPoints: filteredPlayers[flexFour].draftKingsPoints
                                },
                                "flex5": {
                                    player: filteredPlayers[flexFive].name,
                                    team: filteredPlayers[flexFive].team,
                                    avgPoints: filteredPlayers[flexFive].draftKingsPoints
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

    // -- filter out anything over salary cap ($50,000)
    const filteredPossibleTeams = possibleTeams.filter(team => team.totalSalary <= 50000);

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

    console.log();
    console.log(JSON.stringify(filteredPossibleTeams.slice(0, 101)));
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

const run = async () => {
    const args = process.argv.slice(2);
    // console.log('args: ', args);
    switch (args[0]) {
        case '--update-stats':    // `node index.js --update-stats`
            console.log("Updating stored stats...");

            updateStats();
            break;
        case '--generate-team':   // `node index.js --generate-team {weekNumber} {teamA} {teamB} [{useTestData}]` (assuming current year)
            console.log("Generating DraftKings teams...");

            const [weekNumber, teamA, teamB, useTestDataStr] = args.slice(1);
            const numberOfWeeks = 3;
            const useTestData = useTestDataStr === "true";

            generateTeam(parseInt(weekNumber), numberOfWeeks, teamA.toUpperCase(), teamB.toUpperCase(), useTestData);
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
        case '--help':  // `node index.js --help`
            console.log("Options...");
            console.log("\t--current-dk-games\n\t\t=> list all available NFL Captain's games");
            console.log("\t--team-abbrv\n\t\t=> list valid NFL team name abbreviations");
            console.log("\t--update-stats\n\t\t=> grab latest stats from pro-footbal-reference.com and store stats in DB");
            console.log("\t--store-salary-data {week}\n\t\t=> retrieve current salary lineups and store stats in DB");
            console.log("\t--generate-team {weekNumber} {teamA} {teamB} [{useTestData}]\n\t\t=> generate DraftKings lineups based on predicted stats");
            break;
        default:
            console.log('Invalid args. Run `node index.js --help` for valid command list.');
    }
}

run();