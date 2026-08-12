import { SHIPS, WEAPON_MAX, type Coord, type ShipId, type WeaponId } from "./constants.ts";
import { type MissionPlacement, type MissionStageDefinition } from "./Campaign.ts";
import { Arsenal, Board, hasEscortLink, hasFireControlLink, inBounds, keyOf, radarCells, sameCoord } from "./engine.ts";
import { validateTrainingStage } from "./TrainingRules.ts";

export type MissionOutcome =
  | { result: "victory"; report: string }
  | { result: "defeat"; report: string }
  | null;

export type MissionState = {
  friendlyActions: number;
  usedWeapons?: WeaponId[];
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
  ordered = false,
) {
  if (ordered) {
    return required.length === actual.length && required.every((expected, index) => {
      const report = actual[index];
      return Boolean(report) && sameCoord(expected.origin, report.origin) && expected.contact === report.contact;
    });
  }
  return required.every((expected) =>
    actual.some((report) => sameCoord(expected.origin, report.origin) && expected.contact === report.contact));
}

function weaponRequirementsComplete(rule: MissionStageDefinition, state: MissionState) {
  const used = state.usedWeapons ?? [];
  const sequence = rule.objective.requiredWeaponSequence;
  if (sequence && (sequence.length !== used.length || sequence.some((weapon, index) => used[index] !== weapon))) {
    return false;
  }
  const requiredUses = rule.objective.requiredWeaponUses;
  if (requiredUses) {
    const expectedTotal = Object.values(requiredUses).reduce((sum, count) => sum + (count ?? 0), 0);
    if (used.length !== expectedTotal) return false;
    for (const [weapon, count] of Object.entries(requiredUses) as Array<[WeaponId, number]>) {
      if (used.filter((actual) => actual === weapon).length !== count) return false;
    }
  }
  return true;
}

function protectedShipsFor(rule: MissionStageDefinition) {
  const objective = rule.objective;
  return objective.kind === "sonar-reports" ? [objective.protectedShip] : objective.protectedShips ?? [];
}

export function missionObjectiveComplete(rule: MissionStageDefinition, state: MissionState) {
  const objective = rule.objective;
  if (!weaponRequirementsComplete(rule, state)) return false;
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
    return objective.targets.every((id) => sunk.has(id)) && reportsComplete(objective.reports, state.sonarReports, objective.orderedReports);
  }
  return reportsComplete(objective.reports, state.sonarReports, objective.orderedReports);
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
  const duplicateValues = <T,>(values: readonly T[]) => values.filter((value, index) => values.indexOf(value) !== index);
  if (!Number.isSafeInteger(rule.id) || rule.id <= 0) issues.push(`mission id must be a positive integer: ${rule.id}`);
  if (!Number.isSafeInteger(rule.sortOrder) || rule.sortOrder <= 0) issues.push(`sortOrder must be a positive integer: ${rule.sortOrder}`);
  if (!Number.isInteger(rule.objective.maxFriendlyActions) || rule.objective.maxFriendlyActions <= 0) {
    issues.push(`maxFriendlyActions must be a positive integer: ${rule.objective.maxFriendlyActions}`);
  }
  if (!Number.isFinite(rule.aiSkill) || rule.aiSkill < 0 || (rule.category !== "training" && rule.aiSkill === 0)) {
    issues.push(`aiSkill must be ${rule.category === "training" ? "non-negative" : "positive"}: ${rule.aiSkill}`);
  }
  if (!Number.isInteger(rule.huntBreadth) || rule.huntBreadth <= 0) issues.push(`huntBreadth must be a positive integer: ${rule.huntBreadth}`);
  if (!Number.isSafeInteger(rule.fixedSeed) || rule.fixedSeed < 0) issues.push(`fixedSeed must be a non-negative safe integer: ${rule.fixedSeed}`);
  if (duplicateValues(rule.allowedWeapons).length) issues.push("allowedWeapons contains a duplicate weapon");
  if (duplicateValues(rule.playerFleet).length) issues.push("friendly fleet contains a duplicate ship id");
  if (duplicateValues(rule.enemyFleet).length) issues.push("hostile fleet contains a duplicate ship id");
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
  for (const id of friendlyIds) if (!rule.playerFleet.includes(id)) issues.push(`friendly deployment has undeclared ${id}`);
  for (const id of hostileIds) if (!rule.enemyFleet.includes(id)) issues.push(`hostile deployment has undeclared ${id}`);

  const inspectInitialHits = (board: Board, cells: Coord[] | undefined, side: "friendly" | "hostile") => {
    const countByShip = new Map<ShipId, number>();
    const seen = new Set<string>();
    for (const cell of cells ?? []) {
      const cellKey = keyOf(cell);
      if (seen.has(cellKey)) issues.push(`${side} initial hit is duplicated at ${cellKey}`);
      seen.add(cellKey);
      if (!inBounds(cell)) {
        issues.push(`${side} initial hit out of bounds at ${cellKey}`);
        continue;
      }
      const ship = board.shipAt(cell);
      if (!ship) issues.push(`${side} initial hit has no hull at ${cellKey}`);
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
  if (duplicateValues(targets).length) issues.push("objective targets contain a duplicate ship id");
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
    const reportOrigins = new Set<string>();
    const reportCodes = new Set<string>();
    const reportHostile = new Board();
    let reportHostileValid = true;
    try {
      deployScenarioFleet(reportHostile, rule.enemyPlacements);
      applyScenarioHits(reportHostile, rule.enemyInitialHits);
    } catch {
      reportHostileValid = false;
    }
    for (const report of objective.reports) {
      const originKey = keyOf(report.origin);
      if (reportOrigins.has(originKey)) issues.push(`sonar origin is duplicated at ${originKey}`);
      reportOrigins.add(originKey);
      if (!report.code.trim()) issues.push(`sonar report at ${originKey} has an empty code`);
      if (reportCodes.has(report.code)) issues.push(`sonar report code is duplicated: ${report.code}`);
      reportCodes.add(report.code);
      if (!inBounds(report.origin) || report.origin.x >= 7 || report.origin.y >= 7) {
        issues.push(`sonar origin cannot form 2x2 at ${originKey}`);
      } else if (reportHostileValid) {
        const actualContact = radarCells(report.origin).some((cell) => {
          const ship = reportHostile.shipAt(cell);
          return Boolean(ship && !ship.sunk && !ship.hits.has(keyOf(cell)));
        });
        if (actualContact !== report.contact) {
          issues.push(`sonar report ${report.code} declares ${report.contact ? "CONTACT" : "NO CONTACT"}, resolved ${actualContact ? "CONTACT" : "NO CONTACT"}`);
        }
      }
    }
  } else if (objective.orderedReports) {
    issues.push("orderedReports requires a sonar-report objective");
  }
  if (objective.requiredWeaponSequence && objective.requiredWeaponUses) {
    issues.push("objective cannot require both a weapon sequence and a weapon multiset");
  }
  if (objective.requiredWeaponSequence) {
    if (objective.requiredWeaponSequence.length > objective.maxFriendlyActions) {
      issues.push("weapon sequence exceeds action limit");
    }
    for (const weapon of objective.requiredWeaponSequence) {
      if (!rule.allowedWeapons.includes(weapon)) issues.push(`required weapon is not allowed: ${weapon}`);
    }
  }
  if (objective.requiredWeaponUses) {
    let total = 0;
    for (const [weapon, count] of Object.entries(objective.requiredWeaponUses) as Array<[WeaponId, number]>) {
      if (!Number.isInteger(count) || count < 0) issues.push(`required weapon count is invalid: ${weapon}=${count}`);
      if (!rule.allowedWeapons.includes(weapon)) issues.push(`required weapon is not allowed: ${weapon}`);
      total += count;
    }
    if (total > objective.maxFriendlyActions) issues.push("required weapon uses exceed action limit");
  }

  const requiredCounts = new Map<WeaponId, number>();
  for (const weapon of objective.requiredWeaponSequence ?? []) requiredCounts.set(weapon, (requiredCounts.get(weapon) ?? 0) + 1);
  for (const [weapon, count] of Object.entries(objective.requiredWeaponUses ?? {}) as Array<[WeaponId, number]>) {
    requiredCounts.set(weapon, count);
  }
  const scenarioArsenal = applyScenarioArsenal(new Arsenal(), rule.initialArsenal);
  for (const [weapon, required] of requiredCounts) {
    if (weapon === "fire") continue;
    const available = scenarioArsenal.availableUses(weapon, friendly);
    if (required > available) issues.push(`required ${weapon} uses ${required} exceed initial availability ${available}`);
  }

  if (duplicateValues(rule.initiallyIdentified ?? []).length) issues.push("initiallyIdentified contains a duplicate ship id");
  if (duplicateValues(rule.enemyDisclosure.known).length) issues.push("enemy disclosure known list contains a duplicate ship id");
  for (const id of rule.initiallyIdentified ?? []) if (!hostileIds.has(id)) issues.push(`identified ship missing: ${id}`);
  for (const id of rule.enemyDisclosure.known) if (!hostileIds.has(id)) issues.push(`disclosed ship missing: ${id}`);
  for (const id of Object.keys(rule.enemyDisclosure.callsigns ?? {}) as ShipId[]) {
    if (!hostileIds.has(id)) issues.push(`callsign assigned to missing hostile ship: ${id}`);
  }
  if (rule.enemyDisclosure.known.length + rule.enemyDisclosure.unknownCount !== rule.enemyFleet.length) {
    issues.push("enemy disclosure count does not match hostile fleet");
  }
  const candidateCodes = new Set<string>();
  for (const candidate of rule.enemyDisclosure.candidateCells ?? []) {
    if (!candidate.code.trim()) issues.push(`candidate at ${keyOf(candidate.coord)} has an empty code`);
    if (candidateCodes.has(candidate.code)) issues.push(`candidate code is duplicated: ${candidate.code}`);
    candidateCodes.add(candidate.code);
    if (!inBounds(candidate.coord)) issues.push(`candidate ${candidate.code} out of bounds`);
  }
  if (rule.category === "archive") {
    if (!rule.archiveLog?.length) issues.push("archive mission has no archiveLog");
    for (const entry of rule.archiveLog ?? []) {
      const match = entry.time.match(/^(\d{2})(\d{2})Z$/);
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) issues.push(`invalid archive timestamp: ${entry.time}`);
    }
  } else if (rule.archiveLog?.length) {
    issues.push(`${rule.category} mission must not carry archiveLog`);
  }
  if (rule.category === "training") issues.push(...validateTrainingStage(rule));
  else if (rule.training) issues.push(`${rule.category} mission must not carry a training plan`);

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
  const orderKeys = new Set<string>();
  for (const rule of library) {
    if (ids.has(rule.id)) issues.push(`duplicate mission id ${rule.id}`);
    ids.add(rule.id);
    const orderKey = `${rule.category}/${rule.sortOrder}`;
    if (orderKeys.has(orderKey)) issues.push(`duplicate ${rule.category} sortOrder ${rule.sortOrder}`);
    orderKeys.add(orderKey);
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
