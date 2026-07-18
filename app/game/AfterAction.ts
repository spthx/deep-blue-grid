import { SHIPS, type ShipId } from "./constants.ts";

export type UnusedSpecial = { label: string; uses: number };
export type SurvivalAssessmentContext = {
  playerEntryShips: number;
  playerEntryCells: number;
  enemyEntryShips: number;
  enemyEntryCells: number;
  previousLosses: ShipId[];
};
export type AssessmentInput = {
  enemyRemainingShips: number;
  enemyRemainingCells: number;
  accuracy: number;
  shots: number;
  specialUsed: number;
  unusedSpecials: UnusedSpecial[];
  firstLoss?: ShipId;
  identified: number;
  enemyTotalShips: number;
  identificationRules: boolean;
  survival?: SurvivalAssessmentContext;
};

export type CommandAssessment = {
  facts: Array<{ label: string; value: string }>;
  finding: string;
};

const capabilityFinding: Partial<Record<ShipId, string>> = {
  carrier: "航空打撃能力を喪失。以後も主砲射撃能力は残存。",
  escort: "護衛能力及びF-4追加出撃能力を喪失。",
  submarine: "音響捜索能力を喪失。以後、レーダーによる候補海域圧縮不能。",
};

function survivalFinding(input: AssessmentInput) {
  const context = input.survival;
  if (!context) return null;

  const cumulativeLosses = context.previousLosses.length;
  const enemyAdvantage = context.playerEntryCells < context.enemyEntryCells;
  if (!cumulativeLosses && !enemyAdvantage) return null;

  const enemyShipsSunk = Math.max(0, context.enemyEntryShips - input.enemyRemainingShips);
  const enemyCellsDestroyed = Math.max(0, context.enemyEntryCells - input.enemyRemainingCells);
  const situation = enemyAdvantage
    ? "作戦開始時より敵側優勢。"
    : `累積損耗${cumulativeLosses}艦。残存艦隊で交戦。`;
  const termination = "自軍艦隊、戦闘能力喪失。作戦続行不能。";

  if (input.enemyRemainingCells <= 2) {
    return `${situation}敵艦隊、残存${input.enemyRemainingCells}区画。敵艦隊戦力の大半を減殺。${termination}`;
  }
  if (enemyShipsSunk > 0) {
    return `${situation}敵${enemyShipsSunk}艦撃沈、${enemyCellsDestroyed}区画破壊。敵艦隊戦力の減殺を確認。${termination}`;
  }
  if (enemyCellsDestroyed > 0) {
    return `${situation}敵艦隊、${enemyCellsDestroyed}区画損傷。戦闘能力低下を確認。${termination}`;
  }
  return `${situation}敵艦隊への有効損害なし。${termination}`;
}

export function commandAssessment(input: AssessmentInput): CommandAssessment {
  const firstLoss = input.firstLoss ? SHIPS.find((ship) => ship.id === input.firstLoss) : undefined;
  const unusedTotal = input.unusedSpecials.reduce((sum, weapon) => sum + weapon.uses, 0);
  const unusedLabel = input.unusedSpecials.map((weapon) => `${weapon.label}×${weapon.uses}`).join(" / ") || "なし";
  const facts = [
    { label: "敵残存戦力", value: `${input.enemyRemainingShips}艦 / ${input.enemyRemainingCells}区画` },
    { label: "最初の喪失艦", value: firstLoss ? `${firstLoss.name} / ${firstLoss.code}` : "記録なし" },
    { label: "攻撃命中率", value: input.shots ? `${input.accuracy}%` : "射撃記録なし" },
    { label: "特殊兵装", value: `投入${input.specialUsed} / 未投入 ${unusedLabel}` },
  ];
  if (input.survival) {
    const lostNames = input.survival.previousLosses
      .map((id) => SHIPS.find((ship) => ship.id === id)?.name)
      .filter(Boolean)
      .join(" / ");
    const enemyShipsSunk = Math.max(0, input.survival.enemyEntryShips - input.enemyRemainingShips);
    const enemyCellsDestroyed = Math.max(0, input.survival.enemyEntryCells - input.enemyRemainingCells);
    facts.unshift(
      {
        label: "作戦開始戦力",
        value: `自軍 ${input.survival.playerEntryShips}艦・${input.survival.playerEntryCells}区画 / 敵軍 ${input.survival.enemyEntryShips}艦・${input.survival.enemyEntryCells}区画`,
      },
      { label: "累積損耗", value: input.survival.previousLosses.length ? `${input.survival.previousLosses.length}艦：${lostNames}` : "なし" },
      { label: "当該海域戦果", value: `${enemyShipsSunk}艦撃沈 / ${enemyCellsDestroyed}区画破壊` },
    );
  }
  if (input.identificationRules) facts.push({ label: "敵艦識別", value: `${input.identified} / ${input.enemyTotalShips}` });

  const capability = input.firstLoss ? capabilityFinding[input.firstLoss] ?? "" : "";
  let finding: string;
  const survivalAssessment = survivalFinding(input);
  if (survivalAssessment) {
    finding = survivalAssessment;
  } else if (input.enemyRemainingCells <= 2) {
    finding = `敵艦隊、残存${input.enemyRemainingCells}区画。${capability}`;
    finding += unusedTotal > 0
      ? "残存兵装の早期投入により、敵戦闘能力を先行して奪う余地あり。"
      : "艦砲射撃による火力集中に、再検討の余地あり。";
  } else if (input.shots >= 8 && input.accuracy < 25) {
    finding = `索敵射撃、命中率${input.accuracy}%。敵残存戦力の捕捉に時間を要したと認められる。`;
    finding += unusedTotal > 0 ? "残存兵装による候補海域圧縮に、活用余地あり。" : "目標海域の選定に、再検討の余地あり。";
  } else if (capability) {
    finding = capability + (unusedTotal > 0
      ? "残存兵装の投入時期及び目標配分に、再検討の余地あり。"
      : "以後の火力配分に、再検討の余地あり。");
  } else if (unusedTotal > 0) {
    finding = "攻撃可能兵装を保持したまま自軍戦闘能力を喪失。兵装の投入時期及び目標配分に、再検討の余地あり。";
  } else {
    finding = "自軍艦隊の損耗が、敵艦隊の戦闘能力喪失に先行。索敵結果に基づく火力配分に、再検討の余地あり。";
  }

  return { facts, finding };
}

export function formatZulu(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}Z`;
}

export function formatLocal(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatElapsed(start: number, end: number) {
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
