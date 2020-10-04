const { performance } = require('perf_hooks');

// const { TEAM_ABBRV, getStats } = require("./utility/espn");
const { TEAM_ABBRV, getStats } = require("./utility/pro-football-ref");
const { writeStats, getAverageData } = require("./utility/mongo");
const { getDraftKingsValue } = require("./utility/draft-kings");

// const salaries = require("./")
const salaries = require("./game-salaries.json");

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

const run = async () => {
    const args = process.argv.slice(2);
    // console.log('args: ', args);
    switch (args[0]) {
        case 'update-stats':    // `node index.js update-stats`
            console.log("Updating stored stats...");

            updateStats();
            break;
        case 'generate-team':   // `node index.js generate-team {weekNumber} {teamA} {teamB}` (assuming current year)
            const [weekNumber, teamA, teamB] = args.slice(1);
            const numberOfWeeks = 3;

            generateTeam(parseInt(weekNumber), numberOfWeeks, teamA.toUpperCase(), teamB.toUpperCase());
            break;
        case 'team-abbrv':    // `node index.js team-abbrv`
            console.log("Team abbreviations...");

            orderedAbbrv = {};
            Object.keys(TEAM_ABBRV).sort().forEach(function (key) {
                orderedAbbrv[key] = TEAM_ABBRV[key];
            });

            Object.keys(orderedAbbrv).forEach(key => {
                console.log(`\t${key}: ${orderedAbbrv[key]}`);
            });
            break;
        default:
            console.log('Invalid arg');
    }
}

const generateTeam = async (weekNumber, numberOfWeeks, teamA, teamB) => {

    console.log(`Generating team for week ${weekNumber} - ${teamA} vs ${teamB}...`);

    // -- retrieve data and build out weekly averages
    const avgData = await getAverageData(weekNumber, numberOfWeeks, teamA, teamB);

    // -- calculate DraftKings points based on rules
    const DKPlayers = getDraftKingsValue(avgData, numberOfWeeks);

    // -- match players up with given salaries
    const playerSalaries = salaries.find(game => {
        return game.year === new Date().getFullYear() && game.week === weekNumber &&
            (
                (game.homeTeam === teamA && game.awayTeam === teamB) ||
                (game.homeTeam === teamB && game.awayTeam === teamA)
            )
    }).players;

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
                    // O. Beckham Jr. vs Odell Beckham Jr.
                    playerSalName === name ||
                    (
                        playerSalLastName === lastName && // -- compare last names
                        playerSalFirstNameInitial === firstNameInitial // -- compare first initial
                    )
                ); // will need to add name abbrv handling in here
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

        // -- testing this out for memory conservation
        delete dkPlayer["properties"];
    });

    const filteredPlayers = DKPlayers.filter(player => player["salary"] !== -1);

    // -- sort by average DK points
    filteredPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });
    // console.log(JSON.stringify(filteredPlayers));

    // // -- sort by avg DK points per dollar
    // filteredPlayers.sort(function (a, b) {
    //     return a.pointsPerDollar > b.pointsPerDollar ? -1 : 1;
    // });
    // console.log(JSON.stringify(filteredPlayers));

    // -- DEBUG
    const t0 = performance.now();


    // -- make a combination of every single possible team
    // -- filter out anything over salary cap ($50,000)
    // -- sort by top predicted DraftKings points
    const possibleTeams = [];
    for (let captain = 0; captain < filteredPlayers.length; captain++) {
        // let teamTotal = filteredPlayers[captain].salary;
        for (let flexOne = captain + 1; flexOne < filteredPlayers.length; flexOne++) {
            for (let flexTwo = flexOne + 1; flexTwo < filteredPlayers.length; flexTwo++) {
                for (let flexThree = flexTwo + 1; flexThree < filteredPlayers.length; flexThree++) {
                    for (let flexFour = flexThree + 1; flexFour < filteredPlayers.length; flexFour++) {
                        for (let flexFive = flexFour + 1; flexFive < filteredPlayers.length; flexFive++) {
                            const totalSalary = filteredPlayers[captain].salary +
                                filteredPlayers[flexOne].salary +
                                filteredPlayers[flexTwo].salary +
                                filteredPlayers[flexThree].salary +
                                filteredPlayers[flexFour].salary +
                                filteredPlayers[flexFive].salary;
                            const totalDraftKingsPoints = filteredPlayers[captain].draftKingsPoints +
                                filteredPlayers[flexOne].draftKingsPoints +
                                filteredPlayers[flexTwo].draftKingsPoints +
                                filteredPlayers[flexThree].draftKingsPoints +
                                filteredPlayers[flexFour].draftKingsPoints +
                                filteredPlayers[flexFive].draftKingsPoints;
                            possibleTeams.push({
                                "captain": filteredPlayers[captain].name,
                                "flex1": filteredPlayers[flexOne].name,
                                "flex2": filteredPlayers[flexTwo].name,
                                "flex3": filteredPlayers[flexThree].name,
                                "flex4": filteredPlayers[flexFour].name,
                                "flex5": filteredPlayers[flexFive].name,
                                totalSalary,
                                totalDraftKingsPoints
                            });
                        }
                    }
                }
            }
        }
    }

    const filteredPossibleTeams = possibleTeams.filter(team => team.totalSalary <= 50000);

    const t1 = performance.now()
    // -- DEBUG
    console.log();
    console.log("Call to build teams took " + (t1 - t0) + " milliseconds.");
    console.log(`Possible unflitered combinations: ${possibleTeams.length}`);
    console.log(`Possible flitered combinations: ${filteredPossibleTeams.length}`);

    filteredPossibleTeams.sort((a, b) => {
        return a.totalDraftKingsPoints > b.totalDraftKingsPoints ? -1 : 1;
    });

    console.log();
    console.log(JSON.stringify(filteredPossibleTeams.slice(0, 101)));
}

run();