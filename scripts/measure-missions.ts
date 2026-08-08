import { pathToFileURL } from "node:url";
import {
  MISSION_LIBRARY,
  aiSkillFor,
  huntBreadthFor,
  type MissionStageDefinition,
} from "../app/game/Campaign.ts";
import { EnemyAI, type AIDecision } from "../app/game/EnemyAI.ts";
import {
  applyScenarioArsenal,
  applyScenarioHits,
  deployScenarioFleet,
  evaluateMission,
  type MissionOutcome,
} from "../app/game/MissionRules.ts";
import { nextSubmarineWake } from "../app/game/SubmarineWake.ts";
import {
  Arsenal,
  Board,
  SeededRandom,
  harpoonCells,
  inBounds,
  radarCells,
  sameCoord,
  straddleCells,
  type AttackResult,
  type ShotMark,
} from "../app/game/engine.ts";
import {
  GRID_SIZE,
  ORIENTATIONS,
  type Coord,
  type Orientation,
  type ShipId,
  type WeaponId,
} from "../app/game/constants.ts";

export type MissionAction =
  | Readonly<{ weapon: "fire"; target: Coord }>
  | Readonly<{ weapon: "phantom" | "mk45"; targets: readonly Coord[] }>
  | Readonly<{ weapon: "harpoon"; center: Coord }>
  | Readonly<{ weapon: "sparrow"; anchor: Coord; orientation: Orientation }>
  | Readonly<{ weapon: "radar"; origin: Coord }>;

/**
 * The policy receives only information that is visible in the actual mission UI.
 * In particular, it never receives Board.ships, enemy placements, or shipAt().
 */
export type PublicMissionView = Readonly<{
  missionId: number;
  actionIndex: number;
  allowedWeapons: readonly WeaponId[];
  shots: readonly (readonly ShotMark[])[];
  identified: ReadonlyMap<ShipId, Coord>;
  sonarReports: readonly Readonly<{ origin: Coord; contact: boolean }>[];
  enemyWakes: readonly Coord[];
  availableUses: Readonly<Partial<Record<Exclude<WeaponId, "fire">, number>>>;
}>;

export type MissionPolicy = (view: PublicMissionView) => MissionAction | null;

export type MissionSimulation = Readonly<{
  missionId: number;
  title: string;
  outcome: MissionOutcome;
  actions: number;
  enemyActions: number;
  friendlyAlive: readonly ShipId[];
  enemySunk: readonly ShipId[];
  enemySunkOrder: readonly ShipId[];
  enemyIdentified: readonly ShipId[];
  sonarReports: readonly Readonly<{ origin: Coord; contact: boolean }>[];
  illegalAction?: string;
}>;

type Route = Readonly<{
  rationale: string;
  evidence: readonly string[];
  actions: readonly MissionAction[];
}>;

const c = (x: number, y: number): Coord => ({ x, y });

/**
 * Exact solution paths used only to prove that every authored situation is winnable.
 * They are intentionally kept out of the production mission definitions and UI.
 */
export const CANONICAL_MISSION_ROUTES: Readonly<Record<number, Route>> = {
  1: {
    rationale: "The DD's two surviving sections are resolved together; the intersecting wakes then fix the SS cell.",
    evidence: ["TACTICAL MAP", "OBJECTIVE"],
    actions: [
      { weapon: "mk45", targets: [c(2, 2), c(4, 2)] },
      { weapon: "fire", target: c(5, 5) },
    ],
  },
  2: {
    rationale: "File the two explicitly ordered listening reports without firing.",
    evidence: ["ALPHA / C-3", "BRAVO / F-1"],
    actions: [
      { weapon: "radar", origin: c(2, 2) },
      { weapon: "radar", origin: c(0, 5) },
    ],
  },
  3: {
    rationale: "Test the vertical BB hypothesis, then expend the second sortie on the horizontal hypothesis.",
    evidence: ["IMPORTANT SECTION", "TACTICAL MAP"],
    actions: [
      { weapon: "phantom", targets: [c(3, 1), c(3, 2), c(3, 4), c(3, 5)] },
      { weapon: "phantom", targets: [c(1, 3), c(2, 3), c(4, 3), c(5, 3)] },
    ],
  },
  4: {
    rationale: "Three X-pattern salvos cover all six unbroken CV sections while preserving the assigned link.",
    evidence: ["IMPORTANT SECTION", "TACTICAL MAP", "FIRE CONTROL LINK"],
    actions: [
      { weapon: "harpoon", center: c(4, 3) },
      { weapon: "harpoon", center: c(2, 3) },
      { weapon: "harpoon", center: c(4, 2) },
    ],
  },
  5: {
    rationale: "The only cell orthogonally adjacent to all three ECHO marks is the contact cell.",
    evidence: ["TACTICAL MAP", "4-DIRECTION ECHO"],
    actions: [{ weapon: "fire", target: c(3, 4) }],
  },
  6: {
    rationale: "A north-facing ranging fan covers all unbroken horizontal CA sections.",
    evidence: ["IMPORTANT SECTION", "ECHO", "TACTICAL MAP"],
    actions: [{ weapon: "sparrow", anchor: c(2, 5), orientation: "north" }],
  },
  7: {
    rationale: "The X-pattern center lies midway between the two disclosed surviving sections.",
    evidence: ["TACTICAL MAP", "OBJECTIVE"],
    actions: [{ weapon: "harpoon", center: c(3, 3) }],
  },
  8: {
    rationale: "Allocate the fan to the three-section CA remainder and the paired shot to the two DD sections.",
    evidence: ["IMPORTANT SECTIONS", "TACTICAL MAP", "WEAPON PATTERNS"],
    actions: [
      { weapon: "sparrow", anchor: c(2, 2), orientation: "north" },
      { weapon: "mk45", targets: [c(4, 6), c(6, 6)] },
    ],
  },
  9: {
    rationale: "Strike the sole CIC estimate published in the mission brief.",
    evidence: ["ESTIMATED CIC / D-4"],
    actions: [{ weapon: "fire", target: c(3, 3) }],
  },
  10: {
    rationale: "Clear ALPHA by sonar, leaving BRAVO as the only valid submarine contact.",
    evidence: ["ALPHA / B-2", "BRAVO / F-6"],
    actions: [
      { weapon: "radar", origin: c(1, 1) },
      { weapon: "fire", target: c(5, 5) },
    ],
  },
  11: {
    rationale: "Break the two-section escort first, then cover the four surviving carrier sections in two X salvos.",
    evidence: ["TACTICAL MAP", "ESCORT LINK", "OBJECTIVE"],
    actions: [
      { weapon: "fire", target: c(4, 2) },
      { weapon: "harpoon", center: c(3, 4) },
      { weapon: "harpoon", center: c(4, 3) },
    ],
  },
  12: {
    rationale: "Use the two arbitrary strikes on CA and DD/DE, reserving three crossing salvos for the five-section BB.",
    evidence: ["FULL FIRE SOLUTION", "DUAL SUPPORT LINK", "WEAPON PATTERNS"],
    actions: [
      { weapon: "phantom", targets: [c(0, 3), c(1, 3), c(2, 3), c(3, 3)] },
      { weapon: "phantom", targets: [c(5, 7), c(6, 7), c(7, 7), c(6, 5)] },
      { weapon: "harpoon", center: c(1, 1) },
      { weapon: "harpoon", center: c(2, 1) },
      { weapon: "harpoon", center: c(3, 1) },
    ],
  },
  13: {
    rationale: "The diary fixes ORPHEUS east-west and leaves D-2/D-3 as the only unbroken sections.",
    evidence: ["1840Z", "1841Z", "1842Z", "1844Z"],
    actions: [{ weapon: "mk45", targets: [c(1, 3), c(2, 3)] }],
  },
  14: {
    rationale: "The magazine log leaves one usable salvo; its upper diagonals cover ARGUS C-4/C-6 together.",
    evidence: ["2011Z", "2013Z", "2015Z", "2016Z", "2018Z"],
    actions: [{ weapon: "harpoon", center: c(4, 3) }],
  },
  15: {
    rationale: "The relief log states that Blue owns the next order and that G-8 is DD-03's sole unbroken section.",
    evidence: ["0310Z", "0311Z", "0312Z", "0313Z", "0314Z"],
    actions: [{ weapon: "fire", target: c(7, 6) }],
  },
  16: {
    rationale: "VIGILANT's named five-section southbound hull leaves C-6/D-6/E-6 for one east-facing fan.",
    evidence: ["2210Z", "2212Z", "2213Z", "2215Z", "2216Z"],
    actions: [{ weapon: "sparrow", anchor: c(4, 3), orientation: "east" }],
  },
  17: {
    rationale: "Two prescribed sonar reports separate the damaged destroyer section from the false wake; MK-45 closes both contacts together.",
    evidence: ["ALPHA / C-3:D-4", "BRAVO / E-5:F-6", "LAST DD SECTION", "WAKE TERMINUS"],
    actions: [
      { weapon: "radar", origin: c(2, 2) },
      { weapon: "radar", origin: c(4, 4) },
      { weapon: "mk45", targets: [c(3, 3), c(6, 6)] },
    ],
  },
  18: {
    rationale: "The dual escort link authorizes the second air strike and third missile; fire is distributed in the mandated DE-CV-BB order.",
    evidence: ["DUAL SUPPORT LINK", "GATE", "CITADEL", "IRONCLAD"],
    actions: [
      { weapon: "phantom", targets: [c(1, 0), c(2, 3), c(3, 3), c(4, 3)] },
      { weapon: "phantom", targets: [c(5, 3), c(7, 0), c(7, 2), c(7, 4)] },
      { weapon: "harpoon", center: c(1, 6) },
      { weapon: "harpoon", center: c(3, 6) },
      { weapon: "harpoon", center: c(5, 6) },
    ],
  },
  19: {
    rationale: "The north-facing fan covers the cruiser's adjacent vertical remainder; the X-pattern diagonals close both destroyer ends.",
    evidence: ["MERIDIAN", "TRANSIT", "HULL COURSE"],
    actions: [
      { weapon: "sparrow", anchor: c(1, 3), orientation: "north" },
      { weapon: "harpoon", center: c(5, 5) },
    ],
  },
  20: {
    rationale: "The only unbroken control sections in the two disclosed hulls and the isolated conning tower are the three critical cells.",
    evidence: ["AIR CONTROL", "MAIN DIRECTOR", "CONNING TOWER"],
    actions: [
      { weapon: "fire", target: c(2, 0) },
      { weapon: "fire", target: c(2, 3) },
      { weapon: "fire", target: c(7, 7) },
    ],
  },
  21: {
    rationale: "Four-direction echoes fix the first contact at D-4; one carrier sweep covers every publicly named silent egress box.",
    evidence: ["D-4 ECHO FIX", "EGRESS ALPHA", "EGRESS BRAVO", "EGRESS CHARLIE", "EGRESS DELTA"],
    actions: [
      { weapon: "fire", target: c(3, 3) },
      { weapon: "phantom", targets: leviathanEgressForSimulation() },
    ],
  },
  22: {
    rationale: "Each surviving section is allocated to the only four available weapon systems; the air strike closes two separated hulls.",
    evidence: ["ALL CONTACTS IDENTIFIED", "ONE AUTHORIZATION EACH", "FIRE DISTRIBUTION"],
    actions: [
      { weapon: "phantom", targets: [c(0, 0), c(6, 1), c(7, 0), c(7, 2)] },
      { weapon: "harpoon", center: c(4, 3) },
      { weapon: "sparrow", anchor: c(4, 5), orientation: "north" },
      { weapon: "mk45", targets: [c(7, 7), c(7, 6)] },
    ],
  },
};

function leviathanEgressForSimulation(): Coord[] {
  return [c(1, 1), c(6, 1), c(1, 6), c(6, 6)];
}

function copyCoord(coord: Coord) {
  return { x: coord.x, y: coord.y };
}

function actionTargets(action: MissionAction) {
  switch (action.weapon) {
    case "fire": return [action.target];
    case "phantom":
    case "mk45": return action.targets.map(copyCoord);
    case "harpoon": return harpoonCells(action.center);
    case "sparrow": return straddleCells(action.anchor, action.orientation);
    case "radar": return radarCells(action.origin);
  }
}

function outcomeState(
  rule: MissionStageDefinition,
  player: Board,
  enemy: Board,
  actions: number,
  identified: ReadonlySet<ShipId>,
  sonarReports: Array<{ origin: Coord; contact: boolean }>,
  enemySunkOrder: readonly ShipId[],
  usedWeapons: readonly WeaponId[],
) {
  return evaluateMission(rule, {
    friendlyActions: actions,
    usedWeapons: [...usedWeapons],
    enemySunk: enemy.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
    enemySunkOrder: [...enemySunkOrder],
    enemyIdentified: [...identified],
    friendlyAlive: player.ships.filter((ship) => !ship.sunk).map((ship) => ship.id),
    sonarReports,
  });
}

function publicView(
  rule: MissionStageDefinition,
  player: Board,
  enemy: Board,
  arsenal: Arsenal,
  actionIndex: number,
  identified: ReadonlyMap<ShipId, Coord>,
  sonarReports: Array<{ origin: Coord; contact: boolean }>,
  enemyWakes: Coord[],
): PublicMissionView {
  const availableUses: Partial<Record<Exclude<WeaponId, "fire">, number>> = {};
  for (const weapon of ["phantom", "harpoon", "sparrow", "mk45", "radar"] as const) {
    availableUses[weapon] = arsenal.availableUses(weapon, player);
  }
  return Object.freeze({
    missionId: rule.id,
    actionIndex,
    allowedWeapons: Object.freeze([...rule.allowedWeapons]),
    shots: Object.freeze(enemy.shots.map((row) => Object.freeze([...row]))),
    identified: new Map([...identified].map(([id, coord]) => [id, copyCoord(coord)])),
    sonarReports: Object.freeze(sonarReports.map((report) => Object.freeze({ origin: copyCoord(report.origin), contact: report.contact }))),
    enemyWakes: Object.freeze(enemyWakes.map(copyCoord)),
    availableUses: Object.freeze(availableUses),
  });
}

function executeEnemyDecision(
  decision: AIDecision,
  commander: EnemyAI,
  player: Board,
  scenarioRng: SeededRandom,
  enemy: Board,
  enemyWakes: Coord[],
) {
  if (decision.weapon === "silentMove") {
    enemy.relocateShip(decision.actor ?? "silentSubmarine", scenarioRng, {
      blocked: enemyWakes,
      leaveLastKnown: true,
      relaxSignalBlocksWhenTrapped: true,
      resolveContainmentWhenTrapped: true,
    });
    return;
  }
  if (decision.weapon === "radar") {
    const origin = decision.targets[0];
    commander.observeRadar(origin, player.radar(origin));
  } else {
    commander.observe(decision.targets.map((target) => player.attack(target)));
  }
  const wake = nextSubmarineWake(enemy, enemyWakes, scenarioRng, decision.actor);
  if (wake && !enemyWakes.some((seen) => sameCoord(seen, wake))) enemyWakes.push(wake);
}

function actionLegality(
  rule: MissionStageDefinition,
  action: MissionAction,
  player: Board,
  enemy: Board,
  arsenal: Arsenal,
) {
  if (!rule.allowedWeapons.includes(action.weapon)) return `${action.weapon} is not permitted`;
  const targets = actionTargets(action);
  if (!targets.length || targets.some((coord) => !inBounds(coord))) return `${action.weapon} has an incomplete/out-of-bounds pattern`;
  if (action.weapon === "phantom" && action.targets.length !== 4) return "phantom requires four targets";
  if (action.weapon === "mk45" && action.targets.length !== 2) return "mk45 requires two targets";
  if (action.weapon === "sparrow" && targets.length !== 4) return "sparrow requires a complete four-cell fan";
  if ((action.weapon === "phantom" || action.weapon === "mk45")
    && new Set(action.targets.map((coord) => `${coord.x},${coord.y}`)).size !== action.targets.length) {
    return `${action.weapon} requires distinct targets`;
  }
  if (action.weapon === "radar") {
    if (action.origin.x >= GRID_SIZE - 1 || action.origin.y >= GRID_SIZE - 1) return "radar origin must define a 2x2 sector";
    return arsenal.canUse("radar", player) ? null : "radar is unavailable";
  }
  const unknown = targets.filter((coord) => enemy.shots[coord.y][coord.x] === "unknown");
  if (!unknown.length) return `${action.weapon} has no unengaged target cell`;
  if (action.weapon === "fire") return enemy.shots[action.target.y][action.target.x] === "unknown" ? null : "fire target is already resolved";
  return arsenal.canUse(action.weapon, player) ? null : `${action.weapon} is unavailable`;
}

export function simulateMission(rule: MissionStageDefinition, policy: MissionPolicy): MissionSimulation {
  const player = new Board();
  const enemy = new Board();
  deployScenarioFleet(player, rule.playerPlacements);
  deployScenarioFleet(enemy, rule.enemyPlacements);
  applyScenarioHits(player, rule.playerInitialHits);
  applyScenarioHits(enemy, rule.enemyInitialHits);
  for (const intel of rule.initialIntel ?? []) enemy.shots[intel.coord.y][intel.coord.x] = intel.mark;

  const arsenal = applyScenarioArsenal(new Arsenal(), rule.initialArsenal);
  const scenarioRng = new SeededRandom(rule.fixedSeed);
  const enemyCommander = new EnemyAI(
    new SeededRandom(rule.fixedSeed ^ 0x51f15e),
    rule.playerFleet,
    aiSkillFor("mission", rule.id, rule.aiSkill),
    rule.enemyFleet.some((id) => id === "silentSubmarine" || id === "leviathan") ? "silent" : "tactics",
    rule.huntBreadth ?? huntBreadthFor("mission", MISSION_LIBRARY.indexOf(rule)),
  );
  const identified = new Map<ShipId, Coord>();
  for (const id of rule.initiallyIdentified ?? []) {
    const ship = enemy.ships.find((candidate) => candidate.id === id);
    if (ship) identified.set(id, copyCoord(ship.critical));
  }
  const sonarReports: Array<{ origin: Coord; contact: boolean }> = [];
  const playerWakes: Coord[] = [];
  const enemyWakes = (rule.initialEnemyWakes ?? []).map(copyCoord);
  const enemySunkOrder: ShipId[] = [];
  const usedWeapons: WeaponId[] = [];
  let actions = 0;
  let enemyActions = 0;
  let illegalAction: string | undefined;
  let outcome: MissionOutcome = null;

  const enemyTurn = () => {
    const decision = enemyCommander.decide(enemy);
    executeEnemyDecision(decision, enemyCommander, player, scenarioRng, enemy, enemyWakes);
    enemyActions += 1;
    outcome = outcomeState(rule, player, enemy, actions, new Set(identified.keys()), sonarReports, enemySunkOrder, usedWeapons);
    if (!outcome && player.allSunk()) {
      outcome = { result: "defeat", report: "FRIENDLY FORCE LOST" };
    }
  };

  if (rule.enemyFirst) enemyTurn();

  while (!outcome && actions < rule.objective.maxFriendlyActions) {
    const action = policy(publicView(rule, player, enemy, arsenal, actions, identified, sonarReports, enemyWakes));
    if (!action) break;
    const problem = actionLegality(rule, action, player, enemy, arsenal);
    if (problem) {
      illegalAction = `order ${actions + 1}: ${problem}`;
      break;
    }

    if (action.weapon === "radar") {
      arsenal.spend("radar", player);
      const contact = enemy.radar(action.origin);
      sonarReports.push({ origin: copyCoord(action.origin), contact });
    } else {
      if (action.weapon !== "fire") arsenal.spend(action.weapon, player);
      const results: AttackResult[] = actionTargets(action)
        .filter((target) => enemy.shots[target.y][target.x] === "unknown")
        .map((target) => enemy.attack(target));
      for (const result of results) {
        if (result.criticalHit && result.shipId) identified.set(result.shipId, copyCoord(result.coord));
        if (result.kind === "SUNK" && result.shipId && !enemySunkOrder.includes(result.shipId)) {
          enemySunkOrder.push(result.shipId);
        }
      }
    }
    usedWeapons.push(action.weapon);
    actions += 1;

    const playerWake = nextSubmarineWake(player, playerWakes, scenarioRng);
    if (playerWake && !playerWakes.some((seen) => sameCoord(seen, playerWake))) {
      playerWakes.push(playerWake);
      enemyCommander.observeWake(playerWake);
    }

    outcome = outcomeState(rule, player, enemy, actions, new Set(identified.keys()), sonarReports, enemySunkOrder, usedWeapons);
    if (!outcome) enemyTurn();
  }

  if (!outcome && actions >= rule.objective.maxFriendlyActions) {
    outcome = outcomeState(rule, player, enemy, actions, new Set(identified.keys()), sonarReports, enemySunkOrder, usedWeapons);
  }

  return {
    missionId: rule.id,
    title: rule.title,
    outcome,
    actions,
    enemyActions,
    friendlyAlive: player.ships.filter((ship) => !ship.sunk).map((ship) => ship.id),
    enemySunk: enemy.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
    enemySunkOrder,
    enemyIdentified: [...identified.keys()],
    sonarReports,
    illegalAction,
  };
}

export function planPolicy(actions: readonly MissionAction[]): MissionPolicy {
  return (view) => actions[view.actionIndex] ?? null;
}

export function verifyCanonicalMissions() {
  return MISSION_LIBRARY.map((mission) => {
    const route = CANONICAL_MISSION_ROUTES[mission.id];
    if (!route) throw new Error(`Missing canonical route for mission ${mission.id} ${mission.title}`);
    return { mission, route, simulation: simulateMission(mission, planPolicy(route.actions)) };
  });
}

function shuffledUnknown(view: PublicMissionView, rng: SeededRandom) {
  const cells: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    if (view.shots[y][x] === "unknown") cells.push({ x, y });
  }
  return rng.shuffle(cells);
}

/** Uniform legal-action baseline. It reacts only to the public shot grid and magazine counters. */
export function blindPolicy(rng: SeededRandom): MissionPolicy {
  return (view) => {
    const unknown = shuffledUnknown(view, rng);
    const usable = view.allowedWeapons.filter((weapon) => weapon === "fire" || (view.availableUses[weapon] ?? 0) > 0);
    if (!unknown.length || !usable.length) return null;
    const weapon = rng.pick([...usable]);
    if (weapon === "fire") return { weapon, target: unknown[0] };
    if (weapon === "phantom") return unknown.length >= 4 ? { weapon, targets: unknown.slice(0, 4) } : null;
    if (weapon === "mk45") return unknown.length >= 2 ? { weapon, targets: unknown.slice(0, 2) } : null;
    if (weapon === "radar") return { weapon, origin: { x: rng.int(GRID_SIZE - 1), y: rng.int(GRID_SIZE - 1) } };
    if (weapon === "harpoon") {
      const centers = rng.shuffle(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({ x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) })));
      const center = centers.find((candidate) => harpoonCells(candidate).some((cell) => view.shots[cell.y][cell.x] === "unknown"));
      return center ? { weapon, center } : null;
    }
    const fans = rng.shuffle(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({ x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) }))
      .flatMap((anchor) => ORIENTATIONS.map((orientation) => ({ anchor, orientation })))
      .filter(({ anchor, orientation }) => straddleCells(anchor, orientation).length === 4));
    const fan = fans.find(({ anchor, orientation }) => straddleCells(anchor, orientation).some((cell) => view.shots[cell.y][cell.x] === "unknown"));
    return fan ? { weapon: "sparrow", ...fan } : null;
  };
}

/**
 * A transparent, non-telemetry player model.  Its intended orders are the
 * canonical deductions from information exposed by the mission brief/map/log;
 * it occasionally substitutes a uniformly legal public-information order.
 * The per-order fidelity is chosen so that an error-free route has the stated
 * whole-mission comprehension probability for that difficulty.
 */
export const INFORMED_COMPREHENSION_BY_DIFFICULTY = {
  1: 0.97,
  2: 0.88,
  3: 0.74,
  4: 0.58,
  5: 0.43,
  6: 0.29,
} as const;

function publiclyUsable(view: PublicMissionView, action: MissionAction) {
  if (!view.allowedWeapons.includes(action.weapon)) return false;
  if (action.weapon !== "fire" && (view.availableUses[action.weapon] ?? 0) <= 0) return false;
  if (action.weapon === "radar") return action.origin.x < GRID_SIZE - 1 && action.origin.y < GRID_SIZE - 1;
  const targets = actionTargets(action).filter(inBounds);
  if (action.weapon === "fire") return view.shots[action.target.y][action.target.x] === "unknown";
  return targets.some((target) => view.shots[target.y][target.x] === "unknown");
}

export function informedPolicy(rule: MissionStageDefinition, rng: SeededRandom): MissionPolicy {
  const route = CANONICAL_MISSION_ROUTES[rule.id];
  if (!route) throw new Error(`Missing canonical route for mission ${rule.id} ${rule.title}`);
  const wholeMission = INFORMED_COMPREHENSION_BY_DIFFICULTY[rule.difficulty];
  const perOrderFidelity = wholeMission ** (1 / Math.max(1, route.actions.length));
  const fallback = blindPolicy(rng);
  return (view) => {
    const intended = route.actions[view.actionIndex];
    if (intended && publiclyUsable(view, intended) && rng.next() < perOrderFidelity) return intended;
    return fallback(view);
  };
}

export type MissionRate = Readonly<{
  id: number;
  title: string;
  difficulty: number;
  category: string;
  canonical: MissionSimulation;
  blindWins: number;
  informedWins: number;
  trials: number;
}>;

export function measureMissionRates(trials = 5_000): MissionRate[] {
  return verifyCanonicalMissions().map(({ mission, simulation }) => {
    let blindWins = 0;
    let informedWins = 0;
    for (let trial = 0; trial < trials; trial++) {
      const seed = mission.fixedSeed ^ (trial + 1) * 0x9e3779b1;
      const blindResult = simulateMission(mission, blindPolicy(new SeededRandom(seed)));
      if (blindResult.outcome?.result === "victory") blindWins += 1;
      const informedResult = simulateMission(mission, informedPolicy(mission, new SeededRandom(seed ^ 0x85ebca6b)));
      if (informedResult.outcome?.result === "victory") informedWins += 1;
    }
    return {
      id: mission.id,
      title: mission.title,
      difficulty: mission.difficulty,
      category: mission.category,
      canonical: simulation,
      blindWins,
      informedWins,
      trials,
    };
  });
}

function printReport(trials: number) {
  const rates = measureMissionRates(trials);
  console.log(`MISSION_SIMULATION trials=${trials} enemy_seed=fixed policy_input=public-only`);
  console.log("NOTE canonical=proof route; blind=random legal-action baseline; informed=declared clue-comprehension model; neither rate is player telemetry");
  rates.forEach((rate, index) => {
    const canonical = rate.canonical.outcome?.result === "victory" && !rate.canonical.illegalAction ? "PASS" : "FAIL";
    const blindRate = rate.blindWins / rate.trials * 100;
    const informedRate = rate.informedWins / rate.trials * 100;
    console.log(
      `${String(index + 1).padStart(2, "0")} [id=${String(rate.id).padStart(2, "0")}] ${rate.title.padEnd(21)} `
      + `D${rate.difficulty} canonical=${canonical} orders=${rate.canonical.actions} `
      + `hostile=${rate.canonical.enemyActions} blind=${blindRate.toFixed(2)}% (${rate.blindWins}/${rate.trials}) `
      + `informed=${informedRate.toFixed(2)}% (${rate.informedWins}/${rate.trials})`,
    );
    if (rate.canonical.illegalAction) console.log(`   illegal: ${rate.canonical.illegalAction}`);
    if (rate.canonical.outcome?.result !== "victory") console.log(`   outcome: ${rate.canonical.outcome?.report ?? "incomplete"}`);
  });
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  const trials = Math.max(100, Number.parseInt(process.argv[2] ?? "5000", 10) || 5_000);
  printReport(trials);
}
