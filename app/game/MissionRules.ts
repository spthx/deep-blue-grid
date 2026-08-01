import { SHIPS, type Coord, type ShipId } from "./constants.ts";
import { type MissionPlacement, type MissionStageDefinition } from "./Campaign.ts";
import { Board, keyOf, sameCoord } from "./engine.ts";

export type MissionOutcome =
  | { result: "victory"; report: string }
  | { result: "defeat"; report: string }
  | null;

export type MissionState = {
  friendlyActions: number;
  enemySunk: ShipId[];
  friendlyAlive: ShipId[];
  sonarReports: Array<{ origin: Coord; contact: boolean }>;
};

export function isMissionSonarOrigin(rule: MissionStageDefinition | null | undefined, origin: Coord) {
  return rule?.objective.kind !== "sonar-reports"
    || rule.objective.reports.some((report) => sameCoord(report.origin, origin));
}

export function evaluateMission(rule: MissionStageDefinition, state: MissionState): MissionOutcome {
  const sunk = new Set(state.enemySunk);
  const alive = new Set(state.friendlyAlive);
  const objective = rule.objective;
  if (objective.kind === "destroy-targets") {
    const targetsDestroyed = objective.targets.every((id) => sunk.has(id));
    if (targetsDestroyed) {
      return { result: "victory", report: rule.completion.success };
    }
    const lostProtected = objective.protectedShips?.find((id) => !alive.has(id));
    if (lostProtected) {
      const protectedName = SHIPS.find((ship) => ship.id === lostProtected)?.name ?? "護衛対象";
      return { result: "defeat", report: rule.completion.protected?.[lostProtected] ?? `${protectedName}の戦闘能力喪失を確認。生存条件未達。` };
    }
    if (state.friendlyActions >= objective.maxFriendlyActions) {
      return { result: "defeat", report: rule.completion.deadline };
    }
    return null;
  }

  const reportsComplete = objective.reports.every((required) =>
    state.sonarReports.some((actual) => sameCoord(required.origin, actual.origin) && required.contact === actual.contact));
  if (reportsComplete) {
    return { result: "victory", report: rule.completion.success };
  }
  if (!alive.has(objective.protectedShip)) {
    const protectedName = SHIPS.find((ship) => ship.id === objective.protectedShip)?.name ?? "護衛対象";
    return { result: "defeat", report: rule.completion.protected?.[objective.protectedShip] ?? `${protectedName}の戦闘能力喪失を確認。聴音監視を中止。` };
  }
  if (state.friendlyActions >= objective.maxFriendlyActions) {
    return { result: "defeat", report: rule.completion.deadline };
  }
  return null;
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
