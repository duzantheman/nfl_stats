const axios = require('axios');
const cheerio = require('cheerio');
// const URL = require('url-parse');

/*
 * URL Notes
 * 
 * -- Weekly Stats --
 * format: http://www.espn.com/nfl/weekly/leaders/_/week/{weekNumber}/year/{yearNumber}/type/{statType}
 * weekNumber: [1-17] (except for current season)
 * yearNumber: [2002-]
 * statType: [passing, rushing, receiving, defensive]
 * 
 * -- Season Stats --
 * format: https://www.espn.com/nfl/stats/player/_/view/{viewType}/stat/{statType}/season/{yearNumber}/seasontype/{seasonType}
 * viewType: [offense, defense, special] => these determine available stat types
 * statType: {offense: [passing, rushing, receiving], defense: NA, special: [returning, kicking, punting]}
 * yearNumber: [2004-]
 * seasonType: [2,3] => 2: regular season, 3: postseason
 */

/*
 * TODOS
 * 1) figure out the best way to organize the stats for easy retrieval
 * 2) determine how we are going to store the stats (local DB I'm assuming)
 * 3) got the general setup of the weekly stats, but will need to build out the parser for seasonal stats
 * 4) Defense/Special Teams are a whole team, not individual players. Need to figure out how to grab this data
 */

const YEARS = [2018, 2019, 2020]; // -- order from low to high
const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // -- order from low to high
// const STAT_TYPES = ["passing", "rushing", "receiving", "defensive"];
const STAT_TYPES = ["passing", "rushing", "receiving"];
const TEAM_ABBRV = {
    "PIT": "Pittsburg Steelers",
    "CHI": "Chicago Bears",
    "CLE": "Cleveland Browns",
    "CAR": "Carolina Panthers",
    "SF": "San Fransisco 49ers",
    "NO": "New Orleans Saints",
    "MIN": "Minnesota Vikings",
    "PHI": "Philidelphia Eagles",
    "SEA": "Seattle Seahawks",
    "HOU": "Houston Texans",
    "WSH": "Washington Redskins",
    "JAX": "Jacksonville Jaguars",
    "IND": "Indianapolis Colts",
    "TEN": "Tennessee Titans",
    "NE": "New England Patriots",
    "TEN": "Tennessee Titans",
    "GB": "Green Bay Packers",
    "LV": "Las Vegas Raiders",
    "CIN": "Cincinnati Bengals",
    "NYG": "New York Giants",
    "DEN": "Denver Broncos",
    "TB": "Tampa Bay Buccaneers",
    "LAR": "Los Angeles Rams",
    "BUF": "Buffalo Bills",
    "KC": "Chiefs"
}

const getStats = async () => {
    const weeklyStats = [];
    let weeksRemaining = true;
    for (const year of YEARS) {
        if (!weeksRemaining) continue;
        console.log(`Year: ${year}`);
        for (const week of WEEKS) {
            if (!weeksRemaining) continue;
            console.log(`Week: ${week}`);
            for (const type of STAT_TYPES) {
                if (!weeksRemaining) continue;

                console.log(`Type: ${type}`);
                const page = `http://www.espn.com/nfl/weekly/leaders/_/week/${week}/year/${year}/type/${type}`;
                console.log("Visiting page " + page);

                try {
                    const response = await axios.get(page);

                    if (response.status !== 200) {
                        console.log("Error occurred while fetching data");
                        continue; // -- move on to next call
                    }

                    const html = response.data;


                    // Parse the document body
                    const $ = cheerio.load(html);

                    getColumnHeaders($);
                    getColumnValues($);

                    // -- DEBUG
                    // console.log(`Rows retrieved: ${currRows.length}`);

                    if (currRows.length === 0) {
                        weeksRemaining = false;
                        continue;
                    }

                    currRows.forEach(row => {
                        /*
                         * {
                                "RK": "1",
                                "PLAYER": "Russell Wilson, QB",
                                "TEAM": "SEA",
                                "RESULT": "L 33-27  vs. NO",
                                "Completions": "32",
                                "Attempts": "50",
                                "Passing yards": "406",
                                "Passing touchdowns": "2",
                                "Interceptions thrown": "0",
                                "Sacks": "0",
                                "Fumbles lost": "0",
                                "Passer (QB) Rating": "102.6"
                            }
                         * 
                         */

                        // -- build out player entry
                        const lcRow = {};
                        Object.keys(row).forEach(key => {
                            lcRow[key.toLowerCase()] = row[key];
                        })
                        const [name, position] = lcRow["player"].split(",").map(item => item.trim());
                        const entry = {
                            ...lcRow,
                            name,
                            position,
                            year,
                            week,
                            type
                        };

                        // -- remove unused props
                        delete entry["rk"];
                        delete entry["player"];

                        // -- add to overall stats
                        weeklyStats.push(entry);
                    });
                }
                catch (ex) {
                    console.log("Error occurred while fetching data");
                    continue; // -- move on to next call
                }
            }
        }
        // console.log(`Player count: ${Object.keys(players).length}`);
    }
    // console.log(JSON.stringify(weeklyStats));
    return weeklyStats;
};

// const allStats = [];
// let urlWeek = 3, urlYear = 2019, urlStatType = "passing";
// const currentStats = {
//     year: urlYear,
//     week: urlWeek,
//     passing: [],
//     rushing: [],
//     receiving: [],
//     defensive: []
// }
// const startingPage = `http://www.espn.com/nfl/weekly/leaders/_/week/${urlWeek}/year/${urlYear}/type/${urlStatType}`;
// const init = () => {
//     console.log("Visiting page " + startingPage);
//     request(startingPage, function (error, response, body) {
//         if (error) {
//             console.log("Error: " + error);
//         }
//         // Check status code (200 is HTTP OK)
//         console.log("Status code: " + response.statusCode);
//         if (response.statusCode === 200) {
//             // Parse the document body
//             const $ = cheerio.load(body);
//             // console.log("Page title:  " + $('title').text());
//             // console.log($('h1'));

//             // getCurrentWeek($);
//             getColumnHeaders($);
//             getColumnValues($);

//             allStats.push(currentStats);
//             allStats.forEach(stat => {
//                 console.log(JSON.stringify(stat));
//             });
//         }
//     });
// };

const currHeaders = [];
const getColumnHeaders = ($) => {
    // -- clear out array from old values
    currHeaders.splice(0, currHeaders.length);

    $("tr[class='colhead'] > td").each((index, element) => {
        if ($(element).children().length > 0) {
            $(element).children().each((childIndex, childElement) => {
                currHeaders.push($(childElement).attr("title"));
            })
        }
        else {
            currHeaders.push($(element).text());
        }

    });

    // currHeaders.forEach(col => console.log(col));
};

const currRows = [];
const getColumnValues = ($) => {
    // -- clear out array from old values
    currRows.splice(0, currRows.length);

    let currElement = $("tr[class='colhead']");
    currElement.siblings().each((index, element) => {
        if ($(element).children().length > 4) {  // -- most have more than 4 columns to contain stats
            const player = {}
            $(element).children().each((childIndex, childElement) => {
                player[currHeaders[childIndex]] = $(childElement).text();
            });
            currRows.push(player);
        }
    });
};

// store as weekly stats

// init();
// getStats();
module.exports.getStats = getStats;
module.exports.TEAM_ABBRV = TEAM_ABBRV;