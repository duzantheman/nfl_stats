/*
 * 1) Get offensive data by player
 * Season endpoint (offensive)
 * https://www.pro-football-reference.com/years/{YYYY}/{statType}.htm
 * YYYY: self-explanatory
 * statType: [passing, rushing, receiving, kicking, returns, scoring]
 * 
 * 2) Grab URL for each player and go to page
 *    - this should look something like: https://www.pro-football-reference.com/players/G/GoffJa00.htm
 *    - replace ".html" with "/gamelog/{YYYY}/"
 *    - this should look something like: https://www.pro-football-reference.com/players/G/GoffJa00/gamelog/2020/
 * 
 * 3) From inside there, parse the stats table
 * 
 * 4) Get defensive data by team
 * Season endpoint (defensive)
 * https://www.pro-football-reference.com/years/{YYYY}/opp.htm
 * YYYY: self-explanatory
 * 
 * 5) Get special teams data by team
 */

/*
 * Scratch the above (but leaving jsut in case)
 * 1) Look up game data by year/week
 *       https://www.pro-football-reference.com/years/{YYYY}/week_{#}.htm
 *       YYYY: self explanatory []
 *       #: single or double digit number representing the week [1-17]
 * 
 * 2) Find the "Final" button, grab the href and go to the location
 * 
 * 3) Look for tables under the following sections...
 *       ["Passing, Rushing, & Receiving", "Defense", "Kick/Punt Returns", "Kicking & Punting"]
 * 
 * 4) Store data by year, week, and team
 */

/*
 * Cheerio Cheatsheet: https://www.w3schools.com/jquery/jquery_ref_selectors.asp
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { VERBOSE } = require("../index");

const TEAM_ABBRV = {
    "PIT": "Pittsburg Steelers",
    "CHI": "Chicago Bears",
    "CLE": "Cleveland Browns",
    "CAR": "Carolina Panthers",
    "SFO": "San Fransisco 49ers",
    "NOR": "New Orleans Saints",
    "MIN": "Minnesota Vikings",
    "PHI": "Philidelphia Eagles",
    "SEA": "Seattle Seahawks",
    "HOU": "Houston Texans",
    "WAS": "Washington (Redskins)",
    "JAX": "Jacksonville Jaguars",
    "IND": "Indianapolis Colts",
    "TEN": "Tennessee Titans",
    "NWE": "New England Patriots",
    "GNB": "Green Bay Packers",
    "LVR": "Las Vegas Raiders",
    "CIN": "Cincinnati Bengals",
    "NYG": "New York Giants",
    "DEN": "Denver Broncos",
    "TAM": "Tampa Bay Buccaneers",
    "LAR": "Los Angeles Rams",
    "LAC": "Los Angeles Chargers",
    "BUF": "Buffalo Bills",
    "MIA": "Miami Dolphins",
    "ATL": "Atlanta Falcons",
    "NYJ": "New York Jets",
    "DET": "Detriot Lions",
    "ARI": "Arizone Cardinals",
    "DAL": "Dallas Cowboys",
    "KAN": "Kansas City Chiefs",
    "BAL": "Baltimore Ravens"
};

const YEARS = [2015, 2016, 2017, 2018, 2019, 2020]; // -- order from low to high
const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // 18-21 are postseason
const PAGE_BASE = "https://www.pro-football-reference.com";

const getStats = async (storedYear, storedWeek) => {
    // const allWeeks = [];
    const allGames = [];
    let weeksRemaining = true;
    let latestYear = storedYear, latestWeek = storedWeek;
    for (const year of YEARS.filter(year => year >= storedYear)) {
        if (!weeksRemaining) continue;
        if (VERBOSE) {
            console.log(`Year: ${year}`);
        }
        latestYear = year;

        for (const week of WEEKS.filter(week => week >= storedWeek)) {
            if (!weeksRemaining) continue;
            if (VERBOSE) {
                console.log(`Week: ${week}`);
            }

            const page = `${PAGE_BASE}/years/${year}/week_${week}.htm`
            if (VERBOSE) {
                console.log("Visiting page " + page);
            }

            try {
                const response = await axios.get(page);
                if (response.status !== 200) {
                    console.log("Error occurred while fetching data");
                    continue; // -- move on to next call
                }
                const html = response.data;

                // -- Parse the document body
                const $ = cheerio.load(html);

                const gamesList = getWeeklyGames($);
                if (gamesList.length === 0) {
                    weeksRemaining = false;
                    continue;
                }

                latestWeek = week;

                // -- DEBUG
                // console.log(gamesList);

                // -- DEBUG -- grab first game in list
                // for (const gameUrl of gamesList.splice(0, 1)) {
                for (const gameUrl of gamesList) {
                    const gameData = await getGameData(PAGE_BASE + gameUrl);
                    allGames.push({
                        year,
                        week,
                        ...gameData
                    });
                }
            }
            catch (ex) {
                console.log("Error occurred while fetching data");
                console.log(ex);
                continue; // -- move on to next call
            }
        }
    }

    return [allGames, latestYear, latestWeek];
};

const getWeeklyGames = ($) => {
    const gamesList = [];
    $("td[class='right gamelink'] > a").each((index, element) => {
        // console.log($(element).attr("href"));
        if ($(element).text().toLowerCase() === "final") {
            gamesList.push($(element).attr("href"));
        }
    });

    return gamesList;
};

const getGameData = async (gameUrl) => {
    if (VERBOSE) {
        console.log("Visiting page " + gameUrl);
    }

    try {
        const response = await axios.get(gameUrl);
        if (response.status !== 200) {
            console.log("Error occurred while fetching data");
            return;
        }
        const html = response.data;

        // -- Parse the document body
        const $ = cheerio.load(html);

        // -- DEBUG
        if (VERBOSE) {
            console.log("Page title:  " + $('title').text());
        }

        let homeTeam, awayTeam;
        const gameStats = {
            // homeTeam: "",
            // awayTeam: "",
            // homeScore: 0,
            // awayScore: 0,
            offense: [],
            defense: [],
            kicking: [],
            returns: [],
            draftKings: []
        }

        // -- get team names
        $(`div#all_team_stats`).contents()
            .filter(function () { return this.type === 'comment'; }).each((index, element) => {
                const $2 = cheerio.load(element.data);
                $2(`table > thead > tr > th`).each((index, element) => {
                    if ($(element).attr("data-stat") === "home_stat") {
                        // gameStats["homeTeam"] = $(element).text();
                        homeTeam = $(element).text();
                    }
                    else if ($(element).attr("data-stat") === "vis_stat") {
                        // gameStats["awayTeam"] = $(element).text();
                        awayTeam = $(element).text();
                    }
                });
            });

        // -- get team scores
        const scores = [];
        $("div.scorebox div.scores > div.score").each((index, element) => {
            // console.log($(element).text());
            scores.push($(element).text());
        });
        gameStats["homeScore"] = scores[0];
        gameStats["awayScore"] = scores[1];

        // -- get offense stats
        $(`table#player_offense > tbody > tr:not(.thead)`).each((index, element) => {
            const playerStats = {};
            $(element).children((childIndex, childElement) => {
                playerStats[$(childElement).attr("data-stat")] = $(childElement).text();
                // console.log($(childElement).attr("data-stat") + ": " + $(childElement).text());
            });
            playerStats["player"] = playerStats["player"].trim();
            gameStats["offense"].push(playerStats);
        });

        // -- get DST stats
        const DIV_IDS = {
            "defense": "all_player_defense",
            "kicking": "all_kicking",
            "returns": "all_returns"
        };
        Object.keys(DIV_IDS).forEach(key => {
            $(`div#${DIV_IDS[key]}`).contents()
                .filter(function () { return this.type === 'comment'; }).each((index, element) => {
                    const $2 = cheerio.load(element.data);
                    $2(`table > tbody > tr:not(.thead)`).each((index, element) => {
                        const playerStats = {};
                        $2(element).children((childIndex, childElement) => {
                            playerStats[$2(childElement).attr("data-stat")] = $2(childElement).text();
                            // console.log($2(childElement).attr("data-stat") + ": " + $2(childElement).text());
                        });
                        gameStats[key].push(playerStats);
                    });
                });
        });

        // -- calculate DraftKings points (offense)
        let homeTeamOffensivePoints = 0, awayTeamOffensivePoints = 0;
        gameStats["offense"].forEach(player => {
            /*
                ----- Points that havent been taken into account yet -----
                ??? 2 Pt Conversion (Pass, Run, or Catch) +2 Pts ???
             */
            let draftKingsPoints = 0;
            draftKingsPoints += parseInt(player["pass_td"] || 0) * 4;
            draftKingsPoints += parseInt(player["pass_yds"] || 0) * 0.04;
            draftKingsPoints += parseInt(player["pass_yds"] || 0) >= 300 ? 3 : 0;
            draftKingsPoints += parseInt(player["pass_int"] || 0) * -1;
            draftKingsPoints += parseInt(player["rush_td"] || 0) * 6;
            draftKingsPoints += parseInt(player["rush_yds"] || 0) * 0.1;
            draftKingsPoints += parseInt(player["rush_yds"] || 0) >= 100 ? 3 : 0;
            draftKingsPoints += parseInt(player["rec_td"] || 0) * 6;
            draftKingsPoints += parseInt(player["rec_yds"] || 0) * 0.1;
            draftKingsPoints += parseInt(player["rec_yds"] || 0) >= 100 ? 3 : 0;
            draftKingsPoints += parseInt(player["rec"] || 0) * 1;
            draftKingsPoints += parseInt(player["fumbles_lost"] || 0) * -1;

            // -- grab any relevant player data from "returns" section
            const playerReturnStats = gameStats["returns"].find(returnPlayer => returnPlayer["player"].trim() === player["player"].trim());
            if (playerReturnStats) {
                draftKingsPoints += parseInt(playerReturnStats["kick_ret_td"] || 0) * 6;
                draftKingsPoints += parseInt(playerReturnStats["punt_ret_td"] || 0) * 6;
            }

            // -- TEMPORARY - move into draft-kings file
            // player["draftKingsPoints"] = draftKingsPoints;
            gameStats["draftKings"].push({
                name: player["player"],
                team: player["team"],
                draftKingsPoints,
            });

            if (player["team"] === homeTeam) {
                homeTeamOffensivePoints += parseInt(player["pass_td"] || 0) * 6;
                homeTeamOffensivePoints += parseInt(player["rush_td"] || 0) * 6;
                // homeTeamOffensivePoints += parseInt(player["rec_td"]) * 6;   // this should already be tallied by passing tds
            }
            else if (player["team"] === awayTeam) {
                awayTeamOffensivePoints += parseInt(player["pass_td"] || 0) * 6;
                awayTeamOffensivePoints += parseInt(player["rush_td"] || 0) * 6;
                // awayTeamOffensivePoints += parseInt(player["rec_td"]) * 6;   // this should already be tallied by passing tds
            }
            else {
                console.log("***** there should always be a matching team *****");
            }
        });

        // TODO: FOR FUTURE USE - store total score in relation to teams, so we can look at past performance of TeamA vs TeamB (may get more in depth in future, eg. TeamA is a rushing team but TeamB has a strong rush defense and therefore TeamA's RB may struggle)

        // -- kicking
        gameStats["kicking"].forEach(player => {
            /*
             *
                Extra Point - +1 Pt
                0-39 Yard FG - +3 Pts
                40-49 Yard FG - +4 Pts
                50+ Yard FG - +5 Pts
             * 
             */
            let draftKingsPoints = 0;
            draftKingsPoints += parseInt(player["xpm"] || 0) * 1;
            draftKingsPoints += parseInt(player["fgm"] || 0) * 3; // TODO: current dont have a way to dinstinguish distance

            // -- TEMPORARY - move into draft-kings file
            // player["draftKingsPoints"] = draftKingsPoints;
            gameStats["draftKings"].push({
                name: player["player"],
                team: player["team"],
                draftKingsPoints,
            });

            if (player["team"] === homeTeam) {
                homeTeamOffensivePoints += parseInt(player["xpm"] || 0) * 1;
                homeTeamOffensivePoints += parseInt(player["fgm"] || 0) * 3;
            }
            else if (player["team"] === awayTeam) {
                awayTeamOffensivePoints += parseInt(player["xpm"] || 0) * 1;
                awayTeamOffensivePoints += parseInt(player["fgm"] || 0) * 3;
            }
            else {
                console.log("***** there should always be a matching team *****");
                console.log(`Player team: ${player["team"]}, Home Team: ${homeTeam}, Away Team: ${awayTeam}`);
            }
        });

        // -- assign team values to total points for DST of each team
        let homeTeamDstTotal = 0, awayTeamDstTotal = 0;
        let homeTeamSackTotal = 0, awayTeamSackTotal = 0;
        gameStats["defense"].forEach(player => {
            /*
                ----- Points that havent been taken into account yet -----
                ??? FG Return for TD +6 Pts ???
                ??? Blocked Punt or FG Return TD +6 Pts ???
                ??? Safety +2 Pts ???
                ??? Blocked Kick +2 Pts ???
                ??? 2 Pt Conversion/Extra Point Return +2 Pts ???
             */

            // -- total team defensive value
            if (player["team"] === homeTeam) {
                // -- add points to home team total
                homeTeamSackTotal += parseFloat(player["sacks"] || 0);
                homeTeamDstTotal += parseInt(player["def_int"] || 0) * 2;
                homeTeamDstTotal += parseInt(player["fumbles_rec"] || 0) * 2;
                homeTeamDstTotal += parseInt(player["def_int_td"] || 0) * 6;
                homeTeamDstTotal += parseInt(player["fumbles_rec_td"] || 0) * 6;
            }
            else if (player["team"] === awayTeam) {
                // -- add points to away team total
                awayTeamSackTotal += parseFloat(player["sacks"] || 0);
                awayTeamDstTotal += parseInt(player["def_int"] || 0) * 2;
                awayTeamDstTotal += parseInt(player["fumbles_rec"] || 0) * 2;
                awayTeamDstTotal += parseInt(player["def_int_td"] || 0) * 6;
                awayTeamDstTotal += parseInt(player["fumbles_rec_td"] || 0) * 6;
            }
            else {
                console.log("***** this should never be the case *****");
                console.log(`Player team: ${player["team"]}, Home Team: ${homeTeam}, Away Team: ${awayTeam}`);
            }
        });

        // -- pulled these out separately to account for partial sacks addition (eg. sacks: 1.5 + 0.5 = 2)
        homeTeamDstTotal += parseInt(homeTeamSackTotal) * 1;
        awayTeamDstTotal += parseInt(awayTeamSackTotal) * 1;

        // -- returns
        gameStats["returns"].forEach(player => {
            let draftKingsPoints = 0;

            // -- grab any players that haven't already been picked up in the offensive stats
            const playerReturnStats = gameStats["returns"].find(returnPlayer => returnPlayer["player"].trim() === player["player"].trim());
            if (!playerReturnStats) {
                draftKingsPoints += parseInt(playerReturnStats["kick_ret_td"] || 0) * 6;
                draftKingsPoints += parseInt(playerReturnStats["punt_ret_td"] || 0) * 6;

                // -- TEMPORARY - move into draft-kings file
                // player["draftKingsPoints"] = draftKingsPoints;
                gameStats["draftKings"].push({
                    name: player["player"],
                    team: player["team"],
                    draftKingsPoints,
                });
            }

            // -- all punt/kickoff return TDs count towards DST value
            if (player["team"] === homeTeam) {
                // -- add points to home team defense total
                homeTeamDstTotal += parseInt(playerReturnStats["kick_ret_td"] || 0) * 6;
                homeTeamDstTotal += parseInt(playerReturnStats["punt_ret_td"] || 0) * 6;
            }
            else if (player["team"] === awayTeam) {
                // -- add points to away team defense total
                awayTeamDstTotal += parseInt(playerReturnStats["kick_ret_td"] || 0) * 6;
                awayTeamDstTotal += parseInt(playerReturnStats["punt_ret_td"] || 0) * 6;
            }
            else {
                console.log("***** this should never be the case *****");
                console.log(`Player team: ${player["team"]}, Home Team: ${homeTeam}, Away Team: ${awayTeam}`);
            }
        });

        /*
            (Points Allowed only includes points surrendered while defense/special teams is on the field, not something like a pick six)
            0 Points Allowed +10 Pts
            1 – 6 Points Allowed +7 Pts
            7 – 13 Points Allowed +4 Pts
            14 – 20 Points Allowed +1 Pt
            21 – 27 Points Allowed +0 Pts
            28 – 34 Points Allowed -1 Pt
            35+ Points Allowed -4 Pts
         */
        if (awayTeamOffensivePoints === 0) {
            homeTeamDstTotal += 10;
        } else if (awayTeamOffensivePoints < 7) {
            homeTeamDstTotal += 7;
        } else if (awayTeamOffensivePoints < 14) {
            homeTeamDstTotal += 4;
        } else if (awayTeamOffensivePoints < 21) {
            homeTeamDstTotal += 1;
        } else if (awayTeamOffensivePoints < 28) {
            homeTeamDstTotal += 0;
        } else if (awayTeamOffensivePoints < 35) {
            homeTeamDstTotal -= 1;
        } else if (awayTeamOffensivePoints >= 35) {
            homeTeamDstTotal -= 4;
        }

        if (homeTeamOffensivePoints === 0) {
            awayTeamDstTotal += 10;
        } else if (homeTeamOffensivePoints < 7) {
            awayTeamDstTotal += 7;
        } else if (homeTeamOffensivePoints < 14) {
            awayTeamDstTotal += 4;
        } else if (homeTeamOffensivePoints < 21) {
            awayTeamDstTotal += 1;
        } else if (homeTeamOffensivePoints < 28) {
            awayTeamDstTotal += 0;
        } else if (homeTeamOffensivePoints < 35) {
            awayTeamDstTotal -= 1;
        } else if (homeTeamOffensivePoints >= 35) {
            awayTeamDstTotal -= 4;
        }

        // -- TEMPORARY - move into draft-kings file
        // gameStats["homeTeamDstTotal"] = {
        //     team: homeTeam,
        //     player: "DST",
        //     draftKingsPoints: homeTeamDstTotal
        // };
        // gameStats["awayTeamDstTotal"] = {
        //     team: awayTeam,
        //     player: "DST",
        //     draftKingsPoints: awayTeamDstTotal
        // };
        gameStats["draftKings"].push({
            name: `${homeTeam}-DST`,
            team: homeTeam,
            draftKingsPoints: homeTeamDstTotal,
        });
        gameStats["draftKings"].push({
            name: `${awayTeam}-DST`,
            team: awayTeam,
            draftKingsPoints: awayTeamDstTotal,
        });

        // -- sort DraftKings points
        gameStats["draftKings"].sort((a, b) => {
            return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
        });


        // -- DEBUG
        // gameStats["offense"].sort(function (a, b) {
        //     return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
        // });
        // gameStats["defense"].sort(function (a, b) {
        //     return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
        // });
        // console.log(JSON.stringify(gameStats));

        return {
            homeTeam,
            awayTeam,
            stats: gameStats
        };
    }
    catch (ex) {
        console.log("Error occurred while fetching data");
        console.log(ex);
        return;
    }
}

const getTopPlayers = (gameStats) => {
    const topAvailablePlayers = [...gameStats["offense"], gameStats["homeTeamDstTotal"], gameStats["awayTeamDstTotal"]]
        .sort(function (a, b) {
            return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
        });

    console.log(JSON.stringify(topAvailablePlayers));
};

// -- Utility Functions

const camelize = (str) => {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}

module.exports.getStats = getStats;
module.exports.TEAM_ABBRV = TEAM_ABBRV;