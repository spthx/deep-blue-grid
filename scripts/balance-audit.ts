import { mkdir, writeFile } from "node:fs/promises";
import {
  SHIPS,
  STAGES,
  type Coord,
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
  type GameMode,
} from "../app/game/Campaign.ts";
import { nextSubmarineWake } from "../app/game/SubmarineWake.ts";

type ArchetypeId = "novice" | "standard" | "expert";
type Winner = "player" | "enemy" | "draw";

type Archetype = {
  id: ArchetypeId;
  label: string;
  profile: AIProfile;
  skill: number;
  huntBreadth: number;
};

type SideMetrics = {
  actions: number;
  attacks: number;
  radarUses: number;
  holds: number;
  targetedCells: number;
  hits: number;
  sunk: number;
  weaponUses: Record<string, number>;
  weaponHits: Record<string, number>;
};

type BattleResult = {
  winner: Winner;
  actions: number;
  playerRemainingShips: number;
  playerRemainingCells: number;
  enemyRemainingShips: number;
  enemyRemainingCells: number;
  playerSunk: ShipId[];
  enemySunk: ShipId[];
  player: SideMetrics;
  enemy: SideMetrics;
};

const AUDIT_SEEDS = Math.max(40, Number(process.env.BALANCE_AUDIT_SEEDS ?? 240));
const SURVIVAL_SEEDS = Math.max(40, Number(process.env.BALANCE_AUDIT_SURVIVAL_SEEDS ?? 240));
const MAX_ACTIONS = 320;

const ARCHETYPES: Archetype[] = [
  { id: "novice", label: "初心者代理", profile: "casual", skill: 0.82, huntBreadth: 7 },
  { id: "standard", label: "標準代理", profile: "tactics", skill: 1.08, huntBreadth: 3 },
  { id: "expert", label: "熟練代理", profile: "tactics", skill: 1.38, huntBreadth: 1 },
];

const MODES: GameMode[] = ["casual", "tactics", "survival"];

function freshSideMetrics(): SideMetrics {
  return {
    actions: 0,
    attacks: 0,
    radarUses: 0,
    holds: 0,
    targetedCells: 0,
    hits: 0,
    sunk: 0,
    weaponUses: {},
    weaponHits: {},
  };
}

function countRemainingShips(board: Board) {
  return board.ships.filter((ship) => !ship.sunk).length;
}

function countRemainingCells(board: Board) {
  return board.ships.reduce(
    (total, ship) => total + Math.max(0, ship.size - ship.hits.size),
    0,
  );
}

function recordWeapon(metrics: SideMetrics, weapon: string, hits = 0) {
  metrics.weaponUses[weapon] = (metrics.weaponUses[weapon] ?? 0) + 1;
  metrics.weaponHits[weapon] = (metrics.weaponHits[weapon] ?? 0) + hits;
}

function applyDecision(args: {
  attackerAi: EnemyAI;
  defenderAi: EnemyAI;
  attackerBoard: Board;
  defenderBoard: Board;
  decision: AIDecision;
  wakes: Coord[];
  rng: SeededRandom;
  metrics: SideMetrics;
}) {
  const {
    attackerAi,
    defenderAi,
    attackerBoard,
    defenderBoard,
    decision,
    wakes,
    rng,
    metrics,
  } = args;

  metrics.actions += 1;

  if (decision.weapon === "hold") {
    metrics.holds += 1;
    return;
  }

  if (decision.weapon === "radar") {
    const origin = decision.targets[0];
    const contact = defenderBoard.radar(origin);
    attackerAi.observeRadar(origin, contact);
    metrics.radarUses += 1;
    recordWeapon(metrics, decision.weapon);
  } else {
    const results: AttackResult[] = [];
    for (const target of decision.targets) {
      const result = defenderBoard.attack(target);
      if (result.kind === "ALREADY") continue;
      results.push(result);
      if (
        result.kind === "HIT" &&
        result.shipId === "silentSubmarine" &&
        !defenderBoard.ships.find((ship) => ship.id === "silentSubmarine")?.sunk
      ) {
        defenderBoard.relocateShip("silentSubmarine", rng);
      }
    }
    attackerAi.observe(results);
    const hits = results.filter((result) => result.kind === "HIT" || result.kind === "SUNK").length;
    metrics.attacks += 1;
    metrics.targetedCells += results.length;
    metrics.hits += hits;
    metrics.sunk += results.filter((result) => result.kind === "SUNK").length;
    recordWeapon(metrics, decision.weapon, hits);
  }

  const wake = nextSubmarineWake(
    attackerBoard,
    wakes,
    rng,
    decision.actor,
  );
  if (wake) {
    wakes.push(wake);
    defenderAi.observeWake(wake);
  }
}

function enemyProfileFor(mode: GameMode, stageId: number): AIProfile {
  if (mode === "survival" && stageId === 5) return "silent";
  return mode === "casual" ? "casual" : "tactics";
}

function enemyHuntBreadthFor(mode: GameMode, stageId: number) {
  return mode === "survival" && stageId === 6 ? 3 : 1;
}

function simulateBattle(args: {
  mode: GameMode;
  stageIndex: number;
  seed: number;
  archetype: Archetype;
  playerFleetOverride?: ShipId[];
  enemySkillScale?: number;
}): BattleResult {
  const {
    mode,
    stageIndex,
    seed,
    archetype,
    playerFleetOverride,
    enemySkillScale = 1,
  } = args;
  const stage = STAGES[stageIndex];
  const playerFleet = playerFleetOverride
    ? [...playerFleetOverride]
    : mode === "survival"
      ? [...FULL_FLEET]
      : [...stage.fleet];
  const enemyFleet = enemyFleetFor(mode, stage);

  const placementRng = new SeededRandom(seed ^ 0x6d2b79f5);
  const playerBoard = new Board();
  const enemyBoard = new Board();
  playerBoard.randomize(placementRng, playerFleet);
  enemyBoard.randomize(placementRng, enemyFleet);

  const playerAi = new EnemyAI(
    new SeededRandom(seed ^ 0x243f6a88),
    enemyFleet,
    archetype.skill,
    archetype.profile,
    archetype.huntBreadth,
  );
  const enemyAi = new EnemyAI(
    new SeededRandom(seed ^ 0x51f15e),
    playerFleet,
    aiSkillFor(mode, stage.id, stage.aiSkill) * enemySkillScale,
    enemyProfileFor(mode, stage.id),
    enemyHuntBreadthFor(mode, stage.id),
  );

  const playerWakes: Coord[] = [];
  const enemyWakes: Coord[] = [];
  const playerMetrics = freshSideMetrics();
  const enemyMetrics = freshSideMetrics();
  const firstSide: "player" | "enemy" = mode === "casual" ? "player" : "enemy";

  let winner: Winner = "draw";
  let actionCount = 0;
  for (; actionCount < MAX_ACTIONS; actionCount += 1) {
    const side = actionCount % 2 === 0
      ? firstSide
      : firstSide === "player"
        ? "enemy"
        : "player";

    if (side === "player") {
      if (playerBoard.allSunk()) {
        winner = "enemy";
        break;
      }
      const decision = playerAi.decide(playerBoard);
      applyDecision({
        attackerAi: playerAi,
        defenderAi: enemyAi,
        attackerBoard: playerBoard,
        defenderBoard: enemyBoard,
        decision,
        wakes: playerWakes,
        rng: placementRng,
        metrics: playerMetrics,
      });
      if (enemyBoard.allSunk()) {
        winner = "player";
        actionCount += 1;
        break;
      }
    } else {
      if (enemyBoard.allSunk()) {
        winner = "player";
        break;
      }
      const decision = enemyAi.decide(enemyBoard);
      applyDecision({
        attackerAi: enemyAi,
        defenderAi: playerAi,
        attackerBoard: enemyBoard,
        defenderBoard: playerBoard,
        decision,
        wakes: enemyWakes,
        rng: placementRng,
        metrics: enemyMetrics,
      });
      if (playerBoard.allSunk()) {
        winner = "enemy";
        actionCount += 1;
        break;
      }
    }
  }

  return {
    winner,
    actions: actionCount,
    playerRemainingShips: countRemainingShips(playerBoard),
    playerRemainingCells: countRemainingCells(playerBoard),
    enemyRemainingShips: countRemainingShips(enemyBoard),
    enemyRemainingCells: countRemainingCells(enemyBoard),
    playerSunk: playerBoard.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
    enemySunk: enemyBoard.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
    player: playerMetrics,
    enemy: enemyMetrics,
  };
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function wilsonInterval(wins: number, trials: number, z = 1.96) {
  if (trials <= 0) return { low: 0, high: 0 };
  const p = wins / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) /
    denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function aggregateBattles(results: BattleResult[]) {
  const playerWins = results.filter((result) => result.winner === "player").length;
  const enemyWins = results.filter((result) => result.winner === "enemy").length;
  const draws = results.length - playerWins - enemyWins;
  const interval = wilsonInterval(playerWins, results.length);
  const playerShots = results.reduce((sum, result) => sum + result.player.targetedCells, 0);
  const playerHits = results.reduce((sum, result) => sum + result.player.hits, 0);
  const enemyShots = results.reduce((sum, result) => sum + result.enemy.targetedCells, 0);
  const enemyHits = results.reduce((sum, result) => sum + result.enemy.hits, 0);
  return {
    trials: results.length,
    playerWins,
    enemyWins,
    draws,
    winRate: playerWins / Math.max(1, results.length),
    confidence95: interval,
    averageActions: mean(results.map((result) => result.actions)),
    averagePlayerRemainingShips: mean(results.map((result) => result.playerRemainingShips)),
    averagePlayerRemainingCells: mean(results.map((result) => result.playerRemainingCells)),
    averageEnemyRemainingShips: mean(results.map((result) => result.enemyRemainingShips)),
    averageEnemyRemainingCells: mean(results.map((result) => result.enemyRemainingCells)),
    playerAccuracy: playerHits / Math.max(1, playerShots),
    enemyAccuracy: enemyHits / Math.max(1, enemyShots),
  };
}

function simulateMatrix() {
  const rows: Array<Record<string, unknown>> = [];
  for (const mode of MODES) {
    for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) {
      for (const archetype of ARCHETYPES) {
        const results: BattleResult[] = [];
        for (let seedIndex = 1; seedIndex <= AUDIT_SEEDS; seedIndex += 1) {
          const seed =
            seedIndex * 1_000_003 +
            stageIndex * 10_007 +
            MODES.indexOf(mode) * 100_003 +
            ARCHETYPES.indexOf(archetype) * 1_009;
          results.push(simulateBattle({ mode, stageIndex, seed, archetype }));
        }
        rows.push({
          mode,
          stage: STAGES[stageIndex].id,
          stageTitle: STAGES[stageIndex].title,
          archetype: archetype.id,
          archetypeLabel: archetype.label,
          enemySkill: aiSkillFor(mode, STAGES[stageIndex].id, STAGES[stageIndex].aiSkill),
          ...aggregateBattles(results),
        });
      }
    }
  }
  return rows;
}

function simulateEnemySensitivity() {
  const scales = [0.9, 0.95, 1, 1.05, 1.1];
  const standard = ARCHETYPES.find((item) => item.id === "standard")!;
  const rows: Array<Record<string, unknown>> = [];
  for (const mode of ["tactics", "survival"] as GameMode[]) {
    for (const stageIndex of [3, 4, 5]) {
      for (const scale of scales) {
        const results: BattleResult[] = [];
        for (let seedIndex = 1; seedIndex <= Math.max(80, Math.floor(AUDIT_SEEDS / 2)); seedIndex += 1) {
          results.push(
            simulateBattle({
              mode,
              stageIndex,
              seed: seedIndex * 65_537 + stageIndex * 4_099 + Math.round(scale * 1_000),
              archetype: standard,
              enemySkillScale: scale,
            }),
          );
        }
        rows.push({
          mode,
          stage: STAGES[stageIndex].id,
          scale,
          ...aggregateBattles(results),
        });
      }
    }
  }
  return rows;
}

function simulateSurvivalCampaigns() {
  const rows: Array<Record<string, unknown>> = [];
  for (const archetype of ARCHETYPES) {
    const reached = Array(STAGES.length).fill(0) as number[];
    const cleared = Array(STAGES.length).fill(0) as number[];
    const finishingFleetSizes: number[] = [];
    const lossFrequency: Record<string, number> = {};
    let campaignClears = 0;

    for (let campaign = 1; campaign <= SURVIVAL_SEEDS; campaign += 1) {
      let fleet: ShipId[] = [...FULL_FLEET];
      let completed = true;
      for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) {
        reached[stageIndex] += 1;
        const result = simulateBattle({
          mode: "survival",
          stageIndex,
          seed: campaign * 104_729 + stageIndex * 10_007 + ARCHETYPES.indexOf(archetype) * 1_009,
          archetype,
          playerFleetOverride: fleet,
        });
        for (const ship of result.playerSunk) {
          lossFrequency[ship] = (lossFrequency[ship] ?? 0) + 1;
        }
        if (result.winner !== "player") {
          completed = false;
          break;
        }
        cleared[stageIndex] += 1;
        fleet = survivingFleet(fleet, result.playerSunk);
        if (fleet.length === 0) {
          completed = false;
          break;
        }
      }
      if (completed) {
        campaignClears += 1;
        finishingFleetSizes.push(fleet.length);
      }
    }

    rows.push({
      archetype: archetype.id,
      archetypeLabel: archetype.label,
      trials: SURVIVAL_SEEDS,
      campaignClears,
      clearRate: campaignClears / SURVIVAL_SEEDS,
      reached,
      cleared,
      stageClearRates: cleared.map((value, index) => value / Math.max(1, reached[index])),
      averageFinishingFleetSize: mean(finishingFleetSizes),
      lossFrequency,
    });
  }
  return rows;
}

function deriveFindings(matrix: Array<Record<string, unknown>>, campaigns: Array<Record<string, unknown>>) {
  const findings: string[] = [];
  const standardRows = matrix.filter((row) => row.archetype === "standard");
  const casualFirst = standardRows.find((row) => row.mode === "casual" && row.stage === 1);
  const tacticsFourth = standardRows.find((row) => row.mode === "tactics" && row.stage === 4);
  const tacticsFifth = standardRows.find((row) => row.mode === "tactics" && row.stage === 5);
  const tacticsSixth = standardRows.find((row) => row.mode === "tactics" && row.stage === 6);
  const standardCampaign = campaigns.find((row) => row.archetype === "standard");

  if (casualFirst && Number(casualFirst.winRate) < 0.65) {
    findings.push("CASUAL第1海域の標準代理勝率が65%未満で、導入戦として厳しい可能性があります。");
  }
  if (tacticsFourth && tacticsFifth && Number(tacticsFifth.winRate) > Number(tacticsFourth.winRate) + 0.12) {
    findings.push("TACTICS第5海域の難度緩和が第4海域より12ポイント以上易しく、進行曲線に谷ができています。");
  }
  if (tacticsFifth && tacticsSixth && Number(tacticsSixth.winRate) < Number(tacticsFifth.winRate) - 0.25) {
    findings.push("TACTICS第5→第6海域で勝率が25ポイント以上落ち、最終面の壁が急です。");
  }
  if (standardCampaign && Number(standardCampaign.clearRate) < 0.03) {
    findings.push("標準代理のSURVIVAL通しクリア率が3%未満で、損耗持越し込みでは極端に厳しい可能性があります。");
  }
  if (standardCampaign && Number(standardCampaign.clearRate) > 0.35) {
    findings.push("標準代理のSURVIVAL通しクリア率が35%を超え、高難度モードとして易しい可能性があります。");
  }
  if (!findings.length) {
    findings.push("設定した警戒閾値を超える大きな難度断層は検出されませんでした。");
  }
  return findings;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function toMarkdown(report: {
  generatedAt: string;
  seedsPerCell: number;
  matrix: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
  sensitivity: Array<Record<string, unknown>>;
  findings: string[];
}) {
  const lines: string[] = [];
  lines.push("# Deep Blue Grid バランス監査", "");
  lines.push(`生成日時: ${report.generatedAt}`, "");
  lines.push(`通常マトリクスは各条件 ${report.seedsPerCell} シード。SURVIVAL通し試行も各代理 ${SURVIVAL_SEEDS} 回。`, "");
  lines.push("## 判定", "");
  for (const finding of report.findings) lines.push(`- ${finding}`);
  lines.push("", "## 標準代理のステージ別勝率", "");
  lines.push("| Mode | Stage | Enemy skill | Win rate | 95% CI | Avg actions | Own ships left | Accuracy |", "|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of report.matrix.filter((item) => item.archetype === "standard")) {
    const ci = row.confidence95 as { low: number; high: number };
    lines.push(`| ${row.mode} | ${row.stage} | ${Number(row.enemySkill).toFixed(3)} | ${pct(Number(row.winRate))} | ${pct(ci.low)}–${pct(ci.high)} | ${Number(row.averageActions).toFixed(1)} | ${Number(row.averagePlayerRemainingShips).toFixed(2)} | ${pct(Number(row.playerAccuracy))} |`);
  }
  lines.push("", "## SURVIVAL通し", "");
  lines.push("| Agent | Clear rate | Stage conditional clear rates (1→6) | Avg finishing fleet |", "|---|---:|---|---:|");
  for (const row of report.campaigns) {
    const stageRates = (row.stageClearRates as number[]).map(pct).join(" / ");
    lines.push(`| ${row.archetypeLabel} | ${pct(Number(row.clearRate))} | ${stageRates} | ${Number(row.averageFinishingFleetSize).toFixed(2)} |`);
  }
  lines.push("", "## 敵AI倍率感度（標準代理）", "");
  lines.push("| Mode | Stage | Enemy scale | Win rate | Avg actions |", "|---|---:|---:|---:|---:|");
  for (const row of report.sensitivity) {
    lines.push(`| ${row.mode} | ${row.stage} | ${Number(row.scale).toFixed(2)} | ${pct(Number(row.winRate))} | ${Number(row.averageActions).toFixed(1)} |`);
  }
  lines.push("", "## 注意", "");
  lines.push("この監査は同じゲームエンジンとEnemyAIを利用した自動代理戦です。人間の意図的なレーダー運用、兵装温存、配置読みを完全には再現しません。勝率の絶対値ではなく、ステージ間・モード間の相対的な段差を主に評価します。", "");
  return lines.join("\n");
}

async function main() {
  const matrix = simulateMatrix();
  const campaigns = simulateSurvivalCampaigns();
  const sensitivity = simulateEnemySensitivity();
  const findings = deriveFindings(matrix, campaigns);
  const report = {
    generatedAt: new Date().toISOString(),
    seedsPerCell: AUDIT_SEEDS,
    survivalCampaignSeeds: SURVIVAL_SEEDS,
    model: {
      archetypes: ARCHETYPES,
      modes: MODES,
      maxActions: MAX_ACTIONS,
      liveEnemyRules: {
        tacticsFirstStrike: true,
        stage5SurvivalSilentProfile: true,
        stage6SurvivalHuntBreadth: 3,
      },
    },
    shipSizes: Object.fromEntries(SHIPS.map((ship) => [ship.id, ship.size])),
    matrix,
    campaigns,
    sensitivity,
    findings,
  };

  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/deep-blue-grid-balance-audit.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile("artifacts/deep-blue-grid-balance-audit.md", toMarkdown(report), "utf8");

  console.log("=== DEEP BLUE GRID BALANCE AUDIT ===");
  console.log(toMarkdown(report));
  console.log("=== END DEEP BLUE GRID BALANCE AUDIT ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
