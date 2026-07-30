import { SURVIVAL_STAGES, aiSkillFor, enemyFleetFor, huntBreadthFor, isSeaBatStage, survivingFleet } from "../app/game/Campaign.ts";
import { EnemyAI, type AIDecision } from "../app/game/EnemyAI.ts";
import { Board, SeededRandom } from "../app/game/engine.ts";
import { STANDARD_FLEET, type Coord, type ShipId } from "../app/game/constants.ts";
import { nextSubmarineWake } from "../app/game/SubmarineWake.ts";

type AttemptResult = {
  won: boolean;
  survivors: ShipId[];
  actions: number;
};

type OperationTally = {
  reached: number;
  cleared: number;
  attempts: number;
  losses: number;
};

const runs = Math.max(20, Number.parseInt(process.argv[2] ?? "300", 10) || 300);
const retriesPerOperation = Math.max(0, Number.parseInt(process.argv[3] ?? "3", 10) || 0);
const playerSkill = Math.max(.5, Number.parseFloat(process.argv[4] ?? "1.85") || 1.85);
const avoidCenter = (process.argv[5] ?? "center") !== "random";
const maxActions = 240;
const centralKeys = new Set(["3,3", "3,4", "4,3", "4,4"]);
const acceptableLosses = [1, 1, 0, STANDARD_FLEET.length - 1];

function deployPlayer(board: Board, fleet: ShipId[], seed: number) {
  for (let attempt = 0; attempt < 200; attempt++) {
    board.randomize(new SeededRandom(seed ^ attempt * 0x45d9f3b), fleet);
    if (!avoidCenter || board.ships.every((ship) =>
      ship.cells.every((cell) => !centralKeys.has(`${cell.x},${cell.y}`)))) return;
  }
}

function execute(
  decision: AIDecision,
  commander: EnemyAI,
  ownBoard: Board,
  targetBoard: Board,
  relocationRng: SeededRandom,
  ownWakes: Coord[],
  opposingCommander: EnemyAI,
) {
  if (decision.weapon === "silentMove") {
    ownBoard.relocateShip("silentSubmarine", relocationRng, {
      blocked: ownWakes,
      leaveLastKnown: true,
      relaxSignalBlocksWhenTrapped: true,
      resolveContainmentWhenTrapped: true,
    });
    return;
  }
  if (decision.weapon === "radar") {
    const origin = decision.targets[0];
    commander.observeRadar(origin, targetBoard.radar(origin));
  } else {
    commander.observe(decision.targets.map((target) => targetBoard.attack(target)));
  }
  const wake = nextSubmarineWake(ownBoard, ownWakes, relocationRng, decision.actor);
  if (wake && !ownWakes.some((seen) => seen.x === wake.x && seen.y === wake.y)) {
    ownWakes.push(wake);
    opposingCommander.observeWake(wake);
  }
}

function simulateAttempt(operationIndex: number, entryFleet: ShipId[], seed: number): AttemptResult {
  const operation = SURVIVAL_STAGES[operationIndex];
  const hostileFleet = enemyFleetFor("survival", operation);
  const player = new Board();
  const enemy = new Board();
  deployPlayer(player, entryFleet, seed ^ 0x2d4b91);
  enemy.randomize(new SeededRandom(seed ^ 0x7b31c5), hostileFleet);

  const playerCommander = new EnemyAI(
    new SeededRandom(seed ^ 0x159a55),
    hostileFleet,
    playerSkill,
    "tactics",
  );
  const enemyCommander = new EnemyAI(
    new SeededRandom(seed ^ 0x51f15e),
    entryFleet,
    aiSkillFor("survival", operation.id, operation.aiSkill),
    isSeaBatStage("survival", operation) ? "silent" : "tactics",
    huntBreadthFor("survival", operationIndex),
  );
  const playerWakes: Coord[] = [];
  const enemyWakes: Coord[] = [];

  let actions = 0;
  while (actions < maxActions && !player.allSunk() && !enemy.allSunk()) {
    const hostileDecision = enemyCommander.decide(enemy);
    execute(hostileDecision, enemyCommander, enemy, player,
      new SeededRandom(seed ^ (actions + 1) * 0x91e1), enemyWakes, playerCommander);
    actions++;
    if (player.allSunk() || enemy.allSunk()) break;

    const friendlyDecision = playerCommander.decide(player);
    execute(friendlyDecision, playerCommander, player, enemy,
      new SeededRandom(seed ^ (actions + 1) * 0x6d2b), playerWakes, enemyCommander);
    actions++;
  }

  const won = enemy.allSunk() && !player.allSunk();
  return {
    won,
    survivors: won ? player.ships.filter((ship) => !ship.sunk).map((ship) => ship.id) : [],
    actions,
  };
}

const operationTallies: OperationTally[] = SURVIVAL_STAGES.map(() => ({
  reached: 0,
  cleared: 0,
  attempts: 0,
  losses: 0,
}));
let campaignClears = 0;
let finalSurvivors = 0;

for (let run = 0; run < runs; run++) {
  let fleet = [...STANDARD_FLEET];
  let completed = true;
  for (let operationIndex = 0; operationIndex < SURVIVAL_STAGES.length; operationIndex++) {
    const tally = operationTallies[operationIndex];
    tally.reached++;
    const enteringFleet = [...fleet];
    let result: AttemptResult | undefined;
    for (let attempt = 0; attempt <= retriesPerOperation; attempt++) {
      tally.attempts++;
      result = simulateAttempt(
        operationIndex,
        enteringFleet,
        (run + 1) * 0x10001 ^ (operationIndex + 1) * 0x1f123 ^ attempt * 0x71237,
      );
      if (result.won) {
        const losses = enteringFleet.length - result.survivors.length;
        const preserveFleet = losses > acceptableLosses[operationIndex] && attempt < retriesPerOperation;
        if (!preserveFleet) break;
      }
    }
    if (!result?.won) {
      completed = false;
      break;
    }
    tally.cleared++;
    fleet = survivingFleet(enteringFleet, enteringFleet.filter((id) => !result!.survivors.includes(id)));
    tally.losses += enteringFleet.length - fleet.length;
  }
  if (completed) {
    campaignClears++;
    finalSurvivors += fleet.length;
  }
}

console.log(
  `SURVIVAL_MONTE_CARLO runs=${runs} retries_per_operation=${retriesPerOperation} ` +
  `player_skill=${playerSkill.toFixed(2)} placement=${avoidCenter ? "avoid-center-2x2" : "random"}`,
);
for (let index = 0; index < operationTallies.length; index++) {
  const operation = SURVIVAL_STAGES[index];
  const tally = operationTallies[index];
  const clearRate = tally.reached ? tally.cleared / tally.reached * 100 : 0;
  const averageAttempts = tally.reached ? tally.attempts / tally.reached : 0;
  const averageLosses = tally.cleared ? tally.losses / tally.cleared : 0;
  console.log(
    `${index + 1} ${operation.title.padEnd(15)} reach=${tally.reached.toString().padStart(3)} ` +
    `clear=${clearRate.toFixed(1).padStart(5)}% attempts=${averageAttempts.toFixed(2)} ` +
    `losses_on_clear=${averageLosses.toFixed(2)}`,
  );
}
console.log(
  `FULL_CLEAR ${(campaignClears / runs * 100).toFixed(1)}% (${campaignClears}/${runs}) ` +
  `mean_final_survivors=${campaignClears ? (finalSurvivors / campaignClears).toFixed(2) : "0.00"}`,
);
