/*
 *
 Points
	Offense

	Defense
		Sack +1 Pt
		Interception +2 Pts
		Fumble Recovery +2 Pts
		Punt/Kickoff/FG Return for TD +6 Pts
		Interception Return TD +6 Pts
		Fumble Recovery TD +6 Pts
		Blocked Punt or FG Return TD +6 Pts
		Safety +2 Pts
		Blocked Kick +2 Pts
		2 Pt Conversion/Extra Point Return +2 Pts
		
		(Points Allowed only includes points surrendered while defense/special teams is on the field, not something like a pick six)
		0 Points Allowed +10 Pts
		1 – 6 Points Allowed +7 Pts
		7 – 13 Points Allowed +4 Pts
		14 – 20 Points Allowed +1 Pt
		21 – 27 Points Allowed +0 Pts
		28 – 34 Points Allowed -1 Pt
		35+ Points Allowed -4 Pts
		
	Kicker Categories
		Extra Point +1 Pt
		0-39 Yard FG +3 Pts
		40-49 Yard FG +4 Pts
		50+ Yard FG +5 Pts
 * 
 */

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
        }

        DKPlayers.push({
            name: player,
            team: averageData[player]["team"],
            draftKingsPoints: totalPoints
        });
    });

    // -- sort averageData array
    DKPlayers.sort(function (a, b) {
        return a.draftKingsPoints > b.draftKingsPoints ? -1 : 1;
    });

    console.log(JSON.stringify(DKPlayers));
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