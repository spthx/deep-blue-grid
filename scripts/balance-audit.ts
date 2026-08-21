import { mkdir, writeFile } from "node:fs/promises";
import { SHIPS, STAGES, type Coord, type ShipId } from "../app/game/constants.ts";
import { Board, SeededRandom, type AttackResult } from "../app/game/engine.ts";
import { EnemyAI, type AIDecision, type AIProfile } from "../app/game/EnemyAI.ts";
import { FULL_FLEET, aiSkillFor, enemyFleetFor, survivingFleet, type GameMode } from "../app/game/Campaign.ts";
import { nextSubmarineWake } from "../app/game/SubmarineWake.ts";

type Agent = { id: "novice" | "standard" | "expert"; label: string; profile: AIProfile; skill: number; breadth: number };
type Result = { winner: "player" | "enemy" | "draw"; actions: number; ownShips: number; ownCells: number; enemyShips: number; enemyCells: number; ownSunk: ShipId[]; playerHits: number; playerShots: number; enemyHits: number; enemyShots: number };
type Summary = ReturnType<typeof summarize>;

const SEEDS = Math.max(40, Number(process.env.BALANCE_AUDIT_SEEDS ?? 240));
const CAMPAIGNS = Math.max(40, Number(process.env.BALANCE_AUDIT_SURVIVAL_SEEDS ?? 240));
const MAX_ACTIONS = 320;
const MODES: GameMode[] = ["casual", "tactics", "survival"];
const AGENTS: Agent[] = [
  { id: "novice", label: "初心者代理", profile: "casual", skill: 0.82, breadth: 7 },
  { id: "standard", label: "標準代理", profile: "tactics", skill: 1.08, breadth: 3 },
  { id: "expert", label: "熟練代理", profile: "tactics", skill: 1.38, breadth: 1 },
];

function aliveShips(board: Board) { return board.ships.filter((ship) => !ship.sunk).length; }
function aliveCells(board: Board) { return board.ships.reduce((n, ship) => n + Math.max(0, ship.size - ship.hits.size), 0); }
function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function enemyProfile(mode: GameMode, stage: number): AIProfile { return mode === "survival" && stage === 5 ? "silent" : mode === "casual" ? "casual" : "tactics"; }
function enemyBreadth(mode: GameMode, stage: number) { return mode === "survival" && stage === 6 ? 3 : 1; }

function act(args: { ai: EnemyAI; otherAi: EnemyAI; own: Board; target: Board; decision: AIDecision; wakes: Coord[]; rng: SeededRandom }) {
  const { ai, otherAi, own, target, decision, wakes, rng } = args;
  let shots = 0;
  let hits = 0;
  if (decision.weapon === "hold") return { shots, hits };
  if (decision.weapon === "radar") {
    const origin = decision.targets[0];
    ai.observeRadar(origin, target.radar(origin));
  } else {
    const results: AttackResult[] = [];
    for (const coord of decision.targets) {
      const result = target.attack(coord);
      if (result.kind === "ALREADY") continue;
      results.push(result);
      shots += 1;
      if (result.kind === "HIT" || result.kind === "SUNK") hits += 1;
      if (result.kind === "HIT" && result.shipId === "silentSubmarine") target.relocateShip("silentSubmarine", rng);
    }
    ai.observe(results);
  }
  const wake = nextSubmarineWake(own, wakes, rng, decision.actor);
  if (wake) { wakes.push(wake); otherAi.observeWake(wake); }
  return { shots, hits };
}

function battle(args: { mode: GameMode; stageIndex: number; seed: number; agent: Agent; fleet?: ShipId[]; enemyScale?: number }): Result {
  const { mode, stageIndex, seed, agent, fleet, enemyScale = 1 } = args;
  const stage = STAGES[stageIndex];
  const ownFleet = fleet ? [...fleet] : mode === "survival" ? [...FULL_FLEET] : [...stage.fleet];
  const rivalFleet = enemyFleetFor(mode, stage);
  const rng = new SeededRandom(seed ^ 0x6d2b79f5);
  const own = new Board(); const rival = new Board();
  own.randomize(rng, ownFleet); rival.randomize(rng, rivalFleet);
  const playerAi = new EnemyAI(new SeededRandom(seed ^ 0x243f6a88), rivalFleet, agent.skill, agent.profile, agent.breadth);
  const rivalAi = new EnemyAI(new SeededRandom(seed ^ 0x51f15e), ownFleet, aiSkillFor(mode, stage.id, stage.aiSkill) * enemyScale, enemyProfile(mode, stage.id), enemyBreadth(mode, stage.id));
  const playerWakes: Coord[] = []; const rivalWakes: Coord[] = [];
  let playerShots = 0; let playerHits = 0; let enemyShots = 0; let enemyHits = 0;
  const first: "player" | "enemy" = mode === "casual" ? "player" : "enemy";
  let winner: Result["winner"] = "draw";
  let actions = 0;
  for (; actions < MAX_ACTIONS; actions += 1) {
    const side = actions % 2 === 0 ? first : first === "player" ? "enemy" : "player";
    if (side === "player") {
      const shot = act({ ai: playerAi, otherAi: rivalAi, own, target: rival, decision: playerAi.decide(own), wakes: playerWakes, rng });
      playerShots += shot.shots; playerHits += shot.hits;
      if (rival.allSunk()) { winner = "player"; actions += 1; break; }
    } else {
      const shot = act({ ai: rivalAi, otherAi: playerAi, own: rival, target: own, decision: rivalAi.decide(rival), wakes: rivalWakes, rng });
      enemyShots += shot.shots; enemyHits += shot.hits;
      if (own.allSunk()) { winner = "enemy"; actions += 1; break; }
    }
  }
  return { winner, actions, ownShips: aliveShips(own), ownCells: aliveCells(own), enemyShips: aliveShips(rival), enemyCells: aliveCells(rival), ownSunk: own.ships.filter((ship) => ship.sunk).map((ship) => ship.id), playerHits, playerShots, enemyHits, enemyShots };
}

function wilson(wins: number, trials: number) {
  const z = 1.96; const p = wins / Math.max(1, trials); const d = 1 + z * z / trials;
  const c = (p + z * z / (2 * trials)) / d;
  const m = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / d;
  return { low: Math.max(0, c - m), high: Math.min(1, c + m) };
}

function summarize(results: Result[]) {
  const wins = results.filter((r) => r.winner === "player").length;
  const playerShots = results.reduce((n, r) => n + r.playerShots, 0); const enemyShots = results.reduce((n, r) => n + r.enemyShots, 0);
  return { trials: results.length, wins, losses: results.filter((r) => r.winner === "enemy").length, draws: results.filter((r) => r.winner === "draw").length, winRate: wins / results.length, confidence95: wilson(wins, results.length), averageActions: mean(results.map((r) => r.actions)), averageOwnShips: mean(results.map((r) => r.ownShips)), averageOwnCells: mean(results.map((r) => r.ownCells)), averageEnemyShips: mean(results.map((r) => r.enemyShips)), playerAccuracy: results.reduce((n, r) => n + r.playerHits, 0) / Math.max(1, playerShots), enemyAccuracy: results.reduce((n, r) => n + r.enemyHits, 0) / Math.max(1, enemyShots) };
}

function matrix() {
  const rows: Array<{ mode: GameMode; stage: number; title: string; agent: Agent["id"]; agentLabel: string; enemySkill: number; summary: Summary }> = [];
  for (const mode of MODES) for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) for (const agent of AGENTS) {
    const results: Result[] = [];
    for (let i = 1; i <= SEEDS; i += 1) results.push(battle({ mode, stageIndex, seed: i * 1_000_003 + stageIndex * 10_007 + MODES.indexOf(mode) * 100_003 + AGENTS.indexOf(agent) * 1_009, agent }));
    rows.push({ mode, stage: STAGES[stageIndex].id, title: STAGES[stageIndex].title, agent: agent.id, agentLabel: agent.label, enemySkill: aiSkillFor(mode, STAGES[stageIndex].id, STAGES[stageIndex].aiSkill), summary: summarize(results) });
  }
  return rows;
}

function sensitivity() {
  const agent = AGENTS[1]; const rows: Array<{ mode: GameMode; stage: number; scale: number; summary: Summary }> = [];
  for (const mode of ["tactics", "survival"] as GameMode[]) for (const stageIndex of [3, 4, 5]) for (const scale of [0.9, 0.95, 1, 1.05, 1.1]) {
    const results: Result[] = [];
    for (let i = 1; i <= Math.max(80, Math.floor(SEEDS / 2)); i += 1) results.push(battle({ mode, stageIndex, seed: i * 65_537 + stageIndex * 4_099 + Math.round(scale * 1_000), agent, enemyScale: scale }));
    rows.push({ mode, stage: STAGES[stageIndex].id, scale, summary: summarize(results) });
  }
  return rows;
}

function survivalCampaigns() {
  return AGENTS.map((agent) => {
    const reached = Array(STAGES.length).fill(0) as number[]; const cleared = Array(STAGES.length).fill(0) as number[]; const finishSizes: number[] = []; const losses: Record<string, number> = {}; let fullClears = 0;
    for (let c = 1; c <= CAMPAIGNS; c += 1) {
      let fleet: ShipId[] = [...FULL_FLEET]; let complete = true;
      for (let stageIndex = 0; stageIndex < STAGES.length; stageIndex += 1) {
        reached[stageIndex] += 1;
        const result = battle({ mode: "survival", stageIndex, seed: c * 104_729 + stageIndex * 10_007 + AGENTS.indexOf(agent) * 1_009, agent, fleet });
        for (const ship of result.ownSunk) losses[ship] = (losses[ship] ?? 0) + 1;
        if (result.winner !== "player") { complete = false; break; }
        cleared[stageIndex] += 1; fleet = survivingFleet(fleet, result.ownSunk);
        if (!fleet.length) { complete = false; break; }
      }
      if (complete) { fullClears += 1; finishSizes.push(fleet.length); }
    }
    return { agent: agent.id, agentLabel: agent.label, trials: CAMPAIGNS, fullClears, clearRate: fullClears / CAMPAIGNS, reached, cleared, conditionalStageClearRates: cleared.map((n, i) => n / Math.max(1, reached[i])), averageFinishingFleet: mean(finishSizes), losses };
  });
}

function findings(rows: ReturnType<typeof matrix>, campaigns: ReturnType<typeof survivalCampaigns>) {
  const notes: string[] = []; const standard = rows.filter((r) => r.agent === "standard");
  const get = (mode: GameMode, stage: number) => standard.find((r) => r.mode === mode && r.stage === stage)?.summary.winRate ?? 0;
  if (get("casual", 1) < 0.65) notes.push("CASUAL第1海域の標準代理勝率が65%未満です。");
  if (get("tactics", 5) > get("tactics", 4) + 0.12) notes.push("TACTICS第5海域が第4海域より12ポイント以上易しく、難度曲線に谷があります。");
  if (get("tactics", 6) < get("tactics", 5) - 0.25) notes.push("TACTICS第5→第6海域で25ポイント以上勝率が落ちています。");
  const campaign = campaigns.find((r) => r.agent === "standard")!;
  if (campaign.clearRate < 0.03) notes.push("標準代理のSURVIVAL通しクリア率が3%未満です。");
  if (campaign.clearRate > 0.35) notes.push("標準代理のSURVIVAL通しクリア率が35%超です。");
  return notes.length ? notes : ["設定した警戒閾値を超える大きな難度断層は検出されませんでした。"]; 
}

function markdown(report: { generatedAt: string; rows: ReturnType<typeof matrix>; campaigns: ReturnType<typeof survivalCampaigns>; sensitivity: ReturnType<typeof sensitivity>; findings: string[] }) {
  const out = ["# Deep Blue Grid バランス監査", "", `生成日時: ${report.generatedAt}`, `各通常条件 ${SEEDS} シード、SURVIVAL通し各 ${CAMPAIGNS} 回。`, "", "## 判定", ...report.findings.map((x) => `- ${x}`), "", "## 標準代理", "", "|Mode|Stage|Enemy skill|Win rate|95% CI|Avg actions|Own ships|Accuracy|", "|---|---:|---:|---:|---:|---:|---:|---:|"];
  for (const row of report.rows.filter((r) => r.agent === "standard")) { const s = row.summary; out.push(`|${row.mode}|${row.stage}|${row.enemySkill.toFixed(3)}|${percent(s.winRate)}|${percent(s.confidence95.low)}–${percent(s.confidence95.high)}|${s.averageActions.toFixed(1)}|${s.averageOwnShips.toFixed(2)}|${percent(s.playerAccuracy)}|`); }
  out.push("", "## SURVIVAL通し", "", "|Agent|Clear rate|Conditional stage clear 1→6|Avg finishing fleet|", "|---|---:|---|---:|");
  for (const row of report.campaigns) out.push(`|${row.agentLabel}|${percent(row.clearRate)}|${row.conditionalStageClearRates.map(percent).join(" / ")}|${row.averageFinishingFleet.toFixed(2)}|`);
  out.push("", "## 敵AI倍率感度（標準代理）", "", "|Mode|Stage|Scale|Win rate|Avg actions|", "|---|---:|---:|---:|---:|");
  for (const row of report.sensitivity) out.push(`|${row.mode}|${row.stage}|${row.scale.toFixed(2)}|${percent(row.summary.winRate)}|${row.summary.averageActions.toFixed(1)}|`);
  out.push("", "自動代理戦なので、人間の意図的な配置・兵装温存は完全再現しません。絶対勝率よりステージ間の段差を重視します。", ""); return out.join("\n");
}

async function main() {
  const rows = matrix(); const campaigns = survivalCampaigns(); const sensitivityRows = sensitivity(); const report = { generatedAt: new Date().toISOString(), seedsPerCell: SEEDS, campaignSeeds: CAMPAIGNS, model: { agents: AGENTS, maxActions: MAX_ACTIONS, tacticsFirstStrike: true, stage5Silent: true, stage6SurvivalBreadth: 3 }, shipSizes: Object.fromEntries(SHIPS.map((s) => [s.id, s.size])), rows, campaigns, sensitivity: sensitivityRows, findings: findings(rows, campaigns) };
  const md = markdown(report); await mkdir("artifacts", { recursive: true }); await writeFile("artifacts/deep-blue-grid-balance-audit.json", `${JSON.stringify(report, null, 2)}\n`); await writeFile("artifacts/deep-blue-grid-balance-audit.md", md); console.log("=== DEEP BLUE GRID BALANCE AUDIT ===\n" + md + "\n=== END DEEP BLUE GRID BALANCE AUDIT ===");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
