import { type ShipId, type WeaponId } from "./constants.ts";

/**
 * Presentation data shared by the Web UI and the Unity handoff exporter.
 * Keep rules in engine/Campaign; this file owns labels, operator guidance and
 * deterministic timing/material values that must not drift between clients.
 */
export const LOST_CAPABILITY: Record<ShipId, string> = {
  carrier: "航空打撃能力喪失。F-4 PHANTOM使用不能。",
  battleship: "長距離打撃能力喪失。HARPOON使用不能。",
  cruiser: "夾叉射撃能力喪失。8-INCH STRADDLE使用不能。",
  silentSubmarine: "特殊潜航能力喪失。",
  leviathan: "戦略潜航能力喪失。LEVIATHANを拘束。",
  destroyer: "連続射撃能力喪失。MK-45 II使用不能。",
  escort: "護衛支援能力喪失。",
  escortBravo: "護衛支援能力喪失。残存護衛艦の支援リンクのみ継続。",
  submarine: "受動聴音能力喪失。PASSIVE SONAR使用不能。",
};

export const WEAPON_PRESENTATION: Record<WeaponId, {
  label: string;
  compactLabel: string;
  carrier?: ShipId;
  help: string;
  requirement: string;
  pattern: string;
}> = {
  fire: { label: "通常砲撃", compactLabel: "GUN", help: "敵情図の1区画を攻撃します。", requirement: "目標 1", pattern: "単点 / 1区画" },
  phantom: { label: "F-4 PHANTOM", compactLabel: "F-4", carrier: "carrier", help: "異なる4区画へ航空攻撃。護衛艦の全区画が空母へ上下左右で隣接し、護衛リンクが成立している間は2回、それ以外は合計1回まで出撃できます。", requirement: "目標 4", pattern: "任意 / 4区画" },
  harpoon: { label: "HARPOON", compactLabel: "HARPOON", carrier: "battleship", help: "照準を中心にX字5区画を攻撃。通常2回、護衛艦の全区画が戦艦へ上下左右で隣接し、射撃管制リンクが成立している間は3回まで使用できます。", requirement: "中心 1", pattern: "X字 / 5区画" },
  sparrow: { label: "8-INCH STRADDLE", compactLabel: "8-INCH", carrier: "cruiser", help: "20.3cm主砲による夾叉斉射。照準区画とその前方3区画へ散布界を形成します。同じ照準または兵装を再タップ、またはRで90°回転します。", requirement: "基準 1", pattern: "方向指定 / 4区画" },
  mk45: { label: "MK-45 II", compactLabel: "MK-45", carrier: "destroyer", help: "異なる2区画を連続攻撃します。", requirement: "目標 2", pattern: "任意 / 2区画" },
  radar: { label: "PASSIVE SONAR", compactLabel: "SONAR", carrier: "submarine", help: "指定した2×2の4区画を受動聴音します。CONTACTは範囲内に未破壊艦区画の音響反応あり、NO CONTACTは反応なしを示します。", requirement: "左上 1", pattern: "2×2聴音 / 攻撃力なし" },
};

export const ACTION_LABEL: Record<WeaponId, string> = {
  fire: "艦砲射撃",
  phantom: "攻撃隊発進",
  harpoon: "HARPOON 発射",
  sparrow: "20.3cm砲 夾叉斉射",
  mk45: "MK-45 II 連続射撃",
  radar: "聴音開始",
};

export const UI_TEXT_CATALOG = {
  fields: {
    ownTab: "自軍戦術図",
    enemyTab: "敵情図",
    ownPlot: "OWN FORCE PLOT // 自軍戦術図",
    enemyPlot: "HOSTILE CONTACT PLOT // 敵情図",
  },
  actions: {
    commence: "COMMENCE / 交戦開始",
    fileDamageReport: "戦闘記録へ記載",
    cancel: "CANCEL",
    log: "LOG",
  },
  libraries: {
    modeSelect: "MODE SELECT",
    missionIndex: "MISSION INDEX",
    initialTraining: "INITIAL TRAINING",
  },
  outcomes: {
    missionComplete: "任務達成",
    missionIncomplete: "任務条件未達",
    lessonComplete: "教程修了",
    lessonIncomplete: "訓練未修了",
  },
} as const;

export const SHIP_DOSSIER: Record<ShipId, { role: string; capability: string; loss: string }> = {
  carrier: { role: "8区画・航空打撃中枢", capability: "F-4 PHANTOMを運用。護衛リンク成立時は出撃回数＋1。", loss: "喪失するとF-4は以後使用不能。" },
  battleship: { role: "5区画・主力打撃艦", capability: "HARPOONによるX字5区画攻撃。護衛艦との射撃管制リンク成立時は使用回数＋1。", loss: "喪失するとHARPOONは以後使用不能。" },
  cruiser: { role: "4区画・砲戦巡洋艦", capability: "8-INCH STRADDLEで、照準区画と前方3区画へ方向指定の夾叉斉射。", loss: "喪失すると8-INCH STRADDLEは以後使用不能。" },
  destroyer: { role: "3区画・高速火力艦", capability: "MK-45 IIで異なる2区画を連続攻撃。", loss: "喪失するとMK-45 IIは以後使用不能。" },
  escort: { role: "2区画・艦隊護衛艦", capability: "全区画を空母へ上下左右で隣接させるとF-4＋1、戦艦へ隣接させるとHARPOON＋1。双方への同時リンクも成立。", loss: "喪失またはリンク不成立で追加行動を失う。密集陣形は範囲攻撃の危険を伴う。" },
  escortBravo: { role: "2区画・艦隊護衛艦", capability: "DE-02。空母または戦艦へ全区画を隣接させ、独立した護衛リンクを形成する。支援回数は重複加算されない。", loss: "喪失するとDE-02が担当していた支援リンクのみ失う。" },
  submarine: { role: "1区画・音響捜索艦", capability: "PASSIVE SONARを2回使用。最後の1艦になると行動後に音紋が発生。", loss: "喪失すると受動聴音は以後使用不能。" },
  silentSubmarine: { role: "1区画・特殊潜航艦", capability: "攻撃と無音潜航を交互に実施。無音潜航時は発砲・音紋なしで、表示のない区画へ移動する。", loss: "SURVIVAL第3作戦専用。2回の有効接触で撃沈。" },
  leviathan: { role: "1区画・戦略潜航艦", capability: "攻撃と静粛移動を交互に実施。追跡網の未観測区画へ離脱し、二度の有効接触で撃沈。", loss: "極限任務OPERATION MOBY-DICK専用接触。SURVIVALのSEA BATとは別個体。" },
};

export const MISSION_DIFFICULTY_NAME: Readonly<Record<number, string>> = {
  1: "入門",
  2: "基礎",
  3: "標準",
  4: "上級",
  5: "難関",
  6: "極限",
};

export const PRESENTATION_TIMINGS_MS = {
  identificationNotice: 1650,
  weaponPeek: 2600,
  turnFlash: 1050,
  enemyOpeningHold: 1050,
  enemySilentAction: 750,
  enemySilentSonarAction: 800,
  silentDiveNotice: 1900,
  sonarReport: 1450,
  enemyImpactBeat: 260,
  enemyPostAction: 850,
  playerCommit: 400,
  playerImpactBeat: 220,
  playerPostAction: 850,
  playerSilentAction: 800,
  touchRotationGuard: 200,
} as const;

export const RESPONSIVE_UI_CONTRACT = {
  touchTargetPx: 44,
  primaryTargetPx: 50,
  supportedFloor: { width: 320, height: 568 },
  phonePortraitReference: { width: 402, height: 874 },
  compactLayoutMedia: "(max-width: 1099px) and (orientation: portrait), (max-width: 959px) and (max-height: 600px)",
  profiles: ["phone-portrait", "tablet-portrait", "compact-landscape", "wide-landscape"],
} as const;

export const CIC_MATERIAL_CONTRACT = {
  philosophy: "component-local; never depend on global z-order",
  grain: {
    firstTilePx: [29, 31],
    secondTilePx: [43, 47],
    firstAlpha: 0.42,
    secondAlpha: 0.30,
    controlOpacity: 0.14,
    longCopyOpacity: 0.10,
    selectedOpacity: 0.17,
  },
  scanline: { periodPx: 4, darkRowStartPx: 3, alpha: 0.72 },
  layers: ["surface fill", "scanline", "grain", "content", "focus ring"],
} as const;

export const UNITY_SAVE_DATA_CONTRACT = {
  version: 1,
  writePolicy: "serialize to a temporary file, flush, then atomically replace the primary save; retain one last-known-good backup",
  corruptionPolicy: "validate version and field ranges; fall back to backup, then to defaults without deleting the unreadable file",
  lifecycle: ["save after settings change", "save after mission/training result", "save after every survival operation", "save on OnApplicationPause(true)", "save on OnApplicationQuit"],
  fields: {
    settings: ["muted", "reducedMotion", "textScale"],
    missionRecords: ["missionId", "cleared", "bestFriendlyActions", "bestElapsedMs", "attemptCount"],
    trainingProgress: ["completedLessons"],
    survivalRun: ["active", "operationIndex", "survivingFleet", "cumulativeLog", "startedAtUtc", "elapsedMs"],
  },
} as const;
