import { mkdir, writeFile } from "node:fs/promises";
import {
  SHIPS,
  STAGES,
  type Coord,
  type Orientation,
  type ShipId,
} from "../app/game/constants.ts";
import {
  Board,
  SeededRandom,
  type AttackResult,
} from "../app/game/engine.ts";
import {
  EnemyAI,
  type AIDecision,
  type AIProfile,
} from "../app/game/EnemyAI.ts";
import {
  FULL_FLEET,
  aiSkillFor,
  enemyFleetFor,
  survivingFleet,
} from "../app/game/Campaign.ts";
import { nextSubmarineWake } from "../app/game/SubmarineWake.ts";

type Winner = "player" | "enemy" | "draw";
type CandidateKind = "baseline" | "remove" | "swap";
type Candidate = {
  id: string;
  label: string;
  kind: CandidateKind;
  stage: number | null;
  from?: ShipId;
  to?: ShipId;
  cellDelta: number;
  shipDelta: number;
  magnitude: number;
};
type BattleResult = {
  winner: Winner;
  actions: number;
  ownSunk: ShipId[];
  ownShips: number;
  ownCells: number;
};
type CampaignResult = {
  fullClear: boolean;
  onePassClear: boolean;
  reached: number[];
  eventualClears: number[];
  firstAttemptWins: number[];
  attempts: number[];
  enteringFleet: number[];
  finalFleet: number;
  totalActions: number;
  losses: ShipId[];
};
type Aggregate = ReturnType<typeof aggregateCampaigns>;

type Placement = {
  start: Coord;
  orientation: Orientation;
};

const SCREEN_TRIALS = Math.max(80, Number(process.env.SURVIVAL_SCREEN_TRIALS ?? 220));
const CALIBRATION_TRIALS = Math.max(80, Number(process.env.SURVIVAL_CALIBRATION_TRIALS ?? 220));
const FINAL_TRIALS = Math.max(500, Number(process.env.SURVIVAL_FINAL_TRIALS ?? 3000));
const FINALIST_COUNT = Math.max(4, Number(process.env.SURVIVAL_FINALIST_COUNT ?? 6));
const MAX_ACTIONS = 320;
const MAX_STAGE_ATTEMPTS = 3;
const TARGET_RETRY_CLEAR_RATE = 0.08;
const PLAYER_SKILLS = [1.35, 1.55, 1.75, 1.95, 2.15, 2.35, 2.55, 2.75, 2.95];
const BASELINE: Candidate = {
  id: "baseline",
  label: "現行構成",
  kind: "baseline",
  stage: null,
  cellDelta: 0,
  shipDelta: 0,
  magnitude: 0,
};

const SHIP_LABEL: Record<ShipId, string> = {
  carrier: "空母",
  battleship: "戦艦",
  cruiser: "巡洋艦",
  destroyer: "駆逐艦",
  escort: "護衛艦",
  submarine: "潜水艦",
  silentSubmarine: "特殊潜航艦",
};

const SHIP_CAPABILITY: Record<ShipId, string> = {
  carrier: "F-4 PHANTOMを失う",
  battleship: "HARPOONを失う",
  cruiser: "SEA SPARROWを失う",
  destroyer: "MK-45 IIを失う",
  escort: "F-4またはHARPOONの追加1回を失う",
  submarine: "SPS-10 RADARを失う",
  silentSubmarine: "緊急潜航・無音行動を失う",
};

const BASE_LAYOUTS: ReadonlyArray<Partial<Record<ShipId, Placement>>> = [
  {
    carrier: { start: { x: 0, y: 0 }, orientation: "east" },
    battleship: { start: { x: 0, y: 3 }, orientation: "east" },
    escort: { start: { x: 1, y: 2 }, orientation: "east" },
    cruiser: { start: { x: 6, y: 0 }, orientation: "south" },
    destroyer: { start: { x: 5, y: 5 }, orientation: "east" },
    submarine: { start: { x: 7, y: 7 }, orientation: "east" },
  },
  {
    carrier: { start: { x: 6, y: 0 }, orientation: "south" },
    battleship: { start: { x: 4, y: 0 }, orientation: "south" },
    escort: { start: { x: 5, y: 1 }, orientation: "south" },
    cruiser: { start: { x: 4, y: 6 }, orientation: "west" },
    destroyer: { start: { x: 2, y: 5 }, orientation: "south" },
    submarine: { start: { x: 0, y: 7 }, orientation: "east" },
  },
  {
    carrier: { start: { x: 4, y: 6 }, orientation: "west" },
    battleship: { start: { x: 3, y: 4 }, orientation: "west" },
    escort: { start: { x: 5, y: 5 }, orientation: "west" },
    cruiser: { start: { x: 1, y: 4 }, orientation: "north" },
    destroyer: { start: { x: 0, y: 2 }, orientation: "west" },
    submarine: { start: { x: 0, y: 0 }, orientation: "east" },
  },
  {
    carrier: { start: { x: 0, y: 4 }, orientation: "north" },
    battleship: { start: { x: 3, y: 3 }, orientation: "north" },
    escort: { start: { x: 2, y: 5 }, orientation: "north" },
    cruiser: { start: { x: 0, y: 1 }, orientation: "east" },
    destroyer: { start: { x: 5, y: 0 }, orientation: "north" },
    submarine: { start: { x: 7, y: 0 }, orientation: "east" },
  },
];

function shipSize(id: ShipId) {
  return SHIPS.find((ship) => ship.id === id)?.size ?? 0;
}

function aliveShips(board: Board) {
  return board.ships.filter((ship) => !ship.sunk).length;
}

function aliveCells(board: Board) {
  return board.ships.reduce(
    (total, ship) => total + Math.max(0, ship.size - ship.hits.size),
    0,
  );
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function placePlayerFleet(board: Board, fleet: ShipId[], rng: SeededRandom) {
  board.reset();
  const startIndex = rng.int(BASE_LAYOUTS.length);
  for (let offset = 0; offset < BASE_LAYOUTS.length; offset += 1) {
    const layout = BASE_LAYOUTS[(startIndex + offset) % BASE_LAYOUTS.length];
    board.reset();
    let valid = true;
    for (const id of fleet) {
      const placement = layout[id];
      if (!placement || !board.placeShip(id, placement.start, placement.orientation)) {
        valid = false;
        break;
      }
    }
    if (valid && board.allPlaced(fleet)) return;
  }
  board.randomize(rng, fleet);
}

function enemyProfile(stageId: number): AIProfile {
  return stageId === 5 ? "silent" : "tactics";
}

function enemyBreadth(stageId: number) {
  return stageId === 6 ? 3 : 1;
}

function compositionFor(candidate: Candidate, stageIndex: number) {
  const stage = STAGES[stageIndex];
  const base = enemyFleetFor("survival", stage);
  if (candidate.stage !== stage.id || candidate.kind === "baseline") return base;
  if (candidate.kind === "remove" && candidate.from) {
    return base.filter((id) => id !== candidate.from);
  }
  if (candidate.kind === "swap" && candidate.from && candidate.to) {
    return base.map((id) => (id === candidate.from ? candidate.to! : id));
  }
  return base;
}

function act(args: {
  ai: EnemyAI;
  otherAi: EnemyAI;
  own: Board;
  target: Board;
  decision: AIDecision;
  wakes: Coord[];
  rng: SeededRandom;
}) {
  const { ai, otherAi, own, target, decision, wakes, rng } = args;
  if (decision.weapon === "hold") return;
  if (decision.weapon === "radar") {
    const origin = decision.targets[0];
    ai.observeRadar(origin, target.radar(origin));
  } else {
    const results: AttackResult[] = [];
    for (const coord of decision.targets) {
      const result = target.attack(coord);
      if (result.kind !== "ALREADY") results.push(result);
    }
    ai.observe(results);
    if (
      results.some(
        (result) =>
          result.shipId === "silentSubmarine" && result.kind === "HIT",
      )
    ) {
      target.relocateShip("silentSubmarine", rng);
    }
  }
  const wake = nextSubmarineWake(own, wakes, rng, decision.actor);
  if (wake) {
    wakes.push(wake);
    otherAi.observeWake(wake);
  }
}

function battle(args: {
  stageIndex: number;
  seed: number;
  playerFleet: ShipId[];
  playerSkill: number;
  candidate: Candidate;
}): BattleResult {
  const { stageIndex, seed, playerFleet, playerSkill, candidate } = args;
  const stage = STAGES[stageIndex];
  const rivalFleet = compositionFor(candidate, stageIndex);
  const playerBoard = new Board();
  const enemyBoard = new Board();
  const playerPlacementRng = new SeededRandom(seed ^ 0x9e3779b9);
  const enemyPlacementRng = new SeededRandom(seed ^ 0x6d2b79f5);
  placePlayerFleet(playerBoard, playerFleet, playerPlacementRng);
  enemyBoard.randomize(enemyPlacementRng, rivalFleet);

  const playerAi = new EnemyAI(
    new SeededRandom(seed ^ 0x243f6a88),
    rivalFleet,
    playerSkill,
    "tactics",
    1,
  );
  const enemyAi = new EnemyAI(
    new SeededRandom(seed ^ 0x51f15e),
    playerFleet,
    aiSkillFor("survival", stage.id, stage.aiSkill),
    enemyProfile(stage.id),
    enemyBreadth(stage.id),
  );
  const playerWakes: Coord[] = [];
  const enemyWakes: Coord[] = [];
  let winner: Winner = "draw";
  let actions = 0;

  for (; actions < MAX_ACTIONS; actions += 1) {
    const enemyActs = actions % 2 === 0;
    if (enemyActs) {
      act({
        ai: enemyAi,
        otherAi: playerAi,
        own: enemyBoard,
        target: playerBoard,
        decision: enemyAi.decide(enemyBoard),
        wakes: enemyWakes,
        rng: enemyPlacementRng,
      });
      if (playerBoard.allSunk()) {
        winner = "enemy";
        actions += 1;
        break;
      }
    } else {
      act({
        ai: playerAi,
        otherAi: enemyAi,
        own: playerBoard,
        target: enemyBoard,
        decision: playerAi.decide(playerBoard),
        wakes: playerWakes,
        rng: playerPlacementRng,
      });
      if (enemyBoard.allSunk()) {
        winner = "player";
        actions += 1;
        break;
      }
    }
  }

  return {
    winner,
    actions,
    ownSunk: playerBoard.ships
      .filter((ship) => ship.sunk)
      .map((ship) => ship.id),
    ownShips: aliveShips(playerBoard),
    ownCells: aliveCells(playerBoard),
  };
}

function campaign(args: {
  campaignIndex: number;
  playerSkill: number;
  candidate: Candidate;
}): CampaignResult {
  const { campaignIndex, playerSkill, candidate } = args;
  let fleet: ShipId[] = [...FULL_FLEET];
  let fullClear = true;
  let onePassClear = true;
  let finalFleet = fleet.length;
  let totalActions = 0;
  const reached = Array(STAGES.length).fill(0) as number[];
  const eventualClears = Array(STAGES.length).fill(0) as number[];
  const firstAttemptWins = Array(STAGES.length).fill(0) as number[];
  const attempts = Array(STAGES.length).fill(0) as number[];
  const enteringFleet = Array(STAGES.length).fill(0) as number[];
  const losses: ShipId[] = [];

  for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) {
    reached[stageIndex] = 1;
    enteringFleet[stageIndex] = fleet.length;
    const arrivalFleet = [...fleet];
    let stageWon = false;
    for (let attempt = 0; attempt < MAX_STAGE_ATTEMPTS; attempt += 1) {
      attempts[stageIndex] += 1;
      const seed =
        campaignIndex * 1_000_003 +
        stageIndex * 100_003 +
        attempt * 10_007;
      const result = battle({
        stageIndex,
        seed,
        playerFleet: arrivalFleet,
        playerSkill,
        candidate,
      });
      totalActions += result.actions;
      if (result.winner !== "player") {
        onePassClear = false;
        continue;
      }
      if (attempt === 0) firstAttemptWins[stageIndex] = 1;
      eventualClears[stageIndex] = 1;
      fleet = survivingFleet(arrivalFleet, result.ownSunk);
      for (const id of result.ownSunk) losses.push(id);
      finalFleet = fleet.length;
      stageWon = fleet.length > 0;
      break;
    }
    if (!stageWon) {
      fullClear = false;
      finalFleet = arrivalFleet.length;
      break;
    }
  }

  return {
    fullClear,
    onePassClear: fullClear && onePassClear,
    reached,
    eventualClears,
    firstAttemptWins,
    attempts,
    enteringFleet,
    finalFleet,
    totalActions,
    losses,
  };
}

function wilson(successes: number, trials: number) {
  const z = 1.96;
  const p = successes / Math.max(1, trials);
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) /
    denominator;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

function aggregateCampaigns(results: CampaignResult[]) {
  const trials = results.length;
  const fullClears = results.filter((result) => result.fullClear).length;
  const onePassClears = results.filter((result) => result.onePassClear).length;
  const reached = STAGES.map((_, stageIndex) =>
    results.reduce((total, result) => total + result.reached[stageIndex], 0),
  );
  const eventualClears = STAGES.map((_, stageIndex) =>
    results.reduce(
      (total, result) => total + result.eventualClears[stageIndex],
      0,
    ),
  );
  const firstAttemptWins = STAGES.map((_, stageIndex) =>
    results.reduce(
      (total, result) => total + result.firstAttemptWins[stageIndex],
      0,
    ),
  );
  const attempts = STAGES.map((_, stageIndex) =>
    results.reduce((total, result) => total + result.attempts[stageIndex], 0),
  );
  const enteringFleet = STAGES.map((_, stageIndex) => {
    const values = results
      .filter((result) => result.reached[stageIndex] > 0)
      .map((result) => result.enteringFleet[stageIndex]);
    return mean(values);
  });
  const lossFrequency: Record<string, number> = {};
  for (const result of results) {
    for (const id of result.losses) {
      lossFrequency[id] = (lossFrequency[id] ?? 0) + 1;
    }
  }
  return {
    trials,
    fullClears,
    retryClearRate: fullClears / Math.max(1, trials),
    retryClear95: wilson(fullClears, trials),
    onePassClears,
    onePassClearRate: onePassClears / Math.max(1, trials),
    onePassClear95: wilson(onePassClears, trials),
    reachRates: reached.map((value) => value / Math.max(1, trials)),
    eventualStageClearRates: eventualClears.map(
      (value, stageIndex) => value / Math.max(1, reached[stageIndex]),
    ),
    firstAttemptStageWinRates: firstAttemptWins.map(
      (value, stageIndex) => value / Math.max(1, reached[stageIndex]),
    ),
    averageAttemptsWhenReached: attempts.map(
      (value, stageIndex) => value / Math.max(1, reached[stageIndex]),
    ),
    averageEnteringFleet: enteringFleet,
    averageFinalFleet: mean(results.map((result) => result.finalFleet)),
    averageFinalFleetOnClear: mean(
      results.filter((result) => result.fullClear).map((result) => result.finalFleet),
    ),
    averageActions: mean(results.map((result) => result.totalActions)),
    lossFrequency,
  };
}

function evaluate(candidate: Candidate, playerSkill: number, trials: number) {
  const results: CampaignResult[] = [];
  for (let campaignIndex = 1; campaignIndex <= trials; campaignIndex += 1) {
    results.push(campaign({ campaignIndex, playerSkill, candidate }));
  }
  return { candidate, aggregate: aggregateCampaigns(results), results };
}

function candidateList() {
  const candidates: Candidate[] = [BASELINE];
  for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) {
    const stage = STAGES[stageIndex];
    const base = enemyFleetFor("survival", stage);
    for (const id of base) {
      const cells = shipSize(id);
      candidates.push({
        id: `s${stage.id}-remove-${id}`,
        label: `第${stage.id}面：${SHIP_LABEL[id]}を削除`,
        kind: "remove",
        stage: stage.id,
        from: id,
        cellDelta: cells,
        shipDelta: 1,
        magnitude: cells + 0.75,
      });
    }
    for (const from of base) {
      for (const to of FULL_FLEET) {
        if (base.includes(to) || shipSize(to) >= shipSize(from)) continue;
        const delta = shipSize(from) - shipSize(to);
        candidates.push({
          id: `s${stage.id}-swap-${from}-to-${to}`,
          label: `第${stage.id}面：${SHIP_LABEL[from]}→${SHIP_LABEL[to]}`,
          kind: "swap",
          stage: stage.id,
          from,
          to,
          cellDelta: delta,
          shipDelta: 0,
          magnitude: Math.max(0.75, delta),
        });
      }
    }
  }
  return candidates;
}

function pairedDelta(
  baseline: CampaignResult[],
  candidate: CampaignResult[],
  selector: (result: CampaignResult) => boolean,
) {
  const differences = baseline.map((base, index) =>
    Number(selector(candidate[index])) - Number(selector(base)),
  );
  const delta = mean(differences);
  const variance =
    differences.length > 1
      ? differences.reduce(
          (total, value) => total + (value - delta) ** 2,
          0,
        ) /
        (differences.length - 1)
      : 0;
  const margin = 1.96 * Math.sqrt(variance / Math.max(1, differences.length));
  return {
    delta,
    low: delta - margin,
    high: delta + margin,
    gained: differences.filter((value) => value > 0).length,
    lost: differences.filter((value) => value < 0).length,
  };
}

function candidateScore(aggregate: Aggregate, baseline: Aggregate) {
  return (
    (aggregate.retryClearRate - baseline.retryClearRate) * 0.58 +
    (aggregate.onePassClearRate - baseline.onePassClearRate) * 0.22 +
    (aggregate.reachRates[5] - baseline.reachRates[5]) * 0.14 +
    ((aggregate.averageEnteringFleet[5] - baseline.averageEnteringFleet[5]) / 6) * 0.06
  );
}

function choosePlayerSkill() {
  const calibration = PLAYER_SKILLS.map((skill) => {
    const evaluated = evaluate(BASELINE, skill, CALIBRATION_TRIALS);
    return { skill, aggregate: evaluated.aggregate };
  });
  const selected = [...calibration].sort((left, right) => {
    const leftDistance = Math.abs(left.aggregate.retryClearRate - TARGET_RETRY_CLEAR_RATE);
    const rightDistance = Math.abs(right.aggregate.retryClearRate - TARGET_RETRY_CLEAR_RATE);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return right.aggregate.reachRates[5] - left.aggregate.reachRates[5];
  })[0];
  return { calibration, selected };
}

function compositionText(candidate: Candidate) {
  if (candidate.kind === "baseline") return "変更なし";
  if (candidate.kind === "remove" && candidate.from) {
    return `${SHIP_LABEL[candidate.from]}を1隻削除（${SHIP_CAPABILITY[candidate.from]}）`;
  }
  if (candidate.kind === "swap" && candidate.from && candidate.to) {
    return `${SHIP_LABEL[candidate.from]}を${SHIP_LABEL[candidate.to]}へ置換`;
  }
  return candidate.label;
}

function toMarkdown(report: {
  generatedAt: string;
  calibration: Array<{ skill: number; aggregate: Aggregate }>;
  selectedSkill: number;
  screen: Array<{ candidate: Candidate; aggregate: Aggregate; score: number }>;
  finals: Array<{
    candidate: Candidate;
    aggregate: Aggregate;
    retryDelta: ReturnType<typeof pairedDelta>;
    onePassDelta: ReturnType<typeof pairedDelta>;
    efficiency: number;
  }>;
  rawBestId: string;
  recommendedId: string;
}) {
  const lines: string[] = [];
  const baseline = report.finals.find((row) => row.candidate.id === "baseline")!;
  const rawBest = report.finals.find((row) => row.candidate.id === report.rawBestId)!;
  const recommended = report.finals.find(
    (row) => row.candidate.id === report.recommendedId,
  )!;
  lines.push("# Deep Blue Grid SURVIVAL 敵編成監査", "");
  lines.push(`生成日時: ${report.generatedAt}`);
  lines.push(
    `最終比較は現行＋候補ごとに ${FINAL_TRIALS.toLocaleString("ja-JP")} キャンペーン。各面最大${MAX_STAGE_ATTEMPTS}回、到達時艦隊で再挑戦。`,
    "",
  );
  lines.push("## 結論", "");
  lines.push(
    `- 数値上の最大効果: **${rawBest.candidate.label}**。3回再挑戦込みの通し成功率は ${percent(rawBest.aggregate.retryClearRate)}（現行 ${percent(baseline.aggregate.retryClearRate)}、差 ${percent(rawBest.retryDelta.delta)}）。`,
  );
  lines.push(
    `- ゲーム性を残す推奨: **${recommended.candidate.label}**。${compositionText(recommended.candidate)}。変更規模あたりの改善効率 ${recommended.efficiency.toFixed(4)}。`,
  );
  lines.push(
    `- 推奨は第1面と固有ルールの第5面を変更候補から外し、正の効果が確認できた候補のうち効率最大を選択。`,
    "",
  );
  lines.push("## 代理プレイヤー校正", "");
  lines.push("|AI skill|3回再挑戦込み|一発通し|第6面到達|", "|---:|---:|---:|---:|");
  for (const row of report.calibration) {
    lines.push(
      `|${row.skill.toFixed(2)}|${percent(row.aggregate.retryClearRate)}|${percent(row.aggregate.onePassClearRate)}|${percent(row.aggregate.reachRates[5])}|`,
    );
  }
  lines.push(`\n採用 skill: **${report.selectedSkill.toFixed(2)}**（「ギリギリ通せる」基準として8%に最も近いもの）。`, "");
  lines.push("## 3000回最終比較", "");
  lines.push(
    "|候補|変更|3回込み成功率|現行差 (95% CI)|一発通し|第6面到達|第6面進入艦数|効率|",
    "|---|---|---:|---:|---:|---:|---:|---:|",
  );
  for (const row of [...report.finals].sort(
    (a, b) => b.aggregate.retryClearRate - a.aggregate.retryClearRate,
  )) {
    lines.push(
      `|${row.candidate.label}|${compositionText(row.candidate)}|${percent(row.aggregate.retryClearRate)}|${percent(row.retryDelta.delta)} (${percent(row.retryDelta.low)}～${percent(row.retryDelta.high)})|${percent(row.aggregate.onePassClearRate)}|${percent(row.aggregate.reachRates[5])}|${row.aggregate.averageEnteringFleet[5].toFixed(2)}|${row.candidate.kind === "baseline" ? "—" : row.efficiency.toFixed(4)}|`,
    );
  }
  lines.push("", "## 面ごとの実効クリア率（3回以内）", "");
  lines.push("|候補|1|2|3|4|5|6|", "|---|---:|---:|---:|---:|---:|---:|");
  for (const row of [...report.finals].sort(
    (a, b) => b.aggregate.retryClearRate - a.aggregate.retryClearRate,
  )) {
    lines.push(
      `|${row.candidate.label}|${row.aggregate.eventualStageClearRates.map(percent).join("|")}|`,
    );
  }
  lines.push("", "## スクリーニング上位", "");
  lines.push("|順位|候補|試行|3回込み|一発通し|第6面到達|score|", "|---:|---|---:|---:|---:|---:|---:|");
  report.screen.slice(0, 12).forEach((row, index) => {
    lines.push(
      `|${index + 1}|${row.candidate.label}|${row.aggregate.trials}|${percent(row.aggregate.retryClearRate)}|${percent(row.aggregate.onePassClearRate)}|${percent(row.aggregate.reachRates[5])}|${row.score.toFixed(5)}|`,
    );
  });
  lines.push("", "## 解釈上の注意", "");
  lines.push(
    "- プレイヤー代理は毎面、空母・戦艦・護衛艦のDUAL SUPPORT LINKが成立する4種類の回転配置を使い、実装のEnemyAIを熟練側へ校正しています。",
    "- 人間の記憶、賭け、兵装温存を完全には再現しません。絶対勝率より、同一3000シードにおける候補間の相対差を重視してください。",
    "- 最終候補は同じシードで現行と対にして比較し、差の95%区間を算出しています。",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const { calibration, selected } = choosePlayerSkill();
  const candidates = candidateList();
  const baselineScreen = evaluate(BASELINE, selected.skill, SCREEN_TRIALS);
  const screen = candidates
    .filter((candidate) => candidate.kind !== "baseline")
    .map((candidate) => {
      const evaluated = evaluate(candidate, selected.skill, SCREEN_TRIALS);
      return {
        candidate,
        aggregate: evaluated.aggregate,
        score: candidateScore(evaluated.aggregate, baselineScreen.aggregate),
      };
    })
    .sort((left, right) => right.score - left.score);

  const finalistMap = new Map<string, Candidate>();
  for (const row of screen.slice(0, FINALIST_COUNT)) {
    finalistMap.set(row.candidate.id, row.candidate);
  }
  for (const id of [
    "s6-remove-escort",
    "s6-remove-submarine",
    "s2-remove-escort",
  ]) {
    const candidate = candidates.find((item) => item.id === id);
    if (candidate) finalistMap.set(candidate.id, candidate);
  }

  const baselineFinal = evaluate(BASELINE, selected.skill, FINAL_TRIALS);
  const finals = [
    {
      candidate: BASELINE,
      aggregate: baselineFinal.aggregate,
      retryDelta: { delta: 0, low: 0, high: 0, gained: 0, lost: 0 },
      onePassDelta: { delta: 0, low: 0, high: 0, gained: 0, lost: 0 },
      efficiency: 0,
    },
    ...[...finalistMap.values()].map((candidate) => {
      const evaluated = evaluate(candidate, selected.skill, FINAL_TRIALS);
      const retryDelta = pairedDelta(
        baselineFinal.results,
        evaluated.results,
        (result) => result.fullClear,
      );
      const onePassDelta = pairedDelta(
        baselineFinal.results,
        evaluated.results,
        (result) => result.onePassClear,
      );
      return {
        candidate,
        aggregate: evaluated.aggregate,
        retryDelta,
        onePassDelta,
        efficiency:
          (retryDelta.delta * 0.72 +
            onePassDelta.delta * 0.18 +
            (evaluated.aggregate.reachRates[5] -
              baselineFinal.aggregate.reachRates[5]) *
              0.1) /
          Math.max(0.5, candidate.magnitude),
      };
    }),
  ];

  const nonBaseline = finals.filter((row) => row.candidate.kind !== "baseline");
  const rawBest = [...nonBaseline].sort(
    (left, right) => right.retryDelta.delta - left.retryDelta.delta,
  )[0];
  const designSafe = nonBaseline.filter(
    (row) =>
      row.retryDelta.delta > 0 &&
      row.candidate.stage !== 1 &&
      row.candidate.stage !== 5,
  );
  const confirmedDesignSafe = designSafe.filter((row) => row.retryDelta.low > 0);
  const balancedPool = confirmedDesignSafe.length ? confirmedDesignSafe : designSafe;
  const recommended = [...(balancedPool.length ? balancedPool : nonBaseline)].sort(
    (left, right) => right.efficiency - left.efficiency,
  )[0];

  const report = {
    generatedAt: new Date().toISOString(),
    settings: {
      screenTrials: SCREEN_TRIALS,
      calibrationTrials: CALIBRATION_TRIALS,
      finalTrials: FINAL_TRIALS,
      maxStageAttempts: MAX_STAGE_ATTEMPTS,
      maxActionsPerBattle: MAX_ACTIONS,
      targetRetryClearRate: TARGET_RETRY_CLEAR_RATE,
      playerLayoutCount: BASE_LAYOUTS.length,
    },
    currentEnemyFleets: STAGES.map((stage) => ({
      stage: stage.id,
      fleet: enemyFleetFor("survival", stage),
      effectiveCells: enemyFleetFor("survival", stage).reduce(
        (total, id) => total + shipSize(id),
        0,
      ),
    })),
    calibration: calibration.map((row) => ({
      skill: row.skill,
      aggregate: row.aggregate,
    })),
    selectedSkill: selected.skill,
    screen: screen.map((row) => ({
      candidate: row.candidate,
      aggregate: row.aggregate,
      score: row.score,
    })),
    finals: finals.map((row) => ({
      candidate: row.candidate,
      aggregate: row.aggregate,
      retryDelta: row.retryDelta,
      onePassDelta: row.onePassDelta,
      efficiency: row.efficiency,
    })),
    rawBestId: rawBest.candidate.id,
    recommendedId: recommended.candidate.id,
  };
  const md = toMarkdown(report);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/deep-blue-grid-survival-composition-audit.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    "artifacts/deep-blue-grid-survival-composition-audit.md",
    md,
    "utf8",
  );
  console.log(md);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
