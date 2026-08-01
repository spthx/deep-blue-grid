import { SHIPS, WEAPON_MAX, type Coord, type ShipId, type WeaponId } from "./constants.ts";
import { type MissionPlacement, type MissionStageDefinition } from "./Campaign.ts";
import { Arsenal, Board, hasEscortLink, hasFireControlLink, inBounds, keyOf, sameCoord } from "./engine.ts";

export type MissionOutcome =
  | { result: "victory"; report: string }
  | { result: "defeat"; report: string }
  | null;

export type MissionState = {
  friendlyActions: number;
  enemySunk: ShipId[];
  enemySunkOrder?: ShipId[];
  enemyIdentified?: ShipId[];
  friendlyAlive: ShipId[];
  sonarReports: Array<{ origin: Coord; contact: boolean }>;
};

export function isMissionSonarOrigin(rule: MissionStageDefinition | null | undefined, origin: Coord) {
  if (!rule || (rule.objective.kind !== "sonar-reports" && rule.objective.kind !== "scan-and-destroy")) return true;
  return rule.objective.reports.some((report) => sameCoord(report.origin, origin));
}

function reportsComplete(
  required: Array<{ origin: Coord; contact: boolean }>,
  actual: Array<{ origin: Coord; contact: boolean }>,
) {
  return required.every((expected) =>
    actual.some((report) => sameCoord(expected.origin, report.origin) && expected.contact === report.contact));
}

function protectedShipsFor(rule: MissionStageDefinition) {
  const objective = rule.objective;
  return objective.kind === "sonar-reports" ? [objective.protectedShip] : objective.protectedShips ?? [];
}

export function missionObjectiveComplete(rule: MissionStageDefinition, state: MissionState) {
  const objective = rule.objective;
  const sunk = new Set(state.enemySunk);
  const identified = new Set(state.enemyIdentified ?? []);
  if (objective.kind === "destroy-targets") {
    if (!objective.targets.every((id) => sunk.has(id))) return false;
    if (!objective.requiredDestructionOrder) return true;
    if (!state.enemySunkOrder) return false;
    const targets = new Set(objective.requiredDestructionOrder);
    const actualOrder = state.enemySunkOrder.filter((id) => targets.has(id));
    return objective.requiredDestructionOrder.every((id, index) => actualOrder[index] === id);
  }
  if (objective.kind === "identify-targets") return objective.targets.every((id) => identified.has(id));
  if (objective.kind === "scan-and-destroy") {
    return objective.targets.every((id) => sunk.has(id)) && reportsComplete(objective.reports, state.sonarReports);
  }
  return reportsComplete(objective.reports, state.sonarReports);
}

export function evaluateMission(rule: MissionStageDefinition, state: MissionState): MissionOutcome {
  if (missionObjectiveComplete(rule, state)) {
    return { result: "victory", report: rule.completion.success };
  }

  const alive = new Set(state.friendlyAlive);
  const lostProtected = protectedShipsFor(rule).find((id) => !alive.has(id));
  if (lostProtected) {
    const protectedName = SHIPS.find((ship) => ship.id === lostProtected)?.name ?? "護衛対象";
    const defaultReport = rule.objective.kind === "sonar-reports" || rule.objective.kind === "scan-and-destroy"
      ? `${protectedName}の戦闘能力喪失を確認。聴音監視を中止。`
      : `${protectedName}の戦闘能力喪失を確認。生存条件未達。`;
    return { result: "defeat", report: rule.completion.protected?.[lostProtected] ?? defaultReport };
  }

  if (state.friendlyActions >= rule.objective.maxFriendlyActions) {
    return { result: "defeat", report: rule.completion.deadline };
  }
  return null;
}

/** Mission-defined magazine counters are raw Arsenal.uses values, not displayed dynamic availability. */
export function applyScenarioArsenal(arsenal: Arsenal, initial: MissionStageDefinition["initialArsenal"] = {}) {
  arsenal.reset();
  for (const [weapon, requested] of Object.entries(initial) as Array<[Exclude<WeaponId, "fire">, number]>) {
    const maximum = WEAPON_MAX[weapon];
    arsenal.uses[weapon] = Math.max(0, Math.min(maximum, Math.floor(requested)));
  }
  return arsenal;
}

const WEAPON_CARRIER: Partial<Record<WeaponId, ShipId>> = {
  phantom: "carrier",
  harpoon: "battleship",
  sparrow: "cruiser",
  mk45: "destroyer",
  radar: "submarine",
};

/**
 * Authoring-time validation with no hidden RNG dependency.  Canonical attack
 * vectors remain in tests/scripts; this function verifies the static contract
 * that makes those vectors meaningful.
 */
export function validateMissionDefinition(rule: MissionStageDefinition) {
  const issues: string[] = [];
  const friendly = new Board();
  const hostile = new Board();
  try {
    deployScenarioFleet(friendly, rule.playerPlacements);
  } catch (error) {
    issues.push(`friendly deployment: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    deployScenarioFleet(hostile, rule.enemyPlacements);
  } catch (error) {
    issues.push(`hostile deployment: ${error instanceof Error ? error.message : String(error)}`);
  }

  const friendlyIds = new Set(friendly.ships.map((ship) => ship.id));
  const hostileIds = new Set(hostile.ships.map((ship) => ship.id));
  for (const id of rule.playerFleet) if (!friendlyIds.has(id)) issues.push(`friendly fleet missing ${id}`);
  for (const id of rule.enemyFleet) if (!hostileIds.has(id)) issues.push(`hostile fleet missing ${id}`);

  const inspectInitialHits = (board: Board, cells: Coord[] | undefined, side: "friendly" | "hostile") => {
    const countByShip = new Map<ShipId, number>();
    for (const cell of cells ?? []) {
      if (!inBounds(cell)) {
        issues.push(`${side} initial hit out of bounds at ${keyOf(cell)}`);
        continue;
      }
      const ship = board.shipAt(cell);
      if (!ship) issues.push(`${side} initial hit has no hull at ${keyOf(cell)}`);
      else countByShip.set(ship.id, (countByShip.get(ship.id) ?? 0) + 1);
    }
    for (const [id, count] of countByShip) {
      const ship = board.ships.find((candidate) => candidate.id === id)!;
      if (count >= ship.size) issues.push(`${side} ${id} starts destroyed (${count}/${ship.size})`);
    }
  };
  inspectInitialHits(friendly, rule.playerInitialHits, "friendly");
  inspectInitialHits(hostile, rule.enemyInitialHits, "hostile");
  applyScenarioHits(friendly, rule.playerInitialHits);
  applyScenarioHits(hostile, rule.enemyInitialHits);

  for (const intel of rule.initialIntel ?? []) {
    if (!inBounds(intel.coord)) {
      issues.push(`intel out of bounds at ${keyOf(intel.coord)}`);
      continue;
    }
    const actual = hostile.attack(intel.coord).kind.toLowerCase();
    if (actual !== intel.mark) issues.push(`intel ${keyOf(intel.coord)} declares ${intel.mark}, resolved ${actual}`);
  }
  for (const wake of rule.initialEnemyWakes ?? []) {
    if (!inBounds(wake)) issues.push(`wake out of bounds at ${keyOf(wake)}`);
    else if (hostile.shipAt(wake)) issues.push(`wake overlaps hostile hull at ${keyOf(wake)}`);
  }

  for (const weapon of rule.allowedWeapons) {
    const carrier = WEAPON_CARRIER[weapon];
    if (carrier && !friendlyIds.has(carrier)) issues.push(`${weapon} allowed without friendly ${carrier}`);
  }
  for (const [weapon, value] of Object.entries(rule.initialArsenal ?? {}) as Array<[Exclude<WeaponId, "fire">, number]>) {
    if (!Number.isInteger(value) || value < 0 || value > WEAPON_MAX[weapon]) {
      issues.push(`initial arsenal ${weapon}=${value} is outside 0..${WEAPON_MAX[weapon]}`);
    }
  }

  const objective = rule.objective;
  const targets = objective.kind === "sonar-reports" ? [] : objective.targets;
  for (const id of targets) if (!hostileIds.has(id)) issues.push(`objective target missing from hostile fleet: ${id}`);
  for (const id of protectedShipsFor(rule)) if (!friendlyIds.has(id)) issues.push(`protected ship missing from friendly fleet: ${id}`);
  if (objective.kind === "destroy-targets" && objective.requiredDestructionOrder) {
    const ordered = new Set(objective.requiredDestructionOrder);
    if (ordered.size !== objective.requiredDestructionOrder.length) issues.push("destruction order contains a duplicate target");
    if (objective.requiredDestructionOrder.some((id) => !objective.targets.includes(id))) {
      issues.push("destruction order contains a non-objective target");
    }
  }
  if (objective.kind === "sonar-reports" || objective.kind === "scan-and-destroy") {
    for (const report of objective.reports) {
      if (!inBounds(report.origin) || report.origin.x >= 7 || report.origin.y >= 7) {
        issues.push(`sonar origin cannot form 2x2 at ${keyOf(report.origin)}`);
      }
    }
  }

  for (const id of rule.initiallyIdentified ?? []) if (!hostileIds.has(id)) issues.push(`identified ship missing: ${id}`);
  for (const id of rule.enemyDisclosure.known) if (!hostileIds.has(id)) issues.push(`disclosed ship missing: ${id}`);
  if (rule.enemyDisclosure.known.length + rule.enemyDisclosure.unknownCount !== rule.enemyFleet.length) {
    issues.push("enemy disclosure count does not match hostile fleet");
  }
  for (const candidate of rule.enemyDisclosure.candidateCells ?? []) {
    if (!inBounds(candidate.coord)) issues.push(`candidate ${candidate.code} out of bounds`);
  }
  if (rule.category === "archive") {
    if (!rule.archiveLog?.length) issues.push("archive mission has no archiveLog");
    for (const entry of rule.archiveLog ?? []) {
      if (!/^\d{4}Z$/.test(entry.time)) issues.push(`invalid archive timestamp: ${entry.time}`);
    }
  } else if (rule.archiveLog?.length) {
    issues.push("standard mission must not carry archiveLog");
  }

  if (rule.requiredLink === "carrier" && !hasEscortLink(friendly)) issues.push("required carrier link is inactive");
  if (rule.requiredLink === "battleship" && !hasFireControlLink(friendly)) issues.push("required battleship link is inactive");
  for (const link of rule.requiredLinks ?? []) {
    if (link === "carrier" && !hasEscortLink(friendly)) issues.push("required carrier link is inactive");
    if (link === "battleship" && !hasFireControlLink(friendly)) issues.push("required battleship link is inactive");
  }
  return issues;
}

export function validateMissionLibrary(library: ReadonlyArray<MissionStageDefinition>) {
  const issues: string[] = [];
  const ids = new Set<number>();
  for (const rule of library) {
    if (ids.has(rule.id)) issues.push(`duplicate mission id ${rule.id}`);
    ids.add(rule.id);
    issues.push(...validateMissionDefinition(rule).map((issue) => `${rule.id}/${rule.title}: ${issue}`));
  }
  return issues;
}

/** シナリオ開始前の既定損傷を、重要区画を避けて自軍戦術図へ記録する。 */
export function applyScenarioDamage(board: Board, damage: Partial<Record<ShipId, number>> = {}) {
  const reports: string[] = [];
  for (const [id, requested] of Object.entries(damage) as Array<[ShipId, number]>) {
    const ship = board.ships.find((candidate) => candidate.id === id);
    if (!ship || requested <= 0) continue;
    const candidates = [
      ...ship.cells.filter((cell) => !sameCoord(cell, ship.critical)),
      ...ship.cells.filter((cell) => sameCoord(cell, ship.critical)),
    ];
    const count = Math.min(requested, Math.max(0, ship.size - 1), candidates.length);
    for (const cell of candidates.slice(0, count)) {
      ship.hits.add(keyOf(cell));
      board.shots[cell.y][cell.x] = "hit";
    }
    if (count) reports.push(`${ship.name}：既存損傷 ${count}/${ship.size} 区画。`);
  }
  return reports;
}

export function applyScenarioHits(board: Board, cells: Coord[] = []) {
  const reports = new Map<ShipId, number>();
  for (const cell of cells) {
    const ship = board.shipAt(cell);
    if (!ship || ship.hits.has(keyOf(cell)) || ship.sunk) continue;
    ship.hits.add(keyOf(cell));
    board.shots[cell.y][cell.x] = "hit";
    reports.set(ship.id, (reports.get(ship.id) ?? 0) + 1);
  }
  return [...reports].map(([id, count]) => {
    const ship = board.ships.find((candidate) => candidate.id === id)!;
    return `${ship.name}：既存損傷 ${count}/${ship.size} 区画。`;
  });
}

export function deployScenarioFleet(board: Board, placements: MissionPlacement[]) {
  board.reset();
  for (const placement of placements) {
    if (!board.placeShip(placement.id, placement.start, placement.orientation)) {
      throw new Error(`Illegal mission placement: ${placement.id} at ${placement.start.x},${placement.start.y}`);
    }
  }
}
