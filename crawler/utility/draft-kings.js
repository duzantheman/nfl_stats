const axios = require('axios');

const DK_TEAM_ABBRV_CONV = {
    "PIT": "Pittsburg Steelers",
    "CHI": "CHI",
    "CLE": "Cleveland Browns",
    "CAR": "Carolina Panthers",
    "SF": "SFO",
    "NOR": "New Orleans Saints",
    "MIN": "Minnesota Vikings",
    "PHI": "PHI",
    "SEA": "Seattle Seahawks",
    "HOU": "Houston Texans",
    "WAS": "Washington (Redskins)",
    "JAX": "Jacksonville Jaguars",
    "IND": "Indianapolis Colts",
    "TEN": "Tennessee Titans",
    "NE": "NWE",
    "GB": "GNB",
    "LV": "LVR",
    "CIN": "Cincinnati Bengals",
    "NYG": "NYG",
    "DEN": "Denver Broncos",
    "TB": "TAM",
    "LAR": "LAR",
    "LAC": "Los Angeles Chargers",
    "BUF": "BUF",
    "MIA": "Miami Dolphins",
    "ATL": "ATL",
    "NYJ": "New York Jets",
    "DET": "Detriot Lions",
    "ARI": "Arizone Cardinals",
    "DAL": "Dallas Cowboys",
    "KC": "KAN",
    "BAL": "Baltimore Ravens"
};

const getDraftKingsValue = (averageData, numberOfWeeks) => {

    // console.log(JSON.stringify(averageData));

    const DKPlayers = [];
    Object.keys(averageData).forEach(player => {
        let totalPoints = 0;

        if (player.includes("-DST")) {
            // -- DST
            totalPoints += parseFloat(averageData[player][`avgDraftKingsPoints`] || 0);
        }
        else {
            // FG Return for TD +6 Pts
            // 2 Pt Conversion (Pass, Run, or Catch) +2 Pts
            // Offensive Fumble Recovery TD +6 Pts

            // -- Offensive
            totalPoints += parseFloat(averageData[player][`avgPassingYards`] || 0) * 0.04;
            totalPoints += parseFloat(averageData[player][`avgPassingYards`] || 0) >= 300 ? 3 : 0;
            totalPoints += parseFloat(averageData[player][`avgPassingTD`] || 0) * 4;
            totalPoints += parseFloat(averageData[player][`avgRushingYards`] || 0) * 0.1;
            totalPoints += parseFloat(averageData[player][`avgRushingYards`] || 0) >= 100 ? 3 : 0;
            totalPoints += parseFloat(averageData[player][`avgRushingTD`] || 0) * 6;
            totalPoints += parseFloat(averageData[player][`avgReceptions`] || 0) * 1;
            totalPoints += parseFloat(averageData[player][`avgReceivingYards`] || 0) * 0.1;
            totalPoints += parseFloat(averageData[player][`avgReceivingYards`] || 0) >= 100 ? 3 : 0;
            totalPoints += parseFloat(averageData[player][`avgReceivingTD`] || 0) * 6;
            totalPoints += parseFloat(averageData[player][`avgInterceptions`] || 0) * -1;
            totalPoints += parseFloat(averageData[player][`avgFumblesLost`] || 0) * -1;
            totalPoints += parseFloat(averageData[player][`avgKickReturnTD`] || 0) * 6;

            // -- Returns
            totalPoints += parseFloat(averageData[player][`totalKickReturnTD`] || 0) * 6;

            // -- Kicking
            // Extra Point +1 Pt
            // 0-39 Yard FG +3 Pts
            // 40-49 Yard FG +4 Pts
            // 50+ Yard FG +5 Pts
            // -- TODO: right now we dont have data for FG distance, so we are defaulting to 3 points for each FG
            totalPoints += parseFloat(averageData[player][`avgExtraPoints`] || 0) * 1;
            totalPoints += parseFloat(averageData[player][`avgFieldGoals`] || 0) * 3;
        }

        DKPlayers.push({
            name: player,
            team: averageData[player]["team"],
            draftKingsPoints: totalPoints,

            // -- DEBUG - temporary to see stats associated with player
            properties: { ...averageData[player] }
        });
    });

    return DKPlayers;
};

const getPlayerSalaries = async (teamA, teamB) => {
    // -- retrieve current NFL captains games
    let page = "https://api.draftkings.com/draftgroups/v1/";
    console.log("Visiting page " + page);
    try {
        const response = await axios.get(page);
        if (response.status !== 200) {
            console.log("Error occurred while fetching data");
        }

        const playableGames = response.data.draftGroups.filter(draftGroup => draftGroup.contestType.contestTypeId === 96);
        const game = playableGames.find(draftGroup => {
            const teamAbbrvs = draftGroup.games[0].description.split("@").map(team => DK_TEAM_ABBRV_CONV[team.trim()]);
            console.log(teamAbbrvs);
            return teamAbbrvs.includes(teamA) && teamAbbrvs.includes(teamB);
        });
        if (!game) {
            console.log(`Couldnt find game for ${teamA} and ${teamB}.`);
            return null;
        }

        // -- retrieve player lineup from the game we're looking for
        page = `https://www.draftkings.com/lineup/getavailableplayers?draftGroupId=${game.draftGroupId}`;
        console.log("Visiting page " + page);
        const playersResponse = await axios.get(page);
        if (playersResponse.status !== 200) {
            console.log("Error occurred while fetching data");
        }

        // -- build out team id reference object
        let teamInfo = {};
        Object.keys(playersResponse.data.teamList).forEach(key => {
            const item = playersResponse.data.teamList[key];
            teamInfo[item.htid] = item.ht;
            teamInfo[item.atid] = item.at;
        });

        // -- build out available players list
        const dkPlayersList = [];
        playersResponse.data.playerList.forEach(dkPlayer => {
            const teamAbbrv = DK_TEAM_ABBRV_CONV[teamInfo[dkPlayer.tid]];
            if (dkPlayer.IsDisabledFromDrafting === false && dkPlayer.i !== "IR" && dkPlayer.i !== "O") {
                if (dkPlayer.pn === "DST") {
                    dkPlayersList.push({
                        "name": `${teamAbbrv}-${dkPlayer.pn}`,
                        "team": teamAbbrv,
                        "position": dkPlayer.pn,
                        "salary": dkPlayer.s
                    });
                } else {
                    dkPlayersList.push({
                        "name": `${dkPlayer.fn} ${dkPlayer.ln}`,
                        "team": teamAbbrv,
                        "position": dkPlayer.pn,
                        "salary": dkPlayer.s
                    });
                }
            } else {
                dkPlayersList.push({
                    "name": `${dkPlayer.fn} ${dkPlayer.ln}`,
                    "team": teamAbbrv,
                    "injured": true
                });
            }
        });

        return dkPlayersList;
    }
    catch (ex) {
        console.log("Error occurred while fetching data");
        console.log(ex);
    }
};

const getDraftKingsValue_newer = (averageData, numberOfWeeks) => {
    const DKPlayers = [];
    Object.keys(averageData).forEach(player => {
        for (i = 1; i <= numberOfWeeks; i++) {
            let totalPoints = 0;

            if (player.includes("-DST")) {
                // -- DST
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgDraftKingsPoints`] || 0);
            }
            else {
                // FG Return for TD +6 Pts
                // 2 Pt Conversion (Pass, Run, or Catch) +2 Pts
                // Offensive Fumble Recovery TD +6 Pts

                // -- Offensive
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgPassingYards`] || 0) * 0.04;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgPassingYards`] || 0) >= 300 ? 3 : 0;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgPassingTD`] || 0) * 4;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgRushingYards`] || 0) * 0.1;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgRushingYards`] || 0) >= 100 ? 3 : 0;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgRushingTD`] || 0) * 6;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgReceptions`] || 0) * 1;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgReceivingYards`] || 0) * 0.1;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgReceivingYards`] || 0) >= 100 ? 3 : 0;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgReceivingTD`] || 0) * 6;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgInterceptions`] || 0) * -1;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgFumblesLost`] || 0) * -1;
                totalPoints += parseFloat(averageData[player][`${i}-weekAvgKickReturnTD`] || 0) * 6;
            }

            DKPlayers.push({
                name: player,
                team: averageData[player]["team"],
                draftKingsPoints: totalPoints
            });
        }
    });

    // -- sort averageData array
    DKPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });

    console.log(JSON.stringify(DKPlayers));
}

const getDraftKingsValue_old = (averageData) => {
    averageData.forEach(player => {
        const temp = {
            "team": "NYJ",
            "totalPassingTD": 2,
            "totalPassingYards": 347,
            "totalRushingTD": 0,
            "totalRushingYards": 27,
            "totalReceivingTD": 0,
            "totalReceivingYards": 0,
            "totalReceptions": 0,
            "totalInterceptions": 3,
            "totalFumblesLost": 0,
            "1-weekAvgPassingTD": 1,
            "1-weekAvgPassingYards": 168,
            "1-weekAvgRushingTD": 0,
            "1-weekAvgRushingYards": 20,
            "1-weekAvgReceivingTD": 0,
            "1-weekAvgReceivingYards": 0,
            "1-weekAvgReceptions": 0,
            "1-weekAvgInterceptions": 3,
            "1-weekAvgFumblesLost": 0,
            "2-weekAvgPassingTD": 1,
            "2-weekAvgPassingYards": 173.5,
            "2-weekAvgRushingTD": 0,
            "2-weekAvgRushingYards": 13.5,
            "2-weekAvgReceivingTD": 0,
            "2-weekAvgReceivingYards": 0,
            "2-weekAvgReceptions": 0,
            "2-weekAvgInterceptions": 1.5,
            "2-weekAvgFumblesLost": 0
        };
        let totalPoints = 0;

        // -- universal stats
        const fumblesLost = parseInt(player["fumbles lost"]);

        switch (player.type) {
            case "passing":
                const passingYards = parseInt(player["passing yards"]);
                const passingTDs = parseInt(player["passing touchdowns"]);
                const interceptions = parseInt(player["interceptions thrown"]);

                totalPoints += passingYards * 0.04;
                totalPoints += passingYards >= 300 ? 3 : 0;
                totalPoints += passingTDs * 4;
                totalPoints -= interceptions;
                totalPoints -= fumblesLost;
                break;
            case "rushing":
                const rushingYards = parseInt(player["rushing yards"]);
                const rushingTDs = parseInt(player["rushing touchdowns"]);

                totalPoints += rushingYards * 0.1;
                totalPoints += rushingYards >= 100 ? 3 : 0;
                totalPoints += rushingTDs * 6;
                totalPoints -= fumblesLost;
                break;
            case "receiving":
                const receptions = parseInt(player["receptions"]);
                const receivingYards = parseInt(player["receiving yards"]);
                const receivingTDs = parseInt(player["receiving touchdowns"]);

                totalPoints += receptions;
                totalPoints += receivingYards * 0.1;
                totalPoints += receivingYards >= 100 ? 3 : 0;
                totalPoints += receivingTDs * 6;
                totalPoints -= fumblesLost;
                break;
            // case "defensive":
            //     const sacks = parseInt(player["total sacks"]);
            //     const interceptions = parseInt(player["interceptions"]);
            //     const pickSix = parseInt(player["interceptions returned for touchdowns"]);

            //     totalPoints += sacks;
            //     totalPoints += interceptions * 2;
            //     totalPoints += pickSix * 6;
            //     break;
            default:
                console.log(`Not valid player type: ${player.type}`);
        }

        player.draftKingsPoints = totalPoints;
    });

    // -- sort averageData array
    averageData.sort(function (a, b) {
        // if (a.draftKingsPoints > b.draftKingsPoints) {
        //   return -1;
        // }
        // if (nameA > nameB) {
        //   return 1;
        // }

        // // names must be equal
        // return 0;

        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });

    console.log(JSON.stringify(averageData));
}

module.exports.getDraftKingsValue = getDraftKingsValue;
module.exports.getPlayerSalaries = getPlayerSalaries;