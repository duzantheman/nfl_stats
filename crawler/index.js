// const { TEAM_ABBRV, getStats } = require("./utility/espn");
const { TEAM_ABBRV, getStats } = require("./utility/pro-football-ref");
const { writeStats, getAverageData } = require("./utility/mongo");
const { getDraftKingsValue } = require("./utility/draft-kings");

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

            // TODO: do we want to make this an arg for the script???
            const numberOfWeeks = 3;

            console.log(`Generating team for week ${weekNumber} - ${teamA} vs ${teamB}...`);

            const avgData = await getAverageData(weekNumber, numberOfWeeks, teamA.toUpperCase(), teamB.toUpperCase());
            getDraftKingsValue(avgData, numberOfWeeks);
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

run();