"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CELL_LABELS,
  GAME_TITLE,
  ORIENTATIONS,
  SHIPS,
  STAGES,
  isEscort,
  isHorizontal,
  type Coord,
  type Orientation,
  type ShipId,
  type WeaponId,
} from "./constants.ts";
import {
  Arsenal,
  Board,
  SeededRandom,
  escortLinksFor,
  hasEscortLink,
  hasFireControlLink,
  harpoonCells,
  radarCells,
  straddleCells,
  type AttackResult,
} from "./engine.ts";
import { EnemyAI } from "./EnemyAI.ts";
import { AudioManager } from "./AudioManager.ts";
import { drawBoard, pointerToCoord } from "./Renderer.ts";
import { nextSubmarineWake } from "./SubmarineWake.ts";
import {
  FULL_FLEET,
  aiSkillFor,
  enemyFleetFor,
  friendlyStarts,
  huntBreadthFor,
  isSilentStage,
  MISSION_LIBRARY,
  TRAINING_STAGES,
  missionLibraryFor,
  missionFor,
  missionRuleFor,
  playerFleetFor,
  routeUnit,
  stagesFor,
  survivingFleet,
  usesTacticsRules,
  type GameMode,
  type MissionArchiveEntry,
  type MissionOrder,
  type MissionStageDefinition,
} from "./Campaign.ts";
import { applyScenarioArsenal, applyScenarioHits, deployScenarioFleet, evaluateMission, isMissionSonarOrigin, type MissionOutcome } from "./MissionRules.ts";
import { commandAssessment, formatElapsed, formatJapan, formatZulu, type UnusedSpecial } from "./AfterAction.ts";
import { OperationRecorder, formatOperationDuration, type OperationRecordSnapshot } from "./OperationRecord.ts";
import {
  findMissionRecord,
  loadMissionRecords,
  updateStoredMissionResult,
  type MissionRecordBook,
  type MissionRecordUpdate,
} from "./MissionRecords.ts";
import { matchesTrainingStep } from "./TrainingRules.ts";
import {
  isTrainingLessonComplete,
  loadTrainingProgress,
  nextIncompleteTrainingLesson,
  trainingCompletionCount,
  trainingStageIdForLesson,
  updateStoredTrainingProgress,
  type TrainingProgress,
} from "./TrainingProgress.ts";

type Phase = "placement" | "player" | "enemy" | "review" | "victory" | "defeat";
type ActiveEffect = "none" | "target" | "scan" | "impact";
type Stats = { turns: number; shots: number; hits: number; sunk: number; specials: number; damage: number };
type LogKind = "event" | "campaign" | "stage-start" | "stage-end" | "withdrawal" | "supply";
type LogEntry = { id: number; at: number; text: string; tone: "info" | "good" | "bad"; kind: LogKind };
type ShipCardOptions = { selectable?: boolean; concealDamage?: boolean; concealIdentity?: boolean; identified?: boolean; contactIndex?: number };
type PlacementGesture = { pointerId: number; offset: Coord; origin: Coord; startedOnPreview: boolean; moved: boolean; justPickedUp: boolean };
type PlacementBackup = { id: ShipId; start: Coord; orientation: Orientation };
type MissionLibrarySection = "tactical" | "archive" | "extreme" | "training";
type MissionCompletionFilter = "all" | "uncleared" | "cleared";
type MissionClock = { accumulatedMs: number; activeSince: number | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const activeNow = () => typeof performance === "undefined" ? Date.now() : performance.now();
const wallClockNow = () => Date.now();
const coordName = (coord: Coord) => CELL_LABELS[coord.y] + "-" + (coord.x + 1);
const sameCoord = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;
const freshStats = (): Stats => ({ turns: 0, shots: 0, hits: 0, sunk: 0, specials: 0, damage: 0 });
const STRADDLE_ORIENTATIONS: ReadonlyArray<Orientation> = ["north", "east", "south", "west"];
const STRADDLE_DIRECTION: Record<Orientation, string> = { north: "北", east: "東", south: "南", west: "西" };

// Responsive contract shared with globals.css and the future Unity layout profiles:
// portrait phones/tablets use one tactical plot and a thumb dock; landscape uses
// both plots where height permits, or one plot plus a right-side command rail.
const COMPACT_LAYOUT_MEDIA = "(max-width: 1099px) and (orientation: portrait), (max-width: 959px) and (max-height: 600px)";

const LOST_CAPABILITY: Record<ShipId, string> = {
  carrier: "航空打撃能力喪失。F-4 PHANTOM使用不能。",
  battleship: "長距離打撃能力喪失。HARPOON使用不能。",
  cruiser: "夾叉射撃能力喪失。8-INCH STRADDLE使用不能。",
  silentSubmarine: "特殊潜航能力喪失。",
  leviathan: "戦略潜航能力喪失。LEVIATHANを拘束。",
  destroyer: "連続射撃能力喪失。MK-45 II使用不能。",
  escort: "護衛支援能力喪失。F-4追加出撃及びHARPOON追加発射不能。",
  escortBravo: "護衛支援能力喪失。残存護衛艦の支援リンクのみ継続。",
  submarine: "受動聴音能力喪失。PASSIVE SONAR使用不能。",
};

const WEAPON_META: Record<WeaponId, { label: string; compactLabel: string; carrier?: ShipId; help: string; requirement: string; pattern: string }> = {
  fire: { label: "通常砲撃", compactLabel: "GUN", help: "敵情図の1区画を攻撃します。", requirement: "目標 1", pattern: "単点 / 1区画" },
  phantom: { label: "F-4 PHANTOM", compactLabel: "F-4", carrier: "carrier", help: "異なる4区画へ航空攻撃。護衛艦の全区画が空母へ上下左右で隣接し、護衛リンクが成立している間は2回、それ以外は合計1回まで出撃できます。", requirement: "目標 4", pattern: "任意 / 4区画" },
  harpoon: { label: "HARPOON", compactLabel: "HARPOON", carrier: "battleship", help: "照準を中心にX字5区画を攻撃。通常2回、護衛艦の全区画が戦艦へ上下左右で隣接し、射撃管制リンクが成立している間は3回まで使用できます。", requirement: "中心 1", pattern: "X字 / 5区画" },
  sparrow: { label: "8-INCH STRADDLE", compactLabel: "8-INCH", carrier: "cruiser", help: "20.3cm主砲による夾叉斉射。照準区画とその前方3区画へ散布界を形成します。同じ照準または兵装を再タップ、またはRで90°回転します。", requirement: "基準 1", pattern: "方向指定 / 4区画" },
  mk45: { label: "MK-45 II", compactLabel: "MK-45", carrier: "destroyer", help: "異なる2区画を連続攻撃します。", requirement: "目標 2", pattern: "任意 / 2区画" },
  radar: { label: "PASSIVE SONAR", compactLabel: "SONAR", carrier: "submarine", help: "指定した2×2の4区画を受動聴音します。CONTACTは範囲内に未破壊艦区画の音響反応あり、NO CONTACTは反応なしを示します。", requirement: "左上 1", pattern: "2×2聴音 / 攻撃力なし" },
};

const ACTION_LABEL: Record<WeaponId, string> = {
  fire: "艦砲射撃",
  phantom: "攻撃隊発進",
  harpoon: "HARPOON 発射",
  sparrow: "20.3cm砲 夾叉斉射",
  mk45: "MK-45 II 連続射撃",
  radar: "聴音開始",
};
const WEAPON_ORDER: ReadonlyArray<WeaponId> = ["fire", "phantom", "harpoon", "sparrow", "mk45", "radar"];
const MISSION_WEAPON_LABEL: Record<WeaponId, string> = Object.fromEntries(
  Object.entries(WEAPON_META).map(([id, meta]) => [id, meta.label]),
) as Record<WeaponId, string>;

const MISSION_DIFFICULTY_NAME: Record<number, string> = {
  1: "入門",
  2: "基礎",
  3: "標準",
  4: "上級",
  5: "難関",
  6: "極限",
};
const missionDifficultyName = (value: number) => MISSION_DIFFICULTY_NAME[value] ?? "規格外";
const missionDifficultyLabel = (value: number) => `${"◆".repeat(value)}${"◇".repeat(Math.max(0, 6 - value))}`;
const missionSectionFor = (category: MissionStageDefinition["category"]): MissionLibrarySection =>
  category === "archive" ? "archive" : category === "extreme" ? "extreme" : category === "training" ? "training" : "tactical";
const missionFleetLabel = (fleet: ShipId[]) => fleet
  .map((id) => SHIPS.find((ship) => ship.id === id)?.code ?? id.toUpperCase())
  .join(" / ");

const SHIP_DOSSIER: Record<ShipId, { role: string; capability: string; loss: string }> = {
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

export function DeepBlueGrid() {
  const seedRef = useRef(0);
  const rngRef = useRef(new SeededRandom(seedRef.current));
  const player = useRef(new Board());
  const enemy = useRef(new Board());
  const arsenal = useRef(new Arsenal());
  const ai = useRef(new EnemyAI(new SeededRandom(seedRef.current ^ 0x51f15e), STAGES[0].fleet, aiSkillFor("casual", STAGES[0].id, STAGES[0].aiSkill), "casual"));
  const audio = useRef<AudioManager | null>(null);
  const playerCanvas = useRef<HTMLCanvasElement>(null);
  const enemyCanvas = useRef<HTMLCanvasElement>(null);
  const boardsRef = useRef<HTMLDivElement>(null);
  const animation = useRef(0);
  const difficultyRef = useRef<GameMode>("casual");
  const survivalFleetRef = useRef<ShipId[]>([...FULL_FLEET]);
  const touchPointers = useRef(new Set<number>());
  const placementGesture = useRef<PlacementGesture | null>(null);
  const touchRotated = useRef(false);
  const playerWakesRef = useRef<Coord[]>([]);
  const enemyWakesRef = useRef<Coord[]>([]);
  const enemyFleetRef = useRef<ShipId[]>([...STAGES[0].fleet]);
  const identificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weaponPeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diveAlertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerLossOrderRef = useRef<ShipId[]>([]);
  const stageAttemptRef = useRef(0);
  const operationRecorderRef = useRef<OperationRecorder | null>(null);
  const missionSonarReportsRef = useRef<Array<{ origin: Coord; contact: boolean }>>([]);
  const missionFriendlyActionsRef = useRef(0);
  const missionUsedWeaponsRef = useRef<WeaponId[]>([]);
  const missionEnemySunkOrderRef = useRef<ShipId[]>([]);
  const enemyIdentifiedRef = useRef<ShipId[]>([]);
  const missionClockRef = useRef<MissionClock>({ accumulatedMs: 0, activeSince: null });

  const [stageIndex, setStageIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<GameMode | null>(null);
  const [survivalFleet, setSurvivalFleet] = useState<ShipId[]>([...FULL_FLEET]);
  const [compactViewport, setCompactViewport] = useState(false);
  const [visibleBoard, setVisibleBoard] = useState<"player" | "enemy">("player");
  const activeMode = difficulty ?? "casual";
  const activeStages = stagesFor(activeMode);
  const stage = activeStages[stageIndex] ?? activeStages[0];
  const mission = missionFor(activeMode, stage);
  const missionRule = missionRuleFor(activeMode, stage);
  const controlStation = missionRule?.objective.kind === "sonar-reports" || missionRule?.objective.kind === "scan-and-destroy"
    ? { english: "SONAR CONTROL", japanese: "聴音指揮" }
    : { english: "FIRE CONTROL", japanese: "射撃指揮" };
  const weaponOrder = missionRule?.allowedWeapons ?? WEAPON_ORDER;
  const playerFleet = playerFleetFor(activeMode, stage, survivalFleet);
  const progressUnit = routeUnit(activeMode);
  const [enemyFleet, setEnemyFleet] = useState<ShipId[]>([...STAGES[0].fleet]);
  const [phase, setPhase] = useState<Phase>("placement");
  const [withdrawArmed, setWithdrawArmed] = useState(false);
  const [message, setMessage] = useState(stage.subtitle);
  const [selectedShip, setSelectedShip] = useState<ShipId>(stage.fleet[0]);
  const [orientation, setOrientation] = useState<Orientation>("east");
  const [placementBackup, setPlacementBackup] = useState<PlacementBackup | null>(null);
  const [cursor, setCursor] = useState<Coord>({ x: 1, y: 2 });
  const [weapon, setWeapon] = useState<WeaponId>("fire");
  const [attackOrientation, setAttackOrientation] = useState<Orientation>("north");
  const [picked, setPicked] = useState<Coord[]>([]);
  const [locked, setLocked] = useState(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState<Coord[]>([]);
  const [activeEffect, setActiveEffect] = useState<ActiveEffect>("none");
  const [flash, setFlash] = useState<"player" | "enemy" | null>(null);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState<Stats>(freshStats);
  const [logs, setLogs] = useState<LogEntry[]>(() => { const at = Date.now(); return [{ id: at, at, text: "作戦準備。艦隊配置を開始。", tone: "info", kind: "event" }]; });
  const [playerWakes, setPlayerWakes] = useState<Coord[]>([]);
  const [enemyWakes, setEnemyWakes] = useState<Coord[]>([]);
  const [enemyIdentified, setEnemyIdentified] = useState<ShipId[]>([]);
  const [enemyIdentificationCoords, setEnemyIdentificationCoords] = useState<Partial<Record<ShipId, Coord>>>({});
  const [enemyContactOrder, setEnemyContactOrder] = useState<ShipId[]>([...STAGES[0].fleet]);
  const [inspectedShip, setInspectedShip] = useState<ShipId>(STAGES[0].fleet[0]);
  const [weaponPeek, setWeaponPeek] = useState<WeaponId | null>(null);
  const [diveAlert, setDiveAlert] = useState(false);
  const [diveAlertCallsign, setDiveAlertCallsign] = useState("SEA BAT");
  const [identificationAlert, setIdentificationAlert] = useState<{ hostile: boolean; id: ShipId } | null>(null);
  const [radarAlert, setRadarAlert] = useState<{ contact: boolean; hostile: boolean } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [resultReview, setResultReview] = useState(false);
  const [operationStart, setOperationStart] = useState(Date.now());
  const [operationEnd, setOperationEnd] = useState<number | null>(null);
  const [operationRecord, setOperationRecord] = useState<OperationRecordSnapshot | null>(null);
  const [missionEndReport, setMissionEndReport] = useState("");
  const [missionLibraryOpen, setMissionLibraryOpen] = useState(false);
  const [missionLibrarySection, setMissionLibrarySection] = useState<MissionLibrarySection>("tactical");
  const [missionCompletionFilter, setMissionCompletionFilter] = useState<MissionCompletionFilter>("all");
  const [missionRecords, setMissionRecords] = useState<MissionRecordBook>(loadMissionRecords);
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress>(loadTrainingProgress);
  const [trainingHoldNotice, setTrainingHoldNotice] = useState("");
  const [missionRecordUpdate, setMissionRecordUpdate] = useState<MissionRecordUpdate | null>(null);
  const [missionElapsedMs, setMissionElapsedMs] = useState(0);
  const [missionSonarReportCount, setMissionSonarReportCount] = useState(0);

  const identificationRules = difficulty !== null && usesTacticsRules(difficulty);
  const isExtremeDefeat = missionRule?.category === "extreme" && phase === "defeat";
  const extremeIntelWithheld = isExtremeDefeat && resultReview;
  const placementPreviewActive = phase === "placement" && !player.current.ships.some((ship) => ship.id === selectedShip);
  const placementValid = placementPreviewActive && player.current.canPlace(selectedShip, cursor, orientation);

  const bump = () => setRevision((value) => value + 1);
  const addLog = (text: string, tone: LogEntry["tone"] = "info", at = Date.now(), kind: LogKind = "event") => {
    setLogs((current) => [...current, { id: at + Math.random(), at, text, tone, kind }]);
  };

  const resetMissionClock = (running: boolean) => {
    missionClockRef.current = { accumulatedMs: 0, activeSince: running ? activeNow() : null };
  };
  const pauseMissionClock = () => {
    const clock = missionClockRef.current;
    if (clock.activeSince === null) return;
    clock.accumulatedMs += Math.max(0, activeNow() - clock.activeSince);
    clock.activeSince = null;
  };
  const resumeMissionClock = () => {
    const clock = missionClockRef.current;
    if (clock.activeSince === null) clock.activeSince = activeNow();
  };
  const readMissionClock = () => {
    const clock = missionClockRef.current;
    return Math.max(0, Math.round(clock.accumulatedMs + (clock.activeSince === null ? 0 : activeNow() - clock.activeSince)));
  };

  const ownAlive = player.current.ships.filter((ship) => !ship.sunk).length;
  const enemyAlive = enemy.current.ships.filter((ship) => !ship.sunk).length;
  const fleetCells = playerFleet.reduce((total, id) => total + SHIPS.find((ship) => ship.id === id)!.size, 0);
  const initStage = useCallback((nextStageIndex: number, nextDifficulty?: GameMode, nextSurvivalFleet?: ShipId[], retry = false) => {
    const selectedDifficulty = nextDifficulty ?? difficultyRef.current;
    const nextStage = stagesFor(selectedDifficulty)[nextStageIndex];
    const nextRule = missionRuleFor(selectedDifficulty, nextStage);
    const nextPlayerFleet = playerFleetFor(selectedDifficulty, nextStage, nextSurvivalFleet ?? survivalFleetRef.current);
    const nextEnemyFleet = enemyFleetFor(selectedDifficulty, nextStage);
    const nextMission = missionFor(selectedDifficulty, nextStage);
    enemyFleetRef.current = nextEnemyFleet;
    difficultyRef.current = selectedDifficulty;
    seedRef.current = nextRule?.fixedSeed ?? Date.now() + nextStageIndex * 7919;
    rngRef.current = new SeededRandom(seedRef.current);
    player.current = new Board();
    enemy.current = new Board();
    if (nextRule) {
      deployScenarioFleet(player.current, nextRule.playerPlacements);
      deployScenarioFleet(enemy.current, nextRule.enemyPlacements);
      applyScenarioHits(player.current, nextRule.playerInitialHits);
      applyScenarioHits(enemy.current, nextRule.enemyInitialHits);
      for (const intel of nextRule.initialIntel ?? []) enemy.current.shots[intel.coord.y][intel.coord.x] = intel.mark;
    } else {
      player.current.randomize(rngRef.current, nextPlayerFleet);
    }
    arsenal.current = new Arsenal();
    if (nextRule) applyScenarioArsenal(arsenal.current, nextRule.initialArsenal);
    const aiProfile = isSilentStage(selectedDifficulty, nextStage) ? "silent" : usesTacticsRules(selectedDifficulty) ? "tactics" : "casual";
    const huntBreadth = huntBreadthFor(selectedDifficulty, nextStageIndex);
    ai.current = new EnemyAI(
      new SeededRandom(seedRef.current ^ 0x51f15e),
      nextPlayerFleet,
      aiSkillFor(selectedDifficulty, nextStage.id, nextStage.aiSkill),
      aiProfile,
      huntBreadth,
    );
    playerWakesRef.current = [];
    enemyWakesRef.current = (nextRule?.initialEnemyWakes ?? []).map((coord) => ({ ...coord }));
    missionSonarReportsRef.current = [];
    setMissionSonarReportCount(0);
    setTrainingHoldNotice("");
    missionFriendlyActionsRef.current = 0;
    missionUsedWeaponsRef.current = [];
    missionEnemySunkOrderRef.current = [];
    resetMissionClock(selectedDifficulty === "mission" || selectedDifficulty === "training");
    playerLossOrderRef.current = [];
    if (!retry) stageAttemptRef.current = 0;
    setPlayerWakes([]);
    setEnemyWakes(enemyWakesRef.current);
    enemyIdentifiedRef.current = [...(nextRule?.initiallyIdentified ?? [])];
    setEnemyIdentified(enemyIdentifiedRef.current);
    setEnemyIdentificationCoords(Object.fromEntries((nextRule?.initiallyIdentified ?? []).flatMap((id) => {
      const ship = enemy.current.ships.find((candidate) => candidate.id === id);
      return ship ? [[id, { ...ship.critical }]] : [];
    })));
    setEnemyFleet(nextEnemyFleet);
    setInspectedShip(nextPlayerFleet[0]);
    setDiveAlert(false);
    setDiveAlertCallsign("SEA BAT");
    setEnemyContactOrder(usesTacticsRules(selectedDifficulty)
      ? new SeededRandom(seedRef.current ^ 0x19c4a7).shuffle([...nextEnemyFleet])
      : [...nextEnemyFleet]);
    setIdentificationAlert(null);
    setRadarAlert(null);
    setLogOpen(false);
    setResultReview(false);
    setVisibleBoard("player");
    operationRecorderRef.current?.beginStage(nextStageIndex, activeNow());
    audio.current?.setLossTier(selectedDifficulty === "survival" ? FULL_FLEET.length - nextPlayerFleet.length : 0);
    const preparedAt = Date.now();
    setOperationStart(preparedAt);
    setOperationEnd(null);
    setMissionEndReport("");
    setMissionElapsedMs(0);
    setMissionRecordUpdate(null);
    setStageIndex(nextStageIndex);
    setPhase("placement");
    setMessage(nextRule
      ? nextRule.category === "training"
        ? `TRAINING DIRECTIVE：${nextRule.training?.plainBrief ?? nextRule.directive}`
        : nextRule.category === "archive"
        ? "作戦日誌と両軍戦術図を照合し、現況を判断してください。"
        : `SITUATION REVIEW：${nextRule.directive}`
      : nextMission.subtitle.replace(/。$/, "") + "。全艦を自動配置済みです。艦を選ぶと移動・回転できます。");
    setSelectedShip(nextPlayerFleet[0]);
    setOrientation("east");
    setPlacementBackup(null);
    setCursor({ x: 1, y: 2 });
    setWeapon(nextRule?.training?.steps[0]?.expected.weapon ?? nextRule?.allowedWeapons[0] ?? "fire");
    setAttackOrientation("north");
    setPicked([]);
    setLocked(false);
    setActive([]);
    setActiveEffect("none");
    setStats(freshStats());
    bump();
  }, []);

  useEffect(() => {
    initStage(0);
  }, [initStage]);

  useEffect(() => {
    const portraitQuery = window.matchMedia(COMPACT_LAYOUT_MEDIA);
    const updateLayout = () => setCompactViewport(portraitQuery.matches);
    updateLayout();
    portraitQuery.addEventListener("change", updateLayout);
    return () => portraitQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!compactViewport || !difficulty) return;
    setVisibleBoard(phase === "player" ? "enemy" : "player");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => boardsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
    });
  }, [phase, compactViewport, difficulty]);

  const startCampaign = (selectedDifficulty: GameMode, startingIndex = 0) => {
    const selectedStages = stagesFor(selectedDifficulty);
    const selectedStage = selectedStages[startingIndex] ?? selectedStages[0];
    const startingFleet = selectedDifficulty === "survival"
      ? [...FULL_FLEET]
      : playerFleetFor(selectedDifficulty, selectedStage, FULL_FLEET);
    difficultyRef.current = selectedDifficulty;
    survivalFleetRef.current = [...FULL_FLEET];
    setSurvivalFleet([...FULL_FLEET]);
    setDifficulty(selectedDifficulty);
    operationRecorderRef.current = selectedDifficulty === "survival"
      ? new OperationRecorder(selectedStages.map((item) => item.title), activeNow())
      : null;
    setOperationRecord(null);
    const startedAt = Date.now();
    const routeName = selectedDifficulty === "mission"
      ? `MISSION ${String(startingIndex + 1).padStart(2, "0")} / ${selectedStage.title}`
      : selectedDifficulty === "training"
        ? `TRAINING ${String(startingIndex + 1).padStart(2, "0")} / ${selectedStage.title}`
      : `${selectedDifficulty.toUpperCase()} / 作戦行動`;
    setLogs([{ id: startedAt, at: startedAt, text: `＝ ${routeName} 開始 ＝`, tone: "info", kind: "campaign" }]);
    if (selectedDifficulty === "mission" || selectedDifficulty === "training") {
      const selectedRule = missionRuleFor(selectedDifficulty, selectedStage);
      if (selectedRule) setMissionLibrarySection(missionSectionFor(selectedRule.category));
    }
    setMissionLibraryOpen(false);
    initStage(startingIndex, selectedDifficulty, startingFleet);
  };

  const openMissionLibrary = (section: MissionLibrarySection = "tactical") => {
    setMissionRecords(loadMissionRecords());
    setTrainingProgress(loadTrainingProgress());
    setMissionLibrarySection(section);
    setMissionCompletionFilter("all");
    setMissionLibraryOpen(true);
  };

  const selectMissionLibrarySection = (section: MissionLibrarySection) => {
    setMissionLibrarySection(section);
    setMissionCompletionFilter("all");
  };

  const returnToMissionLibrary = () => {
    pauseMissionClock();
    const returnMode: GameMode = difficultyRef.current === "training" ? "training" : "mission";
    difficultyRef.current = "casual";
    setDifficulty(null);
    setPhase("placement");
    setResultReview(false);
    setLogOpen(false);
    setMissionRecords(loadMissionRecords());
    setTrainingProgress(loadTrainingProgress());
    const currentRule = missionRuleFor(returnMode, stagesFor(returnMode)[stageIndex]);
    setMissionLibrarySection(currentRule ? missionSectionFor(currentRule.category) : returnMode === "training" ? "training" : "tactical");
    setMissionCompletionFilter("all");
    setMissionLibraryOpen(true);
  };

  const previewTargets = useMemo(() => {
    if (!picked.length) return [];
    if (weapon === "harpoon") return harpoonCells(picked[0]);
    if (weapon === "sparrow") return straddleCells(picked[0], attackOrientation);
    if (weapon === "radar") return radarCells(picked[0]);
    return picked;
  }, [picked, weapon, attackOrientation]);

  const showIdentificationAlert = (id: ShipId, hostile: boolean) => {
    if (identificationTimer.current) clearTimeout(identificationTimer.current);
    setIdentificationAlert({ id, hostile });
    identificationTimer.current = hostile ? null : setTimeout(() => setIdentificationAlert(null), 1650);
  };

  const showWeaponPeek = (id: WeaponId) => {
    if (weaponPeekTimer.current) clearTimeout(weaponPeekTimer.current);
    setWeaponPeek(id);
    weaponPeekTimer.current = setTimeout(() => setWeaponPeek(null), 2600);
  };


  const render = useCallback((time: number) => {
    animation.current = requestAnimationFrame(render);
    if (playerCanvas.current) {
      drawBoard(playerCanvas.current, player.current, {
        revealShips: true,
        cursor: placementPreviewActive ? cursor : undefined,
        previewShip: placementPreviewActive ? {
          id: selectedShip,
          orientation,
          valid: player.current.canPlace(selectedShip, cursor, orientation),
        } : undefined,
        active: phase === "enemy" ? active : [],
        waves: playerWakes,
        showCritical: identificationRules,
        time,
        escortZone: phase === "placement" && isEscort(selectedShip),
        scanActive: activeEffect === "scan",
      });
    }
    if (enemyCanvas.current) {
      drawBoard(enemyCanvas.current, enemy.current, {
        revealShips: phase === "defeat" && resultReview && !extremeIntelWithheld,
        cursor: phase === "player" && !locked ? cursor : undefined,
        weapon,
        attackOrientation,
        selected: previewTargets,
        active: phase === "player" ? active : [],
        waves: enemyWakes,
        scanActive: activeEffect === "scan",
        identifications: identificationRules
          ? enemyIdentified.flatMap((id) => {
              const ship = enemy.current.ships.find((candidate) => candidate.id === id);
              return ship ? [{ id, coord: enemyIdentificationCoords[id] ?? ship.critical }] : [];
            })
          : [],
        missionZones: missionRule?.objective.kind === "sonar-reports" || missionRule?.objective.kind === "scan-and-destroy"
          ? missionRule.objective.reports.map((report) => ({
              origin: report.origin,
              label: report.code.split(" /")[0],
              complete: missionSonarReportsRef.current.some((actual) => sameCoord(actual.origin, report.origin) && actual.contact === report.contact),
            }))
          : [],
        trainingHighlights: missionRule?.training?.steps[missionFriendlyActionsRef.current]?.highlight ?? [],
        time,
      });
    }
  }, [phase, cursor, selectedShip, orientation, weapon, attackOrientation, previewTargets, active, activeEffect, locked, placementPreviewActive, playerWakes, enemyWakes, enemyIdentified, enemyIdentificationCoords, identificationRules, resultReview, extremeIntelWithheld, revision, missionRule]);

  useEffect(() => {
    animation.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animation.current);
  }, [render]);

  useEffect(() => {
    if (!audio.current) audio.current = new AudioManager();
    return () => {
      if (identificationTimer.current) clearTimeout(identificationTimer.current);
      if (weaponPeekTimer.current) clearTimeout(weaponPeekTimer.current);
      if (diveAlertTimer.current) clearTimeout(diveAlertTimer.current);
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    const updateOperationClock = () => {
      const recorder = operationRecorderRef.current;
      if (document.visibilityState === "hidden") {
        recorder?.pause(activeNow());
        if (difficultyRef.current === "mission" || difficultyRef.current === "training") pauseMissionClock();
      } else {
        recorder?.resume(activeNow());
        if (difficultyRef.current === "mission" || difficultyRef.current === "training") resumeMissionClock();
      }
    };
    document.addEventListener("visibilitychange", updateOperationClock);
    window.addEventListener("pageshow", updateOperationClock);
    return () => {
      document.removeEventListener("visibilitychange", updateOperationClock);
      window.removeEventListener("pageshow", updateOperationClock);
    };
  }, []);

  const randomize = () => {
    if (missionRule) return;
    player.current.randomize(rngRef.current, playerFleet);
    setSelectedShip(playerFleet[0]);
    setPlacementBackup(null);
    setMessage("配置完了。艦隊カードと自軍戦術図を確認して交戦を開始してください。");
    addLog("自動配置を実行しました。");
    audio.current?.confirm();
    bump();
  };

  const clearPlacement = () => {
    if (missionRule) return;
    player.current.reset();
    setSelectedShip(playerFleet[0]);
    setOrientation("east");
    setPlacementBackup(null);
    setCursor({ x: 1, y: 2 });
    setMessage("配置を初期化しました。艦を選び直してください。");
    addLog("配置を初期化しました。");
    audio.current?.cancel();
    bump();
  };

  const emitEnemySubmarineWake = (actor?: ShipId) => {
    const wake = nextSubmarineWake(enemy.current, enemyWakesRef.current, rngRef.current, actor);
    if (!wake || enemyWakesRef.current.some((seen) => sameCoord(seen, wake))) return;
    enemyWakesRef.current = [...enemyWakesRef.current, wake];
    setEnemyWakes(enemyWakesRef.current);
    addLog("音紋反応。敵潜水艦周辺に音紋を探知。", "good");
  };

  const emitPlayerSubmarineWake = () => {
    const wake = nextSubmarineWake(player.current, playerWakesRef.current, rngRef.current);
    if (!wake || playerWakesRef.current.some((seen) => sameCoord(seen, wake))) return;
    playerWakesRef.current = [...playerWakesRef.current, wake];
    setPlayerWakes(playerWakesRef.current);
    ai.current.observeWake(wake);
    addLog("自軍潜水艦の音紋が発生。敵の音響捜索を警戒。", "bad");
  };

  const addStageSummary = (at = Date.now()) => {
    const enemySunk = enemy.current.ships.filter((ship) => ship.sunk).length;
    const ownLosses = player.current.ships.filter((ship) => ship.sunk);
    addLog(`戦果：敵${enemySunk}艦撃沈 / ${enemy.current.damageCount()}区画破壊。`, enemySunk ? "good" : "info", at);
    addLog(
      ownLosses.length
        ? `自軍損失：${ownLosses.map((ship) => ship.name).join(" / ")}。損傷${player.current.damageCount()} / ${fleetCells}区画。`
        : `自軍損失なし。損傷${player.current.damageCount()} / ${fleetCells}区画。`,
      ownLosses.length ? "bad" : "good",
      at,
    );
  };

  const evaluateActiveMission = (): MissionOutcome => {
    if (!missionRule) return null;
    return evaluateMission(missionRule, {
      friendlyActions: missionFriendlyActionsRef.current,
      usedWeapons: missionUsedWeaponsRef.current,
      enemySunk: enemy.current.ships.filter((ship) => ship.sunk).map((ship) => ship.id),
      enemySunkOrder: missionEnemySunkOrderRef.current,
      enemyIdentified: enemyIdentifiedRef.current,
      friendlyAlive: player.current.ships.filter((ship) => !ship.sunk).map((ship) => ship.id),
      sonarReports: missionSonarReportsRef.current,
    });
  };

  const completeMission = (outcome: Exclude<MissionOutcome, null>) => {
    const endedAt = wallClockNow();
    pauseMissionClock();
    const elapsedMs = readMissionClock();
    setMissionEndReport(outcome.report);
    addLog(outcome.report, outcome.result === "victory" ? "good" : "bad", endedAt);
    addStageSummary(endedAt);
    addLog(
      `＝ ${difficultyRef.current === "training" ? "TRAINING" : "MISSION"} ${stageIndex + 1} / ${outcome.result === "victory" ? difficultyRef.current === "training" ? "教程修了" : "任務達成" : difficultyRef.current === "training" ? "訓練未修了" : "任務条件未達"} ＝`,
      outcome.result === "victory" ? "good" : "bad",
      endedAt,
      "stage-end",
    );
    if (outcome.result === "victory" && missionRule?.training) {
      const update = updateStoredTrainingProgress(missionRule.training.lesson);
      setTrainingProgress(update.progress);
      setMissionRecordUpdate(null);
    } else if (outcome.result === "victory" && missionRule) {
      const update = updateStoredMissionResult({
        missionId: missionRule.id,
        result: "victory",
        commands: missionFriendlyActionsRef.current,
        activeMs: elapsedMs,
      });
      setMissionRecords(update.records);
      setMissionRecordUpdate(update);
    }
    setMessage(outcome.report);
    setOperationEnd(endedAt);
    setMissionElapsedMs(elapsedMs);
    setPhase(outcome.result);
    setLocked(false);
    if (outcome.result === "victory") audio.current?.victory();
    else audio.current?.defeat();
  };

  const startBattle = () => {
    if (!player.current.allPlaced(playerFleet)) {
      setMessage(`この${routeUnit(difficultyRef.current).japanese}へ出撃する全艦を配置してください。`);
      return;
    }
    if (missionRule?.requiredLink === "carrier" && !hasEscortLink(player.current)) {
      setMessage("ASSIGNED FORMATION ERROR：空母と護衛艦の護衛リンクを確認できません。");
      return;
    }
    if (missionRule?.requiredLink === "battleship" && !hasFireControlLink(player.current)) {
      setMessage("ASSIGNED FORMATION ERROR：戦艦と護衛艦の射撃管制リンクを確認できません。");
      return;
    }
    if (missionRule?.requiredLinks?.includes("carrier") && !hasEscortLink(player.current)) {
      setMessage("ASSIGNED FORMATION ERROR：空母側の護衛リンクを確認できません。");
      return;
    }
    if (missionRule?.requiredLinks?.includes("battleship") && !hasFireControlLink(player.current)) {
      setMessage("ASSIGNED FORMATION ERROR：戦艦側の射撃管制リンクを確認できません。");
      return;
    }
    if (!missionRule) enemy.current.randomize(rngRef.current, enemyFleetRef.current);
    const startedAt = Date.now();
    setOperationStart(startedAt);
    setOperationEnd(null);
    stageAttemptRef.current += 1;
    if (difficultyRef.current === "survival") operationRecorderRef.current?.noteEngagement(stageIndex);
    const ownInitiative = friendlyStarts(difficultyRef.current, stage);
    addLog(
      ownInitiative ? `総員戦闘配置。自艦隊、${controlStation.japanese}開始。` : "総員戦闘配置。敵艦隊、先制行動。",
      ownInitiative ? "info" : "bad",
      startedAt,
    );
    addLog(
      `＝ ${routeUnit(difficultyRef.current).english} ${stageIndex + 1} / ${stageAttemptRef.current > 1 ? `第${stageAttemptRef.current}次交戦開始` : "交戦開始"} ＝`,
      "info",
      startedAt,
      "stage-start",
    );
    if (missionRule) {
      addLog(`${missionRule.training ? "TRAINING BRIEF" : "SITUATION"}：${missionRule.training?.plainBrief ?? missionRule.subtitle}`, "info", startedAt);
      addLog(`${missionRule.training ? "DIRECTIVE" : "OBJECTIVE"}：${missionRule.directive}`, "info", startedAt);
      if (missionRule.playerInitialHits?.length) addLog(`開始時損傷：${missionRule.playerInitialHits.length}区画。`, "bad", startedAt);
      if (missionRule.initialIntel?.length || missionRule.initialEnemyWakes?.length) addLog("INTELLIGENCE：既知の着弾・音紋資料を戦術図へ反映。", "info", startedAt);
    }
    const airSupport = hasEscortLink(player.current);
    const fireControl = hasFireControlLink(player.current);
    if (airSupport && fireControl) {
      addLog("DUAL SUPPORT LINK：ACTIVE。F-4出撃＋1 / HARPOON発射＋1。", "good", startedAt);
    } else {
      if (airSupport) addLog("ESCORT SUPPORT：ACTIVE。F-4出撃＋1。", "good", startedAt);
      if (fireControl) addLog("FIRE CONTROL LINK：ACTIVE。HARPOON発射＋1。", "good", startedAt);
    }
    if (!ownInitiative) {
      setLocked(true);
      audio.current?.confirm();
      bump();
      void enemyTurn();
      return;
    }
    setPhase("player");
    setMessage(missionRule
      ? missionRule.training
        ? `TRAINING DIRECTIVE 1：${missionRule.training.steps[0].instruction}`
        : `${controlStation.english}：${missionRule.directive}`
      : "FIRE CONTROL：兵装を選択し、敵情図へ目標を指示してください。");
    setFlash("player");
    setTimeout(() => setFlash(null), 1050);
    audio.current?.confirm();
    audio.current?.turn();
    bump();
  };

  const completeEnemyFleetDefeat = () => {
    const endedAt = Date.now();
    const finalStage = stageIndex === activeStages.length - 1;
    if (difficultyRef.current === "survival") {
      const losses = player.current.ships.filter((ship) => ship.sunk).map((ship) => ship.id);
      operationRecorderRef.current?.completeStage(stageIndex, losses, activeNow());
      if (finalStage) {
        operationRecorderRef.current?.finish(activeNow());
        setOperationRecord(operationRecorderRef.current?.snapshot(activeNow()) ?? null);
      }
    }
    addLog("敵艦隊の戦闘能力喪失を確認。", "good", endedAt);
    addLog(finalStage ? "全作戦目標達成。対象海域の敵性脅威を排除。" : "作戦目標達成。対象海域の敵性脅威を排除。", "good", endedAt);
    addLog("戦闘配置を解除。", "good", endedAt);
    addStageSummary(endedAt);
    addLog(`＝ ${routeUnit(difficultyRef.current).english} ${stageIndex + 1} / 作戦目標達成 ＝`, "good", endedAt, "stage-end");
    if (finalStage) {
      addLog(
        difficultyRef.current === "survival"
          ? "＝ SURVIVAL / 全作戦終了 ＝"
          : `＝ ${difficultyRef.current.toUpperCase()} / 全海域終了 ＝`,
        "good",
        endedAt,
        "campaign",
      );
    }
    setOperationEnd(endedAt);
    setPhase("victory");
    audio.current?.victory();
    setLocked(false);
  };

  const enemyTurn = async () => {
    setPhase("enemy");
    setFlash("enemy");
    setMessage("敵照準システム作動中…");
    audio.current?.turn(true);
    await sleep(1050);
    setFlash(null);
    const decision = ai.current.decide(enemy.current);
    const silentActor = decision.actor ?? "silentSubmarine";
    const silentCallsign = missionRule?.enemyDisclosure.callsigns?.[silentActor]
      ?? (silentActor === "silentSubmarine" ? "SEA BAT" : SHIPS.find((ship) => ship.id === silentActor)?.code ?? "SSX");
    setMessage(decision.weapon === "silentMove"
      ? "SILENT RUNNING：敵特殊潜航艦、発砲せず無音潜航へ移行。"
      : "HOSTILE TARGETING：" + WEAPON_META[decision.weapon].label + " LOCK");
    setActive(decision.weapon === "radar" ? radarCells(decision.targets[0]) : decision.targets);
    setActiveEffect(decision.weapon === "radar" ? "scan" : decision.weapon === "silentMove" ? "none" : "target");
    if (decision.weapon === "radar") audio.current?.sonar();
    await sleep(decision.weapon === "radar" ? 800 : 750);

    if (decision.weapon === "silentMove") {
      const relocated = enemy.current.relocateShip(silentActor, rngRef.current, {
        blocked: enemyWakesRef.current,
        leaveLastKnown: true,
        relaxSignalBlocksWhenTrapped: true,
        resolveContainmentWhenTrapped: true,
      });
      const contained = enemy.current.allSunk();
      const report = contained
        ? `CONTAINMENT COMPLETE：全未攻撃区画を封鎖。${silentCallsign}、潜航余地を喪失。`
        : relocated
          ? `SONAR CONTACT LOST：${silentCallsign}、発砲せず静粛移動。最終接触位置から反応消失。`
          : `SILENT RUNNING：${silentCallsign}、発砲せず静止。追跡圏を維持。`;
      setMessage(report);
      addLog(report, contained ? "good" : relocated ? "bad" : "info");
      if (contained) setStats((current) => ({ ...current, sunk: current.sunk + 1 }));
      setDiveAlert(!contained);
      setDiveAlertCallsign(silentCallsign);
      if (diveAlertTimer.current) clearTimeout(diveAlertTimer.current);
      if (!contained) diveAlertTimer.current = setTimeout(() => setDiveAlert(false), 1900);
      bump();
    } else if (decision.weapon === "radar") {
      const contact = player.current.radar(decision.targets[0]);
      ai.current.observeRadar(decision.targets[0], contact);
      const report = contact ? "敵PASSIVE SONAR：指定4区画内に自軍艦の音響反応。" : "敵PASSIVE SONAR：指定4区画内に反応なし。";
      setMessage(report);
      addLog(report, contact ? "bad" : "info");
      setRadarAlert({ contact, hostile: true });
      bump();
      await sleep(1450);
      setRadarAlert(null);
    } else {
      audio.current?.fire();
      const results: AttackResult[] = [];
      for (const target of decision.targets) {
        const result = player.current.attack(target);
        if (result.kind !== "ALREADY") results.push(result);
        setActive([target]);
        setActiveEffect(result.kind === "HIT" || result.kind === "SUNK" ? "impact" : "target");
        await sleep(260);
        if (result.kind === "HIT" || result.kind === "SUNK") audio.current?.hit();
        else audio.current?.splash();
        if (result.kind === "SUNK") audio.current?.sunk();
        bump();
      }
      ai.current.observe(results);
      for (const result of results) if (result.kind === "SUNK" && result.shipId && !playerLossOrderRef.current.includes(result.shipId)) {
        playerLossOrderRef.current.push(result.shipId);
      }
      const hits = results.filter((result) => result.kind === "HIT" || result.kind === "SUNK").length;
      const sunk = results.find((result) => result.kind === "SUNK");
      const identifications = identificationRules ? results.filter((result) => result.criticalHit && result.shipId) : [];
      const identified = identifications[identifications.length - 1];
      setStats((current) => ({ ...current, damage: current.damage + hits }));
      if (difficultyRef.current === "survival") operationRecorderRef.current?.noteDamage(stageIndex, hits);
      const report = sunk
        ? "自軍" + sunk.shipName + "、撃沈。"
        : identified
          ? "自軍重要区画に被弾。敵に" + identified.shipName + "と識別された。"
        : hits
          ? "自軍艦艇、" + hits + "区画に被弾。敵は追撃態勢。"
          : results.some((result) => result.kind === "ECHO")
            ? "敵弾近接。音響反応を検知。"
            : "敵弾着弾。自軍損害なし。";
      setMessage(report);
      if (hits) {
        for (const result of results) {
          if (result.kind !== "HIT" && result.kind !== "SUNK") continue;
          const struckShip = player.current.shipAt(result.coord);
          if (!struckShip) continue;
          const definition = SHIPS.find((ship) => ship.id === struckShip.id)!;
          const critical = result.criticalHit ? "重要区画損傷。敵に艦種を識別された。" : "";
          const lostCapability = isEscort(struckShip.id) && !playerFleet.includes("carrier")
            ? "護衛能力喪失。"
            : LOST_CAPABILITY[struckShip.id];
          const loss = result.kind === "SUNK" ? `撃沈。${lostCapability}` : "";
          addLog(`敵${WEAPON_META[decision.weapon].label}による攻撃。${struckShip.name} / ${definition.code} ${coordName(result.coord)} 被弾。${critical}${loss}`, "bad");
        }
      } else {
        addLog(report, "info");
      }
      if (identified?.shipId) showIdentificationAlert(identified.shipId, true);
      if (sunk) {
        const living = player.current.ships.filter((ship) => !ship.sunk).length;
        audio.current?.setLossTier(difficultyRef.current === "survival" ? FULL_FLEET.length - living : 0);
      }
    }

    if (decision.weapon !== "silentMove") emitEnemySubmarineWake(decision.actor);
    setActive([]);
    setActiveEffect("none");
    bump();
    await sleep(850);
    if (missionRule) {
      const outcome = evaluateActiveMission();
      if (outcome) {
        completeMission(outcome);
        return;
      }
      if (player.current.allSunk()) {
        completeMission({ result: "defeat", report: "FRIENDLY FORCE LOST：任務部隊の戦闘能力喪失。任務継続不能。" });
        return;
      }
    }
    if (!missionRule && enemy.current.allSunk()) {
      completeEnemyFleetDefeat();
      return;
    }
    if (player.current.allSunk()) {
      const endedAt = Date.now();
      addLog("自軍艦隊、戦闘能力喪失。", "bad", endedAt);
      addLog("作戦続行不能。交戦終了、作戦中止。", "bad", endedAt);
      addStageSummary(endedAt);
      addLog(`＝ ${routeUnit(difficultyRef.current).english} ${stageIndex + 1} / 交戦終了・作戦中止 ＝`, "bad", endedAt, "stage-end");
      setOperationEnd(endedAt);
      setPhase("defeat");
      audio.current?.defeat();
      setLocked(false);
      return;
    }
    setPhase("review");
    setMessage("DAMAGE REPORT：敵攻撃終了。着弾・損傷情報をCIC戦闘記録へ反映してください。");
  };

  const continueToPlayer = () => {
    addLog(`損害報告をCIC戦闘記録へ記載。${controlStation.japanese}へ復帰。`, "info");
    setWeapon(missionRule?.allowedWeapons.includes("fire") ? "fire" : missionRule?.allowedWeapons[0] ?? "fire");
    setPicked([]);
    setIdentificationAlert(null);
    setPhase("player");
    setFlash("player");
    setMessage(missionRule ? `${controlStation.english}：${missionRule.directive}` : "FIRE CONTROL：兵装と目標を選択してください。");
    audio.current?.turn();
    setTimeout(() => setFlash(null), 1050);
    setLocked(false);
  };

  const showBoard = (board: "player" | "enemy") => {
    setVisibleBoard(board);
    if (compactViewport) {
      requestAnimationFrame(() => boardsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
    }
  };

  const continueTrainingInstruction = () => {
    const next = missionRule?.training?.steps[missionFriendlyActionsRef.current];
    if (!next) return false;
    setWeapon(next.expected.weapon);
    setAttackOrientation(next.expected.weapon === "sparrow" ? next.expected.orientation : "north");
    setPicked([]);
    setTrainingHoldNotice("");
    setPhase("player");
    setLocked(false);
    setMessage(`TRAINING DIRECTIVE ${missionFriendlyActionsRef.current + 1}：${next.instruction}`);
    return true;
  };

  const resolvePlayerAttack = async (targets: Coord[], special = false) => {
    setLocked(true);
    setActive(targets);
    setActiveEffect("target");
    audio.current?.fire();
    await sleep(400);
    const results: AttackResult[] = [];
    for (const target of targets) {
      const result = enemy.current.attack(target);
      if (result.kind === "ALREADY") continue;
      results.push(result);
      setActive([target]);
      setActiveEffect(result.kind === "HIT" || result.kind === "SUNK" ? "impact" : "target");
      await sleep(220);
      if (result.kind === "HIT" || result.kind === "SUNK") audio.current?.hit();
      else audio.current?.splash();
      if (result.kind === "SUNK") audio.current?.sunk();
      bump();
    }
    const hits = results.filter((result) => result.kind === "HIT" || result.kind === "SUNK").length;
    const sunk = results.filter((result) => result.kind === "SUNK").length;
    if (missionRule) {
      missionFriendlyActionsRef.current += 1;
      missionUsedWeaponsRef.current.push(weapon);
      for (const result of results) {
        if (result.kind === "SUNK" && result.shipId && !missionEnemySunkOrderRef.current.includes(result.shipId)) {
          missionEnemySunkOrderRef.current.push(result.shipId);
        }
      }
    }
    setStats((current) => ({
      ...current,
      turns: current.turns + 1,
      shots: current.shots + results.length,
      hits: current.hits + hits,
      sunk: current.sunk + sunk,
      specials: current.specials + (special ? 1 : 0),
    }));
    if (difficultyRef.current === "survival") operationRecorderRef.current?.noteAction(stageIndex, results.length, hits, special);
    const lastSunk = [...results].reverse().find((result) => result.kind === "SUNK");
    const identifications = identificationRules
      ? results.filter((result) => result.criticalHit && result.shipId)
      : [];
    if (identifications.length) {
      const ids = identifications.map((result) => result.shipId!);
      enemyIdentifiedRef.current = [...new Set([...enemyIdentifiedRef.current, ...ids])];
      setEnemyIdentified(enemyIdentifiedRef.current);
      setEnemyIdentificationCoords((current) => {
        const next = { ...current };
        for (const identified of identifications) {
          if (identified.shipId && !next[identified.shipId]) next[identified.shipId] = { ...identified.coord };
        }
        return next;
      });

      for (const identified of identifications) {
        const definition = SHIPS.find((ship) => ship.id === identified.shipId)!;
        addLog("敵重要区画に命中。" + definition.name + " / " + definition.code + "と識別。", "good");
      }
      showIdentificationAlert(identifications[identifications.length - 1].shipId!, false);
    }
    const lastIdentified = identifications[identifications.length - 1];
    const report = lastSunk
      ? "敵" + lastSunk.shipName + "、撃沈を確認。"
      : lastIdentified
        ? "敵重要区画に命中。" + lastIdentified.shipName + " / " + SHIPS.find((ship) => ship.id === lastIdentified.shipId)!.code + "と識別。"
      : hits
        ? "敵艦への命中を確認。" + hits + " / " + results.length + "区画。"
        : results.some((result) => result.kind === "ECHO")
          ? "SONAR ECHO。近傍に生存艦反応。"
          : "着弾。敵艦反応なし。";
    setMessage(report);
    addLog(WEAPON_META[weapon].label + "： " + report, hits ? "good" : "info");
    emitPlayerSubmarineWake();
    setActive([]);
    setActiveEffect("none");
    setPicked([]);
    bump();
    await sleep(850);
    if (missionRule) {
      const outcome = evaluateActiveMission();
      if (outcome) {
        completeMission(outcome);
        return;
      }
    }
    if (!missionRule && enemy.current.allSunk()) {
      completeEnemyFleetDefeat();
      return;
    }
    if (missionRule?.training?.suppressEnemyActions && continueTrainingInstruction()) return;
    await enemyTurn();
  };

  const weaponState = (id: WeaponId) => {
    if (missionRule && !missionRule.allowedWeapons.includes(id)) {
      return { available: false, status: "任務外", reason: "この限定任務の交戦規定では使用できません。" };
    }
    if (id === "fire") return { available: true, status: "∞", reason: "" };
    const meta = WEAPON_META[id];
    if (!meta.carrier || !playerFleet.includes(meta.carrier)) return { available: false, status: difficulty === "survival" ? "永久喪失" : "未配備", reason: difficulty === "survival" ? "搭載艦を以前の作戦で喪失したため使用不能です。" : "搭載艦は後の海域で配備されます。" };
    if (!player.current.alive(meta.carrier)) return { available: false, status: "搭載艦喪失", reason: "搭載艦が撃沈されたため使用不能です。" };
    const uses = arsenal.current.availableUses(id, player.current);
    const max = arsenal.current.maxUses(id, player.current);
    const formationSupport = playerFleet.some(isEscort);
    const linkActive = id === "phantom" ? hasEscortLink(player.current) : id === "harpoon" ? hasFireControlLink(player.current) : false;
    const linkStatus = formationSupport && (id === "phantom" || id === "harpoon") ? linkActive ? " / LINK ACTIVE" : " / LINK INACTIVE" : "";
    const linkReason = formationSupport && id === "phantom" && !linkActive
      ? "護衛リンク不成立のため、F-4追加出撃は無効です。護衛艦の全区画を空母へ上下左右で隣接させてください。"
      : formationSupport && id === "harpoon" && !linkActive
        ? "射撃管制リンク不成立のため、HARPOON追加発射は無効です。護衛艦の全区画を戦艦へ上下左右で隣接させてください。"
        : "";
    return { available: uses > 0, status: "残り " + uses + "/" + max + linkStatus, reason: uses > 0 ? linkReason : difficulty === "survival" ? "この作戦での使用回数を使い切りました。" : difficulty === "mission" ? "この任務での使用回数を使い切りました。" : difficulty === "training" ? "この教程での使用回数を使い切りました。" : "この海域での使用回数を使い切りました。" };
  };

  const targetRequirement = weapon === "phantom" ? 4 : weapon === "mk45" ? 2 : 1;
  const confirmTargets = previewTargets.filter((coord) => enemy.current.shots[coord.y]?.[coord.x] === "unknown");
  const ready = picked.length === targetRequirement
    && (weapon === "radar" || weapon === "sparrow" ? previewTargets.length === 4 : true)
    && (weapon === "radar" ? true : confirmTargets.length > 0);

  const rotateStraddleAim = () => {
    if (phase !== "player" || locked || weapon !== "sparrow") return;
    const currentIndex = STRADDLE_ORIENTATIONS.indexOf(attackOrientation);
    const next = STRADDLE_ORIENTATIONS[(currentIndex + 1) % STRADDLE_ORIENTATIONS.length];
    setAttackOrientation(next);
    const aimState = !picked.length
      ? "敵情図で照準区画を選択してください。"
      : straddleCells(picked[0], next).length === 4
        ? "照準区画と前方3区画へ夾叉斉射。"
        : "散布界が盤外にかかっています。もう一度90°回転するか、照準を変更してください。";
    setMessage(`8-INCH STRADDLE：方位 ${STRADDLE_DIRECTION[next]}。${aimState}`);
    audio.current?.cursor();
  };

  const chooseTarget = (coord: Coord) => {
    if (phase !== "player" || locked) return;
    setTrainingHoldNotice("");
    if (weapon === "radar" && !isMissionSonarOrigin(missionRule, coord)) {
      setPicked([]);
      setMessage("LISTENING SECTOR：ALPHAまたはBRAVOの破線枠を選択してください。");
      audio.current?.cancel();
      return;
    }
    if (weapon === "radar" && (coord.x >= 7 || coord.y >= 7)) {
      setPicked([]);
      setMessage("PASSIVE SONARは2×2を受動聴音します。右端・下端以外を左上として選んでください。");
      audio.current?.cancel();
      return;
    }
    if (weapon === "fire" && enemy.current.shots[coord.y][coord.x] !== "unknown") {
      setMessage("その座標は攻撃済みです。未攻撃区画を選んでください。");
      audio.current?.cancel();
      return;
    }
    if (weapon === "sparrow") {
      if (picked.length && sameCoord(picked[0], coord)) {
        rotateStraddleAim();
        return;
      }
      setPicked([coord]);
      const complete = straddleCells(coord, attackOrientation).length === 4;
      setMessage(complete
        ? `8-INCH STRADDLE：照準 ${coordName(coord)} / 方位 ${STRADDLE_DIRECTION[attackOrientation]}。照準または兵装の再タップ、またはRで90°回転。`
        : `8-INCH STRADDLE：照準 ${coordName(coord)} / 方位 ${STRADDLE_DIRECTION[attackOrientation]}。散布界が盤外にかかるため発射不可。90°回転または照準変更。`);
    } else if (weapon === "mk45" || weapon === "phantom") {
      if (enemy.current.shots[coord.y][coord.x] !== "unknown") {
        setMessage("攻撃済みの座標は選択できません。");
        return;
      }
      const exists = picked.some((candidate) => sameCoord(candidate, coord));
      const next = exists
        ? picked.filter((candidate) => !sameCoord(candidate, coord))
        : picked.length < targetRequirement
          ? [...picked, coord]
          : [...picked.slice(1), coord];
      setPicked(next);
      setMessage(WEAPON_META[weapon].label + "：目標 " + next.length + " / " + targetRequirement + "。");
    } else {
      setPicked([coord]);
      setMessage(WEAPON_META[weapon].label + "：照準 " + coordName(coord) + "。内容を確認して発射してください。");
    }
    audio.current?.cursor();
  };

  const selectedMissionOrder = (): MissionOrder | null => {
    const first = picked[0];
    if (!first) return null;
    if (weapon === "fire") return { weapon, target: { ...first } };
    if (weapon === "radar") return { weapon, origin: { ...first } };
    if (weapon === "harpoon") return { weapon, center: { ...first } };
    if (weapon === "sparrow") return { weapon, anchor: { ...first }, orientation: attackOrientation };
    return { weapon, targets: picked.map((target) => ({ ...target })) };
  };

  const confirmAction = async () => {
    if (!ready || locked) return;
    const trainingStep = missionRule?.training?.steps[missionFriendlyActionsRef.current];
    const selectedOrder = selectedMissionOrder();
    if (trainingStep && (!selectedOrder || !matchesTrainingStep(trainingStep, selectedOrder))) {
      const notice = `指令条件と一致しません。行動・弾薬は消費していません。${trainingStep.instruction}`;
      setTrainingHoldNotice(notice);
      setMessage(`TRAINING HOLD：${notice}`);
      audio.current?.cancel();
      return;
    }
    const state = weaponState(weapon);
    if (!state.available) {
      setMessage(state.reason || "この兵装は現在使用できません。");
      audio.current?.cancel();
      return;
    }
    if (weapon === "radar") {
      if (!arsenal.current.spend("radar", player.current)) return;
      setLocked(true);
      const cells = radarCells(picked[0]);
      setActive(cells);
      setActiveEffect("scan");
      audio.current?.sonar();
      await sleep(800);
      const contact = enemy.current.radar(picked[0]);
      if (missionRule) {
        missionFriendlyActionsRef.current += 1;
        missionUsedWeaponsRef.current.push("radar");
        missionSonarReportsRef.current.push({ origin: { ...picked[0] }, contact });
        setMissionSonarReportCount(missionSonarReportsRef.current.length);
      }
      setStats((current) => ({ ...current, turns: current.turns + 1, specials: current.specials + 1 }));
      if (difficultyRef.current === "survival") operationRecorderRef.current?.noteAction(stageIndex, 0, 0, true);
      const report = contact ? "CONTACT：指定4区画に有効音響反応。" : "NO CONTACT：有効音響反応なし。";
      setMessage(report);
      addLog("PASSIVE SONAR： " + report, contact ? "good" : "info");
      setRadarAlert({ contact, hostile: false });
      setPicked([]);
      bump();
      await sleep(1450);
      setRadarAlert(null);
      setActive([]);
      setActiveEffect("none");
      emitPlayerSubmarineWake();
      if (missionRule) {
        const outcome = evaluateActiveMission();
        if (outcome) {
          completeMission(outcome);
          return;
        }
      }
      if (missionRule?.training?.suppressEnemyActions && continueTrainingInstruction()) return;
      await enemyTurn();
      return;
    }
    if (weapon !== "fire") {
      if (!arsenal.current.spend(weapon, player.current)) {
        setMessage("兵装を使用できません。搭載艦の状態と残数を確認してください。");
        return;
      }
    }
    await resolvePlayerAttack(confirmTargets, weapon !== "fire");
  };

  const selectWeapon = (nextWeapon: WeaponId) => {
    if (phase !== "player" || locked) return;
    const state = weaponState(nextWeapon);
    if (!state.available) {
      setMessage(WEAPON_META[nextWeapon].label + "： " + state.reason);
      audio.current?.cancel();
      return;
    }
    if (nextWeapon === "sparrow" && weapon === "sparrow") {
      rotateStraddleAim();
      return;
    }
    setPicked([]);
    setWeapon(nextWeapon);
    setTrainingHoldNotice("");
    if (nextWeapon === "sparrow") setAttackOrientation("north");
    setMessage(WEAPON_META[nextWeapon].label + "： " + WEAPON_META[nextWeapon].help);
    audio.current?.cursor();
  };

  const cancelAim = () => {
    setPicked([]);
    setTrainingHoldNotice("");
    setMessage("照準を解除しました。兵装または目標を選び直してください。");
    audio.current?.cancel();
  };

  const clampPlacementOrigin = (shipId: ShipId, shipOrientation: Orientation, coord: Coord) => {
    const definition = SHIPS.find((ship) => ship.id === shipId)!;
    const width = isHorizontal(shipOrientation) ? definition.width : definition.height;
    const height = isHorizontal(shipOrientation) ? definition.height : definition.width;
    return { x: Math.max(0, Math.min(8 - width, coord.x)), y: Math.max(0, Math.min(8 - height, coord.y)) };
  };

  const findPlacementStart = (shipId: ShipId, shipOrientation: Orientation, near: Coord = cursor) => {
    const starts: Coord[] = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const coord = { x, y };
      if (player.current.canPlace(shipId, coord, shipOrientation)) starts.push(coord);
    }
    starts.sort((a, b) => Math.abs(a.x - near.x) + Math.abs(a.y - near.y) - Math.abs(b.x - near.x) - Math.abs(b.y - near.y));
    return starts[0] ?? clampPlacementOrigin(shipId, shipOrientation, near);
  };

  const placeAt = (coord: Coord) => {
    if (!placementPreviewActive) return;
    if (player.current.canPlace(selectedShip, coord, orientation)) {
      player.current.placeShip(selectedShip, coord, orientation);
      setPlacementBackup(null);
      audio.current?.confirm();
      const next = playerFleet.find((id) => !player.current.ships.some((placed) => placed.id === id));
      const placedName = SHIPS.find((ship) => ship.id === selectedShip)!.name;
      if (next) {
        const nextOrientation: Orientation = "east";
        setSelectedShip(next);
        setOrientation(nextOrientation);
        setCursor(findPlacementStart(next, nextOrientation, coord));
        setMessage(placedName + " 配置完了。次の艦を配置してください。");
      } else {
        setMessage("全艦配置完了。交戦開始命令を待機しています。");
      }
      bump();
    } else {
      setMessage("配置不可：自軍戦術図外、他艦との重複、または配置済みです。");
      audio.current?.cancel();
    }
  };

  const rotatePlacement = () => {
    if (missionRule) return;
    if (!placementPreviewActive) return;
    const nextOrientation = ORIENTATIONS[(ORIENTATIONS.indexOf(orientation) + 1) % ORIENTATIONS.length];
    const nextCursor = player.current.canPlace(selectedShip, cursor, nextOrientation)
      ? cursor
      : findPlacementStart(selectedShip, nextOrientation, cursor);
    setOrientation(nextOrientation);
    setCursor(nextCursor);
    setMessage("艦の向きを回転しました。");
    audio.current?.cursor();
  };

  const restorePlacement = () => {
    if (!placementBackup) return;
    if (player.current.placeShip(placementBackup.id, placementBackup.start, placementBackup.orientation)) {
      const name = SHIPS.find((ship) => ship.id === placementBackup.id)!.name;
      setSelectedShip(placementBackup.id);
      setOrientation(placementBackup.orientation);
      setCursor(placementBackup.start);
      setPlacementBackup(null);
      setMessage(name + "を元の位置へ戻しました。");
      audio.current?.cancel();
      bump();
    }
  };

  const selectPlacementShip = (shipId: ShipId) => {
    if (phase !== "placement" || missionRule) return;
    setInspectedShip(shipId);
    if (placementBackup && placementBackup.id !== shipId) {
      player.current.placeShip(placementBackup.id, placementBackup.start, placementBackup.orientation);
      setPlacementBackup(null);
    }
    const placed = player.current.ships.find((ship) => ship.id === shipId);
    if (placed) {
      const start = placed.cells.reduce((best, coord) => ({ x: Math.min(best.x, coord.x), y: Math.min(best.y, coord.y) }), { x: 7, y: 7 });
      player.current.removeShip(shipId);
      setPlacementBackup({ id: shipId, start, orientation: placed.orientation });
      setSelectedShip(shipId);
      setOrientation(placed.orientation);
      setCursor(start);
      setMessage(placed.name + "を再配置します。ドラッグで移動し、配置パネルで決定してください。");
      audio.current?.cursor();
      bump();
      return;
    }
    if (selectedShip === shipId) {
      rotatePlacement();
      return;
    }
    const nextOrientation: Orientation = "east";
    setSelectedShip(shipId);
    setOrientation(nextOrientation);
    setCursor(findPlacementStart(shipId, nextOrientation));
    setMessage("シルエットをドラッグで移動。配置パネルで回転または決定してください。");
    audio.current?.cursor();
  };

  const onBoardPointer = (side: "player" | "enemy", event: React.PointerEvent<HTMLCanvasElement>) => {
    const coord = pointerToCoord(event.currentTarget, event.clientX, event.clientY);
    if (!coord) return;
    if (side === "player" && phase === "placement") {
      if (missionRule) return;
      if (!placementPreviewActive) {
        const ship = player.current.shipAt(coord);
        if (!ship) return;
        const start = ship.cells.reduce((best, c) => ({ x: Math.min(best.x, c.x), y: Math.min(best.y, c.y) }), { x: 7, y: 7 });
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        selectPlacementShip(ship.id);
        placementGesture.current = {
          pointerId: event.pointerId,
          offset: { x: coord.x - start.x, y: coord.y - start.y },
          origin: start,
          startedOnPreview: true,
          moved: false,
          justPickedUp: true,
        };
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        touchPointers.current.add(event.pointerId);
        if (touchPointers.current.size >= 2) {
          placementGesture.current = null;
          if (!touchRotated.current) {
            touchRotated.current = true;
            rotatePlacement();
          }
          return;
        }
      }
      const previewCells = player.current.cellsFor(cursor, SHIPS.find((ship) => ship.id === selectedShip)!.size, orientation, selectedShip);
      const onPreview = previewCells.some((cell) => sameCoord(cell, coord));
      const origin = onPreview ? cursor : clampPlacementOrigin(selectedShip, orientation, coord);
      if (!onPreview) setCursor(origin);
      placementGesture.current = {
        pointerId: event.pointerId,
        offset: onPreview ? { x: coord.x - cursor.x, y: coord.y - cursor.y } : { x: 0, y: 0 },
        origin,
        startedOnPreview: onPreview,
        moved: false,
        justPickedUp: false,
      };
    } else if (side === "enemy") {
      setCursor(coord);
      chooseTarget(coord);
    }
  };

  const onPointerRelease = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    const gesture = placementGesture.current;
    if (gesture?.pointerId === event.pointerId) {
      if (!gesture.justPickedUp && gesture.startedOnPreview && !gesture.moved && placementPreviewActive && placementValid) {
        placeAt(cursor);
      }
      placementGesture.current = null;
    }
    if (touchPointers.current.size === 0 && touchRotated.current) {
      setTimeout(() => { touchRotated.current = false; }, 200);
    }
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const coord = pointerToCoord(event.currentTarget, event.clientX, event.clientY);
    if (!coord) return;
    if (phase === "placement") {
      const gesture = placementGesture.current;
      if (!gesture || gesture.pointerId !== event.pointerId || touchRotated.current) return;
      event.preventDefault();
      const origin = clampPlacementOrigin(selectedShip, orientation, { x: coord.x - gesture.offset.x, y: coord.y - gesture.offset.y });
      if (!sameCoord(origin, gesture.origin)) {
        gesture.origin = origin;
        gesture.moved = true;
        setCursor(origin);
      }
      return;
    }
    setCursor(coord);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (logOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setLogOpen(false);
        }
        return;
      }
      if (!difficulty || phase === "victory" || phase === "defeat") return;
      if (event.key.toLowerCase() === "m") {
        setMuted(audio.current?.toggle() ?? false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (phase === "placement" && placementBackup) restorePlacement();
        else cancelAim();
        return;
      }
      if (event.key.toLowerCase() === "r") {
        if (phase === "placement") rotatePlacement();
        else if (phase === "player" && weapon === "sparrow") rotateStraddleAim();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, summary, a, input, textarea, select, [role='dialog']")) return;
      if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      const order = weaponOrder;
      const index = Number(event.key) - 1;
      if (phase === "player" && index >= 0 && index < order.length) selectWeapon(order[index]);
      const directions: Record<string, Coord> = {
        ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
      };
      const delta = directions[event.key];
      if (delta) {
        setCursor((current) => ({
          x: Math.max(0, Math.min(7, current.x + delta.x)),
          y: Math.max(0, Math.min(7, current.y + delta.y)),
        }));
      }
      if ((event.key === "Enter" || event.key === " ") && phase === "player") {
        if (ready) void confirmAction();
        else chooseTarget(cursor);
      }
      if ((event.key === "Enter" || event.key === " ") && phase === "placement") placeAt(cursor);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cursor, weapon, attackOrientation, picked, locked, ready, selectedShip, orientation, placementPreviewActive, placementBackup, playerFleet, difficulty, logOpen, weaponOrder]);

  useEffect(() => {
    // Dialogs remain keyboard-contained on desktop without changing the touch
    // layout. Restoring the prior focus also keeps gamepad/keyboard users near
    // the control that opened LOG or the mission library.
    const resultDialogOpen = (phase === "victory" || phase === "defeat") && !resultReview;
    const selector = logOpen
      ? ".log-drawer"
      : !difficulty && missionLibraryOpen
        ? ".mission-library"
        : !difficulty
          ? ".difficulty-card"
          : resultDialogOpen
            ? ".result-card"
            : null;
    if (!selector) return;
    const dialog = document.querySelector<HTMLElement>(selector);
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not(:disabled), summary, [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
    const focusFrame = requestAnimationFrame(() => focusables()[0]?.focus({ preventScroll: true }));
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape" && missionLibraryOpen && !logOpen) {
        event.preventDefault();
        setMissionLibraryOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", keepFocusInside);
    return () => {
      cancelAnimationFrame(focusFrame);
      dialog.removeEventListener("keydown", keepFocusInside);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [difficulty, logOpen, missionLibraryOpen, phase, resultReview]);

  const shipCard = (board: Board, shipId: ShipId, options: ShipCardOptions = {}) => {
    const { selectable = false, concealDamage = false, concealIdentity = false, identified = false, contactIndex = 0 } = options;
    const definition = SHIPS.find((ship) => ship.id === shipId)!;
    const ship = board.ships.find((candidate) => candidate.id === shipId);
    const revealDamage = !concealDamage || Boolean(ship?.sunk);
    const revealIdentity = !concealIdentity || identified || Boolean(ship?.sunk);
    const meterLength = concealDamage && !ship?.sunk ? 5 : definition.size;
    const remainingHull = ship ? Math.max(0, definition.size - ship.hits.size) : definition.size;
    const hullLabel = !revealDamage
      ? "HULL DATA MASKED"
      : `HULL ${remainingHull}/${definition.size}${ship?.sunk ? " // SUNK" : ""}`;
    const links = escortLinksFor(board, shipId);
    const canShowEscortSupport = board === player.current || !concealDamage;
    const escortStatus = isEscort(shipId) && revealIdentity && ship && canShowEscortSupport
      ? links.carrier && links.battleship
        ? "DUAL SUPPORT LINK：ACTIVE / F-4＋1 / HARPOON＋1"
        : links.carrier
          ? "ESCORT SUPPORT：ACTIVE / F-4＋1"
          : links.battleship
            ? "FIRE CONTROL LINK：ACTIVE / HARPOON＋1"
            : "SUPPORT LINK INACTIVE"
      : null;
    return (
      <button
        key={shipId}
        className={"ship-card " + (!selectable ? "read-only " : "") + (selectable && !ship && selectedShip === shipId ? "active " : "") + (ship?.sunk ? "sunk" : "")}
        onClick={() => selectable && selectPlacementShip(shipId)}
        disabled={!selectable}
        aria-disabled={!selectable}
        onPointerEnter={() => revealIdentity && setInspectedShip(shipId)}
        onFocus={() => revealIdentity && setInspectedShip(shipId)}
        onTouchStart={() => revealIdentity && setInspectedShip(shipId)}
        title={!revealIdentity ? "未識別艦" : `${definition.name}／船体${definition.size}区画${definition.weapon === "NONE" ? "／特殊兵装なし" : "／搭載兵装：" + definition.weapon}`}
      >
        <strong>{revealIdentity ? `${definition.code} // ${hullLabel}` : "UNKNOWN CONTACT / " + String(contactIndex + 1).padStart(2, "0")}</strong>
        <small>{ship?.sunk ? definition.name + " / SUNK" : !revealIdentity ? "SIGNATURE UNKNOWN" : escortStatus ?? (ship ? concealDamage ? definition.name + " / IDENTIFIED" : selectable ? definition.name + " / 配置済み・再配置可" : definition.name + " / DEPLOYED" : selectable ? selectedShip === shipId ? definition.name + " / 選択中" : definition.name + " / タップして選択" : concealDamage ? "DAMAGE STATUS UNKNOWN" : "CONTACT DATA PENDING")}</small>
        <span className={"hull-meter " + (!revealDamage ? "concealed" : "")}>
          {Array.from({ length: meterLength }, (_, index) => <i key={index} className={revealDamage && ship && index < ship.hits.size ? "hit" : ""} />)}
        </span>
      </button>
    );
  };


  const result = phase === "victory" || phase === "defeat";
  const trainingAllComplete = difficulty === "training"
    && TRAINING_STAGES.every((lesson) => isTrainingLessonComplete(trainingProgress, lesson.training?.lesson ?? lesson.id));
  const nextTrainingLesson = difficulty === "training" && !trainingAllComplete
    ? nextIncompleteTrainingLesson(trainingProgress)
    : null;
  const nextTrainingIndex = nextTrainingLesson === null
    ? -1
    : activeStages.findIndex((lesson) => lesson.id === trainingStageIdForLesson(nextTrainingLesson));
  const hasNextTrainingLesson = nextTrainingIndex >= 0;
  const campaignClear = phase === "victory" && (difficulty === "training"
    ? trainingAllComplete
    : difficulty !== "mission" && stageIndex === activeStages.length - 1);
  const currentUnitEnglish = progressUnit.english;
  const currentUnitJapanese = progressUnit.japanese;
  const missionOrdersRemaining = missionRule ? Math.max(0, missionRule.objective.maxFriendlyActions - stats.turns) : null;
  const finalSurvivors = player.current.ships.filter((ship) => !ship.sunk);
  const finalHullSections = finalSurvivors.reduce((sum, ship) => sum + Math.max(0, ship.size - ship.hits.size), 0);
  const enemyRemainingShips = enemy.current.ships.filter((ship) => !ship.sunk).length;
  const enemyRemainingCells = enemy.current.ships.reduce((sum, ship) => sum + Math.max(0, ship.size - ship.hits.size), 0);
  const enemyFleetCells = enemyFleet.reduce((total, id) => total + SHIPS.find((ship) => ship.id === id)!.size, 0);
  const unusedSpecials = (["phantom", "harpoon", "sparrow", "mk45", "radar"] as const).flatMap((id): UnusedSpecial[] => {
    const carrier = WEAPON_META[id].carrier;
    if (!carrier || !playerFleet.includes(carrier)) return [];
    const uses = arsenal.current.availableUses(id, player.current);
    return uses > 0 ? [{ label: WEAPON_META[id].label, uses }] : [];
  });
  const assessment = phase === "defeat" && difficulty !== "mission" && difficulty !== "training" ? commandAssessment({
    enemyRemainingShips,
    enemyRemainingCells,
    accuracy: stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0,
    shots: stats.shots,
    specialUsed: stats.specials,
    unusedSpecials,
    firstLoss: playerLossOrderRef.current[0],
    identified: enemyIdentified.length,
    enemyTotalShips: enemyFleet.length,
    identificationRules,
    survival: difficulty === "survival" ? {
      playerEntryShips: playerFleet.length,
      playerEntryCells: fleetCells,
      enemyEntryShips: enemyFleet.length,
      enemyEntryCells: enemyFleetCells,
      previousLosses: FULL_FLEET.filter((id) => !playerFleet.includes(id)),
    } : undefined,
  }) : null;
  const selectedMeta = WEAPON_META[weapon];
  const selectedState = weaponState(weapon);
  const confirmLabel = ACTION_LABEL[weapon];
  const phaseStatus = phase === "placement"
    ? difficulty === "training"
      ? { english: "TRAINING BRIEF", japanese: "教程確認" }
      : difficulty === "mission"
      ? missionRule?.category === "archive"
        ? { english: "INTELLIGENCE REVIEW", japanese: "情報照合" }
        : { english: "SITUATION REVIEW", japanese: "状況確認" }
      : { english: "FLEET DEPLOYMENT", japanese: "艦隊配置" }
    : phase === "player"
      ? locked
        ? { english: "ENGAGING", japanese: "攻撃実行中" }
        : ready
          ? { english: "READY TO ENGAGE", japanese: "攻撃準備完了" }
          : picked.length
            ? { english: "TARGET DESIGNATION", japanese: "目標指示" }
            : { english: "AWAITING ORDERS", japanese: "指令待機" }
      : phase === "enemy"
        ? { english: "HOSTILE ACTION", japanese: "敵攻撃" }
        : phase === "review"
          ? { english: "DAMAGE REPORT", japanese: "損害報告" }
          : phase === "victory"
            ? { english: difficulty === "training" ? campaignClear ? "TRAINING COMPLETE" : "LESSON COMPLETE" : difficulty === "mission" ? "MISSION ACCOMPLISHED" : difficulty === "survival" ? campaignClear ? "SURVIVAL COMPLETE" : "OPERATION COMPLETE" : campaignClear ? "CAMPAIGN COMPLETE" : "SECTOR SECURED", japanese: difficulty === "training" ? campaignClear ? "全教程修了" : "教程修了" : difficulty === "mission" ? "任務達成" : difficulty === "survival" ? campaignClear ? "全4作戦完了" : "作戦完了" : campaignClear ? "全6海域確保" : "海域確保" }
            : { english: difficulty === "training" ? "TRAINING HOLD" : difficulty === "mission" ? "OBJECTIVE NOT ACHIEVED" : "OPERATION ABORTED", japanese: difficulty === "training" ? "訓練未修了" : difficulty === "mission" ? "任務条件未達" : "作戦中止" };

  const displayedWeapon = weaponPeek ?? weapon;
  const displayedMeta = WEAPON_META[displayedWeapon];
  const displayedState = weaponState(displayedWeapon);
  const displayedPattern = displayedWeapon === "sparrow"
    ? `${displayedMeta.pattern} / 方位 ${STRADDLE_DIRECTION[attackOrientation]}`
    : displayedMeta.pattern;
  const inspectedDefinition = SHIPS.find((ship) => ship.id === inspectedShip)!;
  const inspectedDossier = SHIP_DOSSIER[inspectedShip];
  const activeMissionRecord = missionRule && missionRule.category !== "training" ? findMissionRecord(missionRecords, missionRule.id) : null;
  const missionCompletedCount = MISSION_LIBRARY.filter((item) => findMissionRecord(missionRecords, item.id)).length;
  const trainingCompletedCount = trainingCompletionCount(trainingProgress);
  const selectedMissionCategory = missionLibrarySection === "archive"
    ? "archive"
    : missionLibrarySection === "extreme"
      ? "extreme"
      : missionLibrarySection === "training"
        ? "training"
        : "standard";
  const sectionMissionChoices = missionLibraryFor(selectedMissionCategory);
  const isScenarioCleared = (item: MissionStageDefinition) => item.category === "training"
    ? isTrainingLessonComplete(trainingProgress, item.training?.lesson ?? item.id)
    : Boolean(findMissionRecord(missionRecords, item.id));
  const sectionClearedCount = sectionMissionChoices.filter(isScenarioCleared).length;
  const missionChoices = sectionMissionChoices.filter((item) => {
    const cleared = isScenarioCleared(item);
    if (missionCompletionFilter === "cleared") return cleared;
    if (missionCompletionFilter === "uncleared") return !cleared;
    return true;
  });
  const renderArchiveEntries = (entries: readonly MissionArchiveEntry[], label = "ARCHIVED OPERATION LOG") => (
    <section className="archive-log" aria-label="過去の作戦日誌">
      <header><span>{label}</span><b>作戦日誌</b></header>
      <ol>{entries.map((entry, index) => (
        <li key={`${entry.time}-${index}`} className={entry.tone ?? "info"}>
          <time>{entry.time}</time><span>{entry.text}</span>
        </li>
      ))}</ol>
    </section>
  );
  useEffect(() => { setWithdrawArmed(false); }, [phase]);

  const withdrawToModeSelect = () => {
    if (!withdrawArmed) {
      setWithdrawArmed(true);
      return;
    }
    const at = Date.now();
    addLog("作戦中止。残存戦力へ母港帰投を下令。", "bad", at, "withdrawal");
    operationRecorderRef.current?.finish(activeNow());
    operationRecorderRef.current = null;
    setOperationRecord(null);
    audio.current?.setLossTier(0);
    setWithdrawArmed(false);
    if (difficulty === "mission" || difficulty === "training") returnToMissionLibrary();
    else {
      setPhase("placement");
      setDifficulty(null);
    }
  };

  const retryCurrentStage = () => {
    const at = Date.now();
    if (difficultyRef.current === "survival") operationRecorderRef.current?.noteRetry(stageIndex);
    if (phase === "defeat") {
      addLog("再出撃命令。進入時艦隊を再編。", "info", at, "withdrawal");
    } else if (phase !== "placement") {
      addStageSummary(at);
      addLog("戦術撤退。現在の交戦結果を破棄し、進入時艦隊で再出撃。", "bad", at);
      addLog(`＝ ${routeUnit(difficultyRef.current).english} ${stageIndex + 1} / 交戦中止・戦術撤退 ＝`, "bad", at, "withdrawal");
    } else {
      addLog(`${routeUnit(difficultyRef.current).english} ${stageIndex + 1} ${difficultyRef.current === "mission" || difficultyRef.current === "training" ? "固定状況を再読込" : "艦隊配置を再設定"}。`, "info", at);
    }
    initStage(stageIndex, difficulty ?? difficultyRef.current, difficulty === "survival" ? survivalFleetRef.current : undefined, true);
  };

  const addSupplyLog = (nextFleet?: ShipId[]) => {
    const at = Date.now();
    addLog("生存艦修復完了。兵装再装填完了。", "good", at);
    if (difficulty === "survival" && nextFleet) {
      const nextCells = nextFleet.reduce((total, id) => total + SHIPS.find((ship) => ship.id === id)!.size, 0);
      const lost = FULL_FLEET.filter((id) => !nextFleet.includes(id));
      if (lost.length) addLog(`撃沈艦、戦列復帰せず。累積損耗${lost.length}艦。`, "bad", at);
      addLog(`次作戦投入戦力：${nextFleet.length}艦 / ${nextCells}区画。`, "info", at);
    }
    addLog("＝ REARM & REPAIR / 修復・再補給 ＝", "good", at, "supply");
  };

  const advanceFromResult = () => {
    if (difficulty === "mission") {
      if (phase === "defeat") retryCurrentStage();
      else returnToMissionLibrary();
      return;
    }
    if (difficulty === "training") {
      if (phase === "defeat") retryCurrentStage();
      else if (hasNextTrainingLesson) initStage(nextTrainingIndex, "training");
      else returnToMissionLibrary();
      return;
    }
    if (phase === "defeat") {
      retryCurrentStage();
    } else if (campaignClear) {
      operationRecorderRef.current = null;
      setOperationRecord(null);
      audio.current?.setLossTier(0);
      setDifficulty(null);
      initStage(0, "casual");
    } else {
      if (difficulty === "survival") {
        const sunkThisStage = player.current.ships.filter((ship) => ship.sunk).map((ship) => ship.id);
        const nextFleet = survivingFleet(survivalFleetRef.current, sunkThisStage);
        survivalFleetRef.current = nextFleet;
        setSurvivalFleet(nextFleet);
        addSupplyLog(nextFleet);
        initStage(stageIndex + 1, "survival", nextFleet);
      } else {
        addSupplyLog();
        initStage(stageIndex + 1);
      }
    }
  };

  const renderWeaponControls = () => (
    <>
      {missionRule?.training && (() => {
        const stepIndex = Math.min(missionFriendlyActionsRef.current, missionRule.training.steps.length - 1);
        const step = missionRule.training.steps[stepIndex];
        return <section className="training-directive" aria-live="polite" aria-label="現在の訓練指示">
          <header><span>TRAINING DIRECTIVE {String(stepIndex + 1).padStart(2, "0")} / {String(missionRule.training.steps.length).padStart(2, "0")}</span><b>{step.title}</b></header>
          <p>{step.instruction}</p>
          {trainingHoldNotice && <strong className="training-hold-notice" role="alert">TRAINING HOLD / {trainingHoldNotice}</strong>}
          <small>{step.doctrine}</small>
          <details><summary>説明を再表示</summary><p>{missionRule.training.plainBrief}</p></details>
        </section>;
      })()}
      <div className={"weapon-peek " + (weaponPeek ? "visible" : "")} aria-live="polite">
        <span>SYSTEM STATUS</span>
        <b>{displayedMeta.label}</b>
        <em>{displayedPattern} / {displayedState.status}</em>
        <small>{displayedState.available ? displayedState.reason || displayedMeta.help : displayedState.reason}</small>
      </div>
      {weaponOrder.map((id, index) => {
        const state = weaponState(id);
        return (
          <button
            key={id}
            className={"cmd " + (!state.available ? "unavailable " : "") + (weapon === id ? "selected" : "")}
            onClick={() => selectWeapon(id)}
            onPointerEnter={() => showWeaponPeek(id)}
            onPointerDown={() => showWeaponPeek(id)}
            onFocus={() => showWeaponPeek(id)}
            disabled={phase !== "player" || locked}
            aria-disabled={!state.available || phase !== "player" || locked}
            aria-pressed={weapon === id}
            aria-label={`${index + 1} / ${WEAPON_META[id].label}。${state.status}`}
            title={state.reason || WEAPON_META[id].help}
          >
            <b aria-hidden="true">
              <span className="weapon-label-full">{index + 1} / {WEAPON_META[id].label}</span>
              <span className="weapon-label-compact"><i>{index + 1}</i>{WEAPON_META[id].compactLabel}</span>
            </b><small>{state.status}</small>
          </button>
        );
      })}
      <div className="action-cluster">
        <button className="cmd cancel-command" onClick={cancelAim} disabled={locked || !picked.length}>
          <b>CANCEL</b><small>照準解除 / ESC</small>
        </button>
        <button className={"cmd confirm " + (ready ? "ready" : "")} onClick={() => void confirmAction()} disabled={!ready || locked}>
          <b>{confirmLabel}</b><small>{weapon === "sparrow" ? `方位 ${STRADDLE_DIRECTION[attackOrientation]} / 4区画` : `${picked.length} / ${targetRequirement} SELECTED`}</small>
        </button>
      </div>
    </>
  );

  const renderPlacementControls = (surface: "rail" | "bottom") => missionRule ? (
    <>
      <section className={"mission-brief " + (missionRule.category === "archive" ? "archive " : "") + (missionRule.category === "training" ? "training" : "") }>
        <header><span>{missionRule.category === "training" ? "TRAINING BRIEF / 教程" : missionRule.category === "archive" ? "CURRENT STATE / 現況" : "SITUATION / 状況"}</span><b>{missionRule.title}</b></header>
        <p>{missionRule.training?.plainBrief ?? missionRule.subtitle}</p>
        <dl>
          <div><dt>OBJECTIVE / 任務目標</dt><dd>{missionRule.directive}</dd></div>
          <div><dt>CONSTRAINTS / 制約</dt><dd>{missionRule.condition}</dd></div>
          {missionRule.category !== "archive" && <div><dt>{missionRule.category === "training" ? "DOCTRINE / 要点" : "HOSTILE DISCLOSURE / 敵情"}</dt><dd>{missionRule.category === "training" ? missionRule.training?.doctrine : missionRule.enemyDisclosure.summary}</dd></div>}
        </dl>
        {Boolean(missionRule.enemyDisclosure.candidateCells?.length) && (
          <div className="mission-public-intel" aria-label="公開済み戦術プロット">
            <span>PLOTTED CONTACTS / 公開座標</span>
            <div>
              {(missionRule.enemyDisclosure.candidateCells ?? []).map((candidate) => (
                <i className="mission-intel-marker" key={`${candidate.code}-${candidate.coord.x}-${candidate.coord.y}`}>
                  <b>{coordName(candidate.coord)}</b>{candidate.code}
                </i>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="mission-orders">
        <div><span>ORDERS / 指令限度</span><b>{missionRule.objective.maxFriendlyActions}</b></div>
        <div><span>INITIATIVE / 先制</span><b>{missionRule.enemyFirst ? "HOSTILE" : "BLUE"}</b></div>
      </div>
      {missionRule.category === "archive" && missionRule.archiveLog && surface === "rail" && renderArchiveEntries(missionRule.archiveLog)}
      {missionRule.category === "archive" && surface === "bottom" && (
        <button className="cmd archive-open" onClick={() => setLogOpen(true)}>
          <b>ARCHIVE LOG</b><small>作戦日誌を開く</small>
        </button>
      )}
      <div className="assigned-formation">
        <span>FIXED DISPOSITION / 固定配備</span>
        <b>{player.current.ships.length}艦</b>
        <small>{missionRule.category === "training" ? "固定教材。誤った指令は弾薬・行動を消費せず、正しい操作を再表示します。" : "移動・回転不可。自軍戦術図、敵情図、LOGを照合してから交戦を開始。"}</small>
      </div>
      <button className="cmd battle-start placement-start" onClick={startBattle}>
        <b>⚔ {missionRule.category === "training" ? "訓練開始" : missionRule.category === "archive" ? "状況確認完了" : "任務開始"}</b><small>{missionRule.category === "training" ? "BEGIN LESSON / 指示に従って操作" : "COMMENCE ENGAGEMENT / 射撃指揮へ移行"}</small>
      </button>
    </>
  ) : (
    <>
      <details
        key={`${surface}-${compactViewport ? "compact-dossier" : "desktop-dossier"}`}
        className="placement-help placement-dossier"
        open={!compactViewport}
      >
        <summary><span>VESSEL DATA</span><b>{inspectedDefinition.name} // {inspectedDefinition.code} // HULL {inspectedDefinition.size}</b><em>{inspectedDossier.role}</em><i>艦艇諸元</i></summary>
        <div className="placement-dossier-body">
          <p>{inspectedDossier.capability}</p><small>{inspectedDossier.loss}</small>
          <footer>艦を選択 → ドラッグで移動 → 回転または配置決定　{identificationRules ? "◆は重要区画 / " : ""}二本指・Rで回転 / Enterで決定</footer>
        </div>
      </details>
      {placementPreviewActive && (
        <div className="placement-dock" aria-label="艦の配置操作">
          <button className="cmd placement-rotate" onClick={rotatePlacement}>
            <b>↻ 90°回転</b><small>現在：{{ east: "東", south: "南", west: "西", north: "北" }[orientation]}向き</small>
          </button>
          <button
            className={"cmd primary placement-confirm " + (placementValid ? "ready" : "")}
            onClick={() => placeAt(cursor)}
            disabled={!placementValid}
          >
            <b>✓ 配置決定</b><small>{placementValid ? coordName(cursor) + " に固定" : "重複または配置範囲外"}</small>
          </button>
          {placementBackup && (
            <button className="placement-restore" onClick={restorePlacement}>元の位置に戻す <span>ESC</span></button>
          )}
        </div>
      )}
      <div className="placement-secondary">
        <button className="cmd" onClick={clearPlacement}><b>CLEAR</b><small>配置をやり直す</small></button>
        <button className="cmd" onClick={randomize}><b>RANDOM</b><small>自動配置</small></button>
      </div>
      {player.current.allPlaced(playerFleet) && (
        <button className="cmd battle-start placement-start" onClick={startBattle}>
          <b>⚔ 交戦開始</b><small>COMMENCE ENGAGEMENT / {player.current.ships.length} / {playerFleet.length} 艦配置完了</small>
        </button>
      )}
    </>
  );

  const renderMissionCard = (item: MissionStageDefinition) => {
    const libraryIndex = (item.category === "training" ? TRAINING_STAGES : MISSION_LIBRARY).findIndex((candidate) => candidate.id === item.id);
    const categoryIndex = missionLibraryFor(item.category).findIndex((candidate) => candidate.id === item.id);
    const operationCode = `${item.category === "training" ? "LESSON" : item.category === "archive" ? "ARCHIVE" : item.category === "extreme" ? "EXTREME" : "MISSION"} ${String(categoryIndex + 1).padStart(2, "0")}`;
    const record = item.category === "training" ? null : findMissionRecord(missionRecords, item.id);
    const cleared = isScenarioCleared(item);
    const knownContacts = item.enemyDisclosure.known.map((id) =>
      item.enemyDisclosure.callsigns?.[id] ?? SHIPS.find((ship) => ship.id === id)?.code ?? id.toUpperCase());
    const hostileDisclosure = [
      knownContacts.length ? `KNOWN ${knownContacts.join(" / ")}` : "KNOWN NONE",
      item.enemyDisclosure.unknownCount ? `UNKNOWN ${item.enemyDisclosure.unknownCount}` : "UNKNOWN 0",
    ].join(" // ");
    return (
      <button
        key={item.id}
        className={"mission-card " + (cleared ? "cleared " : "uncleared ") + (item.category === "archive" ? "archive " : "") + (item.category === "extreme" ? "extreme " : "") + (item.category === "training" ? "training" : "")}
        onClick={() => startCampaign(item.category === "training" ? "training" : "mission", libraryIndex)}
        aria-label={`${operationCode} ${item.title}、難易度${item.difficulty}、${missionDifficultyName(item.difficulty)}、${cleared ? "達成済み" : "未達成"}。開始`}
      >
        <header>
          <span>{operationCode}</span>
          <em className={"mission-status-badge " + (cleared ? "cleared" : "uncleared")}><i aria-hidden="true">{cleared ? "✓" : "○"}</i>{cleared ? item.category === "training" ? "COMPLETE" : "CLEARED" : "UNCLEARED"}</em>
        </header>
        <h3>{item.title}</h3>
        <p>{item.subtitle}</p>
        <div className="mission-difficulty" aria-label={`難易度 ${item.difficulty} / 6、${missionDifficultyName(item.difficulty)}`}>
          <b>DIFFICULTY {item.difficulty} / 6</b><span>{missionDifficultyName(item.difficulty)}</span><i aria-hidden="true">{missionDifficultyLabel(item.difficulty)}</i>
        </div>
        <dl>
          <div><dt>LIMITS</dt><dd>{item.condition}</dd></div>
          <div><dt>BLUE FORCE</dt><dd>{missionFleetLabel(item.playerFleet)}</dd></div>
          <div><dt>SYSTEMS</dt><dd>{item.allowedWeapons.map((id) => MISSION_WEAPON_LABEL[id]).join(" / ")}</dd></div>
          <div><dt>INITIATIVE</dt><dd>{item.enemyFirst ? "HOSTILE FIRST" : "BLUE FIRST"}</dd></div>
          <div><dt>HOSTILE DATA</dt><dd>{hostileDisclosure}</dd></div>
        </dl>
        <div className="mission-card-record">
          {item.category === "training" ? (
            <><span>{cleared ? "LESSON COMPLETE" : "AVAILABLE"}</span><b>{item.training?.steps.length ?? item.objective.maxFriendlyActions} DIRECTIVES</b></>
          ) : record ? (
            <><span>CLEARED × {record.clearCount}</span><b>BEST {record.fewestCommands} ORDERS / {formatOperationDuration(record.fastestActiveMs)}</b></>
          ) : (
            <><span>UNCLEARED</span><b>NO CLEAR RECORD</b></>
          )}
        </div>
      </button>
    );
  };

  return (
    <main
      className={"game-shell operation-active phase-" + phase + " " + (difficulty ? "mode-selected " : "") + (difficulty === "mission" || difficulty === "training" ? "mission-mode scenario-mode " : "") + (difficulty === "training" ? "training-mode " : "") + (phase === "review" ? "review-phase " : "") + (activeEffect === "impact" ? "shake" : "")}
      data-phase={phase}
    >
      <div className="noise" />
      <header className="masthead">
        <div>
          <div className="brand-kicker">COMBAT INFORMATION CENTER / CIC / {difficulty === "survival" ? "SURVIVAL" : difficulty === "mission" ? "MISSION OPERATIONS" : difficulty === "training" ? "INITIAL TRAINING" : difficulty ? "CAMPAIGN" : "OPERATION"}</div>
          <h1 className="brand-title" aria-label={GAME_TITLE}>DEEP <span>BLUE</span> GRID</h1>
        </div>
        <div className={"phase-badge " + phase}>
          <strong>{phaseStatus.english}</strong>
          <small>{phaseStatus.japanese} / {progressUnit.english} {stageIndex + 1} / {difficulty?.toUpperCase() ?? "SELECT MODE"}</small>
        </div>
        <div className="system-info">SCENARIO ID <b>{seedRef.current ? seedRef.current.toString(16).toUpperCase() : "STANDBY"}</b><br />TACTICAL DATA LINK <b>ONLINE</b></div>
      </header>

      {difficulty === "mission" || difficulty === "training" ? (
        <nav className="campaign-track mission-current-track" aria-label={difficulty === "training" ? "選択中の教程" : "選択中の限定任務"}>
          <span className="current"><i>{stageIndex + 1}</i><b>{mission.title}</b></span>
          <span className={difficulty === "training" ? isTrainingLessonComplete(trainingProgress, stageIndex + 1) ? "cleared" : "" : activeMissionRecord ? "cleared" : ""}><i>{difficulty === "training" ? trainingCompletedCount : missionCompletedCount}</i><b>{difficulty === "training" ? `修了済み / ${TRAINING_STAGES.length}` : `達成済み / ${MISSION_LIBRARY.length}`}</b></span>
        </nav>
      ) : (
        <nav className="campaign-track" aria-label={`${currentUnitJapanese}進行`}>
          {activeStages.map((item, index) => (
            <span key={item.id} className={index < stageIndex ? "cleared" : index === stageIndex ? "current" : ""}>
              <i>{index + 1}</i><b>{missionFor(activeMode, item).title}</b>
            </span>
          ))}
        </nav>
      )}

      <section className={"status-strip " + (phase === "enemy" ? "enemy" : phase === "review" ? "review" : "")} aria-live="polite">
        <span className="tag">{phase === "placement" ? difficulty === "mission" || difficulty === "training" ? "REVIEW" : "DEPLOY" : phase === "enemy" ? "HOSTILE" : phase === "review" ? "REPORT" : controlStation.english}</span>
        <p><b>{mission.title}</b> — {message}</p>
        <span className="turn-counter">{missionRule ? missionRule.objective.kind === "sonar-reports" ? `LISTENING ${stats.turns}/${missionRule.objective.maxFriendlyActions}` : `ORDERS REMAINING ${missionOrdersRemaining}` : `TURN ${String(phase === "player" && !locked ? stats.turns + 1 : Math.max(1, stats.turns)).padStart(2, "0")}`} / FRIENDLY {ownAlive} / HOSTILE {phase === "placement" ? "?" : enemyAlive}</span>
      </section>

      <section className="quick-guide">
        <b>DEEP BLUE GRID // 作戦要領</b>
        {missionRule?.training ? <><span>1. 常設の訓練指示を読む</span><span>2. 戦術図と兵装を確認</span><span>3. 指定操作を実行</span><span>4. 誤指令は消費なしで再試行</span></> : missionRule ? <><span>1. 固定状況と任務目標を確認</span><span>2. 許可兵装と指令残数を確認</span><span>3. 戦術図へ目標を指示</span><span>4. 条件達成後は直ちに離脱</span></> : <><span>1. 艦を選びシルエットを配置</span><span>2. 兵装と目標を選択</span><span>3. プレビューを確認して発射</span><span>4. 全区画命中で撃沈</span></>}
        {identificationRules && <span className="identification-guide"><strong>◆ 識別戦：</strong>自軍の◆は重要区画。敵の重要区画へ命中すると艦種・コードのみ識別し、耐久と向きは秘匿されたままです。</span>}
      </section>

      {difficulty && (!result || resultReview) && (
        <aside className="utility-overlay" aria-label="ゲーム設定">
          <button className="log-button" onClick={() => setLogOpen(true)} aria-label="CIC交戦経過記録を開く" title="CIC交戦経過記録を開く">
            <span aria-hidden="true">LOG</span>
          </button>
          <button
            onClick={() => setMuted(audio.current?.toggle() ?? false)}
            aria-label={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
            aria-pressed={muted}
            title={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
          >
            <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
          </button>
          <button
            className="retry"
            onClick={retryCurrentStage}
            disabled={locked || result}
            aria-label={`現在の${currentUnitJapanese}をリトライ`}
            title={`現在の${currentUnitJapanese}をリトライ`}
          >
            <span aria-hidden="true">↻</span>
          </button>
        </aside>
      )}

      <nav className="mobile-field-switch" aria-label="表示する戦術図">
        <div>
          <b>{resultReview ? extremeIntelWithheld ? "交戦後解析：公開情報を確認" : phase === "defeat" ? "交戦後解析：敵配置を確認" : "最終戦況：両軍戦術図を確認" : phase === "enemy" ? "敵攻撃中：自軍戦術図を表示" : phase === "review" ? "損害報告：自軍戦術図を表示" : phase === "player" ? "指令待機：敵情図を表示" : difficulty === "training" ? "教程確認：両軍戦術図と指示を確認" : difficulty === "mission" ? "状況確認：両軍戦術図を照合" : "艦隊配置：自軍戦術図を表示"}</b>
          <small>{resultReview ? extremeIntelWithheld ? "再挑戦資格保全のため未確認配置は秘匿されます" : "LOGから交戦記録も確認できます" : phase === "placement" && missionRule ? "自軍・敵情・LOGを切り替えて確認できます" : phase === "review" ? `戦闘記録への記載後、${controlStation.japanese}へ復帰` : "状況に合わせて同じ位置へ切り替えます"}</small>
        </div>
        <button className={visibleBoard === "player" ? "active" : ""} onClick={() => showBoard("player")} aria-pressed={visibleBoard === "player"}>
          自軍戦術図
        </button>
        <button className={visibleBoard === "enemy" ? "active" : ""} onClick={() => showBoard("enemy")} disabled={phase === "placement" && !missionRule} aria-pressed={visibleBoard === "enemy"}>
          敵情図
        </button>
        {difficulty && (!result || resultReview) && (
          <span className="mobile-switch-utilities" aria-label="ゲーム設定">
            <button className="log-button" onClick={() => setLogOpen(true)} aria-label="CIC交戦経過記録を開く" title="CIC交戦経過記録を開く">
              <span aria-hidden="true">LOG</span>
            </button>
            <button
              onClick={() => setMuted(audio.current?.toggle() ?? false)}
              aria-label={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
              aria-pressed={muted}
              title={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
            >
              <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
            </button>
            <button
              className="retry"
              onClick={retryCurrentStage}
              disabled={locked || result}
              aria-label={`現在の${currentUnitJapanese}をリトライ`}
              title={`現在の${currentUnitJapanese}をリトライ`}
            >
              <span aria-hidden="true">↻</span>
            </button>
          </span>
        )}
      </nav>

      <div className={"combat-workspace " + (difficulty && (!result || resultReview) ? "active" : "")}>
        <div className="boards" ref={boardsRef}>
        <section className={"tactical-panel " + (compactViewport && visibleBoard !== "player" ? "mobile-hidden" : "")}>
          <div className="panel-head"><h2>OWN FORCE PLOT // 自軍戦術図</h2><span>DEFENSE GRID</span></div>
          {phase !== "placement" && (
            <div className={"enemy-command-help own-field-help " + (phase === "review" || resultReview ? "reviewing" : "")} aria-live="polite">
              <div>
                <span>OWN FLEET STATUS</span>
                <strong>{resultReview ? "最終戦況" : phase === "review" ? "損害報告" : phase === "enemy" ? "敵攻撃監視中" : "自軍状況"}</strong>
                <em>損傷 {stats.damage} / {fleetCells}</em>
              </div>
              <p>{resultReview ? "作戦終了時の残存艦と損傷位置です。" : phase === "review" ? "敵の攻撃が終了しました。艦隊と着弾位置を確認してください。" : phase === "enemy" ? "敵の攻撃と着弾結果を追跡しています。" : "現在の自軍艦隊と損傷状況です。"}</p>
              <small>{resultReview ? extremeIntelWithheld ? "敵情図は公開済み情報のみ。LOGと自軍損害を照合できます。" : "敵情図とLOGも切り替えて確認できます。" : phase === "review" ? `「戦闘記録へ記載」で損害報告を確定し、${controlStation.japanese}へ復帰します。` : "自軍戦術図ボタンでいつでも確認できます。"}</small>
            </div>
          )}
          <div className="canvas-wrap">
            <canvas
              ref={playerCanvas}
              className={"board-canvas " + (locked ? "locked" : "")}
              aria-label="自軍戦術図8×8盤面"
              onPointerMove={onMove}
              onPointerDown={(event) => onBoardPointer("player", event)}
              onPointerUp={onPointerRelease}
              onPointerCancel={onPointerRelease}
              onContextMenu={(event) => {
                event.preventDefault();
                if (phase === "placement") rotatePlacement();
              }}
            />
            <div className="radar-line" />
          </div>
      <div className="fleet-row">{playerFleet.map((id) => shipCard(player.current, id, { selectable: phase === "placement" && !missionRule }))}</div>
        </section>

        <section className={"tactical-panel enemy-board " + (compactViewport && visibleBoard !== "enemy" ? "mobile-hidden" : "")}>
          <div className="panel-head"><h2>HOSTILE CONTACT PLOT // 敵情図</h2><span>CONTACT GRID</span></div>
          {phase !== "placement" && (
            <div className={"enemy-command-help " + (ready ? "armed" : "")} aria-live="polite">
              <div>
                <span>SELECTED WEAPON</span>
                <strong>{resultReview ? extremeIntelWithheld ? "再挑戦情報保全" : phase === "defeat" ? "交戦後情報解析" : "敵艦隊撃破" : selectedMeta.label}</strong>
                <em>{resultReview ? extremeIntelWithheld ? "未確認配置 WITHHELD" : "残存 " + enemyAlive : weapon === "fire" ? "使用回数 ∞" : selectedState.status}</em>
              </div>
              <p>{resultReview ? extremeIntelWithheld ? "公開済みの着弾・識別・聴音記録のみを表示します。" : phase === "defeat" ? "作戦終了後に確定した敵艦隊配置です。" : "最終攻撃結果と敵艦隊の配置を確認できます。" : selectedMeta.help}</p>
              <small>
                {resultReview
                  ? extremeIntelWithheld ? "未確認の敵配置は、同一状況への再挑戦資格を保つため開示しません。" : "自軍戦術図またはLOGから作戦全体を振り返れます。"
                  : phase === "enemy"
                  ? "敵攻撃中。自軍戦術図で着弾を確認してください。"
                  : phase === "review"
                    ? "損害報告作成中。自軍戦術図の着弾・損傷を確認してください。"
                  : !selectedState.available
                    ? selectedState.reason
                    : weapon === "sparrow" && picked.length && previewTargets.length !== 4
                      ? "散布界が盤外です。90°回転または照準変更を行ってください。"
                    : ready
                      ? "照準確定。" + confirmLabel + "ボタンで実行します。"
                      : picked.length
                        ? "目標選択 " + picked.length + "/" + targetRequirement + "。残りの目標を選んでください。"
                        : "敵情図をタップして" + selectedMeta.requirement + "を選んでください。"}
              </small>
            </div>
          )}
          <div className="canvas-wrap">
            <canvas
              ref={enemyCanvas}
              className={"board-canvas " + (locked ? "locked" : "")}
              aria-label="敵情図8×8盤面"
              onPointerMove={onMove}
              onPointerDown={(event) => onBoardPointer("enemy", event)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (phase === "player" && weapon === "sparrow") rotateStraddleAim();
              }}
            />
            <div className="radar-line" />
          </div>
          <div className="fleet-row">{enemyContactOrder.map((id, index) => shipCard(enemy.current, id, {
            concealDamage: identificationRules && (!(phase === "defeat" && resultReview) || extremeIntelWithheld),
            concealIdentity: identificationRules && (!(phase === "defeat" && resultReview) || extremeIntelWithheld),
            identified: enemyIdentified.includes(id),
            contactIndex: index,
          }))}</div>
        </section>
        </div>
        {difficulty && (!result || resultReview) && (
          <aside className="desktop-command-rail" aria-label="戦術指揮卓">
            {phase === "placement" ? (
              <section className="placement-tools rail-placement-tools" aria-label={missionRule ? "限定任務作戦資料" : "艦隊配置指揮卓"}>
                {renderPlacementControls("rail")}
              </section>
            ) : phase === "review" ? (
              <section className="rail-report">
                <span>DAMAGE REPORT / CIC LOG</span>
                <b>損害報告を戦闘記録へ反映</b>
                <p>自軍戦術図の着弾・損傷・識別警告を報告へ記載します。</p>
                <button className="cmd primary review-confirm" onClick={continueToPlayer}><b>戦闘記録へ記載</b><small>FILE DAMAGE REPORT / {controlStation.japanese}へ復帰</small></button>
              </section>
            ) : resultReview ? (
              <button className="cmd primary" onClick={() => setResultReview(false)}><b>結果画面へ戻る</b><small>作戦報告を表示</small></button>
            ) : (
              <>
                <section className="rail-command-detail">
                  <span>SELECTED SYSTEM</span><b>{displayedMeta.label}</b><em>{displayedPattern} / {displayedState.status}</em>
                  <p>{displayedState.available ? displayedState.reason || displayedMeta.help : displayedState.reason}</p>
                </section>
                <section className="command-deck rail-command-deck">{renderWeaponControls()}</section>
                <div className="battle-log rail-log">
                  <span>CIC EVENT LOG / ZULU TIME / ENTRIES {logs.length}</span>
                  <ol>{[...logs].reverse().map((entry) => <li key={entry.id} className={`${entry.tone} ${entry.kind}`}><time>{formatZulu(entry.at)}</time><span>{entry.text}</span></li>)}</ol>
                </div>
              </>
            )}
          </aside>
        )}
      </div>


      {phase === "placement" ? (
        <section className="placement-tools compact-placement-bottom">
          {renderPlacementControls("bottom")}
        </section>
      ) : phase === "review" ? (
        <section className="turn-review compact-command-bottom" aria-label="損害報告">
          <div>
            <span>DAMAGE REPORT / CIC LOG</span>
            <b>着弾・損傷情報を報告へ反映</b>
            <small>警告と戦闘ログは、記録への記載まで保持されます。</small>
          </div>
          <button className="cmd primary review-confirm" onClick={continueToPlayer}>
            <b>戦闘記録へ記載</b><small>FILE DAMAGE REPORT / {controlStation.japanese}へ復帰</small>
          </button>
        </section>
      ) : !result ? (
        <>
          <section className="command-deck compact-command-bottom">
            <div className={"weapon-peek " + (weaponPeek ? "visible" : "")} aria-live="polite">
              <span>SYSTEM STATUS</span><b>{displayedMeta.label}</b>
              <em>{displayedPattern} / {displayedState.status}</em>
              <small>{displayedState.available ? displayedState.reason || displayedMeta.help : displayedState.reason}</small>
            </div>
            {weaponOrder.map((id, index) => {
              const state = weaponState(id);
              return (
                <button
                  key={id}
                  className={"cmd " + (!state.available ? "unavailable " : "") + (weapon === id ? "selected" : "")}
                  onClick={() => selectWeapon(id)}
                  disabled={phase !== "player" || locked}
                  aria-disabled={!state.available || phase !== "player" || locked}
                  aria-pressed={weapon === id}
                  aria-label={`${index + 1} / ${WEAPON_META[id].label}。${state.status}`}
                  onPointerEnter={() => showWeaponPeek(id)}
                  onPointerDown={() => showWeaponPeek(id)}
                  onFocus={() => showWeaponPeek(id)}
                  title={state.reason || WEAPON_META[id].help}
                >
                  <b aria-hidden="true">
                    <span className="weapon-label-full">{index + 1} / {WEAPON_META[id].label}</span>
                    <span className="weapon-label-compact"><i>{index + 1}</i>{WEAPON_META[id].compactLabel}</span>
                  </b><small>{state.status}</small>
                </button>
              );
            })}
            <div className="action-cluster">
              <button className="cmd cancel-command" onClick={cancelAim} disabled={locked || !picked.length}>
                <b>CANCEL</b><small>照準解除 / ESC</small>
              </button>
              <button className={"cmd confirm " + (ready ? "ready" : "")} onClick={() => void confirmAction()} disabled={!ready || locked}>
                <b>{confirmLabel}</b><small>{picked.length} / {targetRequirement} SELECTED</small>
              </button>
            </div>
          </section>
          <section className="ops-lower compact-command-bottom">
            <div className="command-detail">
              <span>SELECTED SYSTEM</span>
              <h3>{displayedMeta.label}</h3>
              <p>{displayedMeta.help}</p>
              <small>{displayedPattern} / {displayedState.status}<br />{displayedState.available ? displayedState.reason || displayedMeta.requirement + "を選択後、実行ボタンで確定。" : displayedState.reason}</small>
            </div>
          <div className="battle-log">
              <span>CIC EVENT LOG / ZULU TIME / ENTRIES {logs.length}</span>
              <ol>{[...logs].reverse().map((entry) => <li key={entry.id} className={`${entry.tone} ${entry.kind}`}><time>{formatZulu(entry.at)}</time><span>{entry.text}</span></li>)}</ol>
            </div>
          </section>
          <div className="legend compact-command-bottom">
            <span><i className="miss" />MISS</span><span><i className="echo" />ECHO</span><span><i className="hit" />HIT</span><span><i className="sunk" />SUNK</span>
            {enemy.current.shots.some((row) => row.includes("lost")) && <span className="last-contact-legend">◇ LAST KNOWN CONTACT</span>}
            {enemy.current.radarScans.length > 0 && <><span className="radar-contact-legend">◌ SONAR CONTACT</span><span className="radar-clear-legend">□ NO CONTACT</span></>}
            {identificationRules && <span className="critical-legend">◆ IMPORTANT SECTION / IDENTIFIED</span>}
            {enemyWakes.length > 0 && <span><i className="wake" />潜水艦音紋</span>}
          </div>
        </>
      ) : null}

      {result && resultReview && (
        <section className="result-review-bar compact-command-bottom" aria-label="最終戦況確認">
          <div><span>{extremeIntelWithheld ? "INTELLIGENCE WITHHELD" : phase === "defeat" ? "POST-ENGAGEMENT INTELLIGENCE" : "TACTICAL PLOT REVIEW"}</span><b>{extremeIntelWithheld ? "再挑戦資格保全：公開情報のみ" : phase === "defeat" ? "交戦後解析：敵配置確認" : "最終戦況を確認中"}</b><small>{extremeIntelWithheld ? "自軍損害・公開済み敵情・LOGを照合できます。" : "自軍戦術図・敵情図・LOGを確認できます。"}</small></div>
          <button className="cmd primary" onClick={() => setResultReview(false)}><b>結果画面へ戻る</b><small>作戦報告を表示</small></button>
        </section>
      )}

      {flash && <div className={"turn-flash " + flash}><div><strong>{flash === "player" ? "AWAITING ORDERS" : "HOSTILE ACTION"}</strong><small>{flash === "player" ? "指令待機" : "敵攻撃"}</small></div></div>}
      {radarAlert && <div className={"radar-result " + (radarAlert.contact ? "contact" : "clear") + (radarAlert.hostile ? " hostile" : "")} role="status" aria-live="assertive" aria-atomic="true">
        <small>{radarAlert.hostile ? radarAlert.contact ? "HOSTILE SONAR CONTACT" : "HOSTILE PASSIVE SONAR" : "PASSIVE SONAR LISTENING"}</small>
        <b>{radarAlert.hostile ? radarAlert.contact ? "FLEET DETECTED" : "NO CONTACT" : radarAlert.contact ? "CONTACT!" : "NO CONTACT"}</b>
        <span>{radarAlert.hostile
          ? radarAlert.contact ? "敵聴音が自軍艦隊を捕捉。敵追跡データへ登録。" : "敵聴音による捕捉なし。自軍反応は追跡されず。"
          : radarAlert.contact ? "指定4区画内に未破壊艦区画の音響反応あり" : "指定4区画内に反応なし"}</span>
      </div>}
      {diveAlert && <div className="dive-alert" role="status" aria-live="assertive">
        <small>— SILENT RUNNING —</small><b>静粛移動</b><span>SONAR CONTACT LOST / {diveAlertCallsign}、発砲せず追跡圏から離脱。</span>
      </div>}
      {identificationAlert && (() => {
        const definition = SHIPS.find((ship) => ship.id === identificationAlert.id)!;
        return <div className={"identification-alert " + (identificationAlert.hostile ? "hostile persistent" : "friendly")} role="alert">
          <b>{identificationAlert.hostile ? "IMPORTANT SECTION HIT" : "CONTACT IDENTIFIED"}</b>
          <span>{identificationAlert.hostile ? "敵に識別されました：" : "敵艦識別："}{definition.name} / {definition.code}</span>
        </div>;
      })()}

      {logOpen && (
        <div className="log-drawer-backdrop" onClick={() => setLogOpen(false)}>
          <section className="log-drawer" role="dialog" aria-modal="true" aria-label="CIC交戦経過記録" onClick={(event) => event.stopPropagation()}>
            <header><div><span>CIC EVENT LOG / ZULU TIME / ENTRIES {logs.length}</span><b>CIC交戦経過記録</b></div><button onClick={() => setLogOpen(false)} aria-label="交戦経過記録を閉じる">×</button></header>
            {missionRule?.category === "archive" && missionRule.archiveLog && renderArchiveEntries(missionRule.archiveLog)}
            <ol>{[...logs].reverse().map((entry) => <li key={entry.id} className={`${entry.tone} ${entry.kind}`}><time>{formatZulu(entry.at)}</time><span>{entry.text}</span></li>)}</ol>
          </section>
        </div>
      )}

      {!difficulty && !missionLibraryOpen && (
        <div className="difficulty-modal">
          <section className="difficulty-card" role="dialog" aria-modal="true" aria-labelledby="operation-mode-title">
            <div className="eyebrow">SELECT OPERATION MODE</div>
            <h2 id="operation-mode-title">OPERATION MODE</h2>
            <p>継続海域、累積損耗、固定状況の限定任務から航路を選択します。敵指揮系統は、いずれも実際に得た情報だけで判断します。</p>
            <div className="difficulty-options">
              <button className="mode-button" onClick={() => startCampaign("casual")}>
                <span>CASUAL</span><b>自軍先攻・情報公開</b><small>敵艦種と損傷を常に表示。重要区画と識別処理は使用せず、基本の索敵・追撃を楽しむ標準モードです。</small>
              </button>
              <button className="mode-button tactics" onClick={() => startCampaign("tactics")}>
                <span>TACTICS</span><b>敵先制・重要区画識別</b><small>敵艦はUNKNOWN CONTACT表示。重要区画へ命中すると艦種・コードだけを識別できます。耐久・向き・未命中区画は非公開です。</small>
              </button>
              <button className="mode-button survival" onClick={() => startCampaign("survival")}>
                <span>SURVIVAL</span><b>4作戦・TACTICS＋艦隊損耗</b><small>全6隻で二重護衛網、砲戦、SEA BAT、最終海域へ挑戦。作戦後に生存艦と兵装は回復しますが、撃沈艦は戻りません。リトライを含む全被害を作戦記録へ残します。</small>
              </button>
              <button className="mode-button mission" onClick={() => openMissionLibrary("tactical")}>
                <span>MISSION</span><b>{MISSION_LIBRARY.length}任務・自由選択</b><small>{missionLibraryFor("standard").length}戦術課題、{missionLibraryFor("archive").length}戦闘記録解析、{missionLibraryFor("extreme").length}極限任務。固定状況と指令制限を読み、任意の任務へ挑戦します。</small>
              </button>
              <button className="mode-button training" onClick={() => openMissionLibrary("training")}>
                <span>INITIAL TRAINING</span><b>6教程・何度でも再受講</b><small>通常射撃、四方反響、船影復元、護衛連接、戦艦射撃、潜水艦の音紋と受動聴音を固定教材で確認します。誤指令は行動・弾薬を消費しません。</small>
              </button>
            </div>
            <details className="identification-rules">
              <summary><span>◆ IMPORTANT SECTION / 重要区画</span><small>識別戦ルール</small></summary>
              <ul>
                <li><b>対象：</b>TACTICS、SURVIVAL、MISSION、INITIAL TRAINING。各艦に1区画設定されます。</li>
                <li><b>自軍：</b>◆を常時表示。敵弾が命中すると敵指揮系統に艦種を識別されます。</li>
                <li><b>敵軍：</b>重要区画は見えません。命中時にその座標へ菱形と艦種略号を記録します。</li>
                <li><b>開示：</b>艦種とコードのみ。耐久、向き、残り区画は開示しません。</li>
                <li><b>威力：</b>重要区画でも追加ダメージなし。敵指揮系統も同じ条件で、未探知位置は把握しません。</li>
                <li><b>潜水艦：</b>1区画艦のため、命中・識別・撃沈が同時に発生します。</li>
              </ul>
            </details>
          </section>
        </div>
      )}

      {!difficulty && missionLibraryOpen && (
        <div className="difficulty-modal mission-library-modal">
          <section className="mission-library" role="dialog" aria-modal="true" aria-labelledby="mission-library-title">
            <header className="mission-library-head">
              <button className="mission-library-back" onClick={() => setMissionLibraryOpen(false)}><span>‹</span><b>MODE SELECT</b></button>
              <div><span>{missionLibrarySection === "training" ? "SELECT TRAINING DIRECTIVE" : "SELECT AUTHORIZED OPERATION"}</span><h2 id="mission-library-title">{missionLibrarySection === "training" ? "INITIAL TRAINING" : "MISSION INDEX"}</h2><p>{missionLibrarySection === "training" ? "教程は任意選択・再受講可能。説明は平易に、指揮表示はCIC様式で統一しています。" : "全任務を自由選択。制限・配備・敵情開示を確認して出撃してください。"}</p></div>
              <div className="mission-library-progress"><b>{missionLibrarySection === "training" ? trainingCompletedCount : missionCompletedCount} / {missionLibrarySection === "training" ? TRAINING_STAGES.length : MISSION_LIBRARY.length}</b><small>{missionLibrarySection === "training" ? "LESSONS COMPLETE" : "MISSIONS CLEARED"}</small></div>
            </header>
            <nav className="mission-library-tabs" aria-label="任務分類">
              {missionLibrarySection === "training" ? <>
                <button aria-pressed="true" className="active training-tab"><b>INITIAL TRAINING</b><small>初任訓練 / {TRAINING_STAGES.length}</small></button>
                <button aria-pressed="false" onClick={() => selectMissionLibrarySection("tactical")}><b>MISSION INDEX</b><small>限定任務へ切替</small></button>
              </> : <>
                <button aria-pressed={missionLibrarySection === "tactical"} className={missionLibrarySection === "tactical" ? "active" : ""} onClick={() => selectMissionLibrarySection("tactical")}>
                  <b>TACTICAL OPERATIONS</b><small>戦術課題 / {missionLibraryFor("standard").length}</small>
                </button>
                <button aria-pressed={missionLibrarySection === "archive"} className={missionLibrarySection === "archive" ? "active" : ""} onClick={() => selectMissionLibrarySection("archive")}>
                  <b>ARCHIVE OPERATIONS</b><small>戦闘記録 / {missionLibraryFor("archive").length}</small>
                </button>
                <button aria-pressed={missionLibrarySection === "extreme"} className={missionLibrarySection === "extreme" ? "active" : ""} onClick={() => selectMissionLibrarySection("extreme")}>
                  <b>EXTREME OPERATIONS</b><small>極限任務 / {missionLibraryFor("extreme").length}</small>
                </button>
                <button aria-pressed="false" onClick={() => selectMissionLibrarySection("training")}><b>TRAINING</b><small>初任訓練へ</small></button>
              </>}
            </nav>
            <nav className="mission-library-filters" aria-label="達成状況で任務を絞り込む">
              <button aria-pressed={missionCompletionFilter === "all"} className={missionCompletionFilter === "all" ? "active" : ""} onClick={() => setMissionCompletionFilter("all")}><b>ALL</b><small>{sectionMissionChoices.length}</small></button>
              <button aria-pressed={missionCompletionFilter === "uncleared"} className={missionCompletionFilter === "uncleared" ? "active" : ""} onClick={() => setMissionCompletionFilter("uncleared")}><b><i aria-hidden="true">○</i> UNCLEARED</b><small>{sectionMissionChoices.length - sectionClearedCount}</small></button>
              <button aria-pressed={missionCompletionFilter === "cleared"} className={missionCompletionFilter === "cleared" ? "active" : ""} onClick={() => setMissionCompletionFilter("cleared")}><b><i aria-hidden="true">✓</i> CLEARED</b><small>{sectionClearedCount}</small></button>
            </nav>
            <div className="mission-library-band">
              {missionLibrarySection === "training"
                ? <><b>INITIAL TRAINING</b><span>説明は平易な日本語、指令表示はCIC様式。誤操作は消費なしで再指示します。</span></>
                : missionLibrarySection === "extreme"
                  ? <><b>EXTREME OPERATIONS</b><span>公開情報だけで解ける最難関任務。カンニングなし、余剰指令なし。</span></>
                : missionLibrarySection === "archive"
                ? <><b>ARCHIVE REVIEW</b><span>ヒントは作戦日誌のみ。LOGと現状を照合し、射撃解を復元せよ。</span></>
                : <><b>TACTICAL EXERCISE</b><span>低難度から高難度まで、索敵・火力配分・護衛連接を重複なく訓練。</span></>}
            </div>
            <div className="mission-card-grid" aria-live="polite">
              {missionChoices.length > 0
                ? missionChoices.map(renderMissionCard)
                : <div className="mission-library-empty"><b>NO MATCHING OPERATIONS</b><span>この区分に該当する任務記録はありません。</span></div>}
            </div>
          </section>
        </div>
      )}

      {result && !resultReview && (
        <div className="result-modal">
          <section className={"result-card " + (phase === "defeat" ? "loss" : "")} role="dialog" aria-modal="true" aria-labelledby="result-title">
            <div className="eyebrow">{currentUnitEnglish} AFTER ACTION REPORT</div>
            <h2 id="result-title">{difficulty === "training"
              ? phase === "victory" ? campaignClear ? "TRAINING COMPLETE" : "LESSON COMPLETE" : "TRAINING HOLD"
              : difficulty === "mission"
              ? phase === "victory" ? "MISSION ACCOMPLISHED" : "OBJECTIVE NOT ACHIEVED"
              : difficulty === "survival"
                ? campaignClear ? "SURVIVAL COMPLETE" : phase === "victory" ? "OPERATION COMPLETE" : "OPERATION ABORTED"
                : campaignClear ? "CAMPAIGN COMPLETE" : phase === "victory" ? "SECTOR SECURED" : "OPERATION ABORTED"}</h2>
            <p>
              {difficulty === "training"
                ? phase === "victory" ? missionEndReport : "訓練条件を満たしていません。同一教材を再読込して手順を確認してください。"
                : difficulty === "mission"
                ? missionEndReport
                : campaignClear
                ? difficulty === "survival" ? "残存艦隊、全4作戦を突破。SURVIVAL作戦完了。" : "全6海域の敵性脅威を排除。DEEP BLUE GRID 作戦完了。"
                : phase === "victory"
                  ? "敵艦隊、戦闘能力喪失。対象海域の敵性脅威を排除。次海域への進出可。"
                  : "自軍艦隊、戦闘能力喪失。戦闘記録に基づく指揮所見を表示します。"}
            </p>
            <div className="operation-time" aria-label="交戦時刻">
              <div><span>ENGAGEMENT START</span><b>{formatZulu(operationStart)}</b><small>JST {formatJapan(operationStart)}</small></div>
              <div><span>ENGAGEMENT END</span><b>{formatZulu(operationEnd ?? operationStart)}</b><small>JST {formatJapan(operationEnd ?? operationStart)}</small></div>
              <div><span>{difficulty === "mission" || difficulty === "training" ? "ACTIVE REVIEW" : "ELAPSED"}</span><b>{difficulty === "mission" || difficulty === "training" ? formatOperationDuration(missionElapsedMs) : formatElapsed(operationStart, operationEnd ?? operationStart)}</b><small>{difficulty === "mission" || difficulty === "training" ? "VISIBLE TIME ONLY" : "HOURS : MINUTES"}</small></div>
            </div>
            <div className="stats">
              <div>FRIENDLY ACTIONS<b>{stats.turns}</b></div>
              <div>{missionRule?.objective.kind === "sonar-reports" || missionRule?.objective.kind === "scan-and-destroy" ? "REPORTS FILED" : "STRIKE ACCURACY"}<b>{missionRule?.objective.kind === "sonar-reports" || missionRule?.objective.kind === "scan-and-destroy" ? missionSonarReportCount : `${stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0}%`}</b></div>
              <div>HOSTILE SHIPS NEUTRALIZED<b>{stats.sunk} / {enemyFleet.length}</b></div>
              <div>SPECIAL SYSTEM USES<b>{stats.specials}</b></div>
              <div>DAMAGE SUSTAINED<b>{stats.damage} / {fleetCells}</b></div>
              <div>{progressUnit.english}<b>{stageIndex + 1} / {activeStages.length}</b></div>
              {difficulty === "survival" && <div>SURVIVORS<b>{player.current.ships.filter((ship) => !ship.sunk).length} / {playerFleet.length}</b></div>}
              {difficulty === "survival" && <div>SHIPS LOST<b>{player.current.ships.filter((ship) => ship.sunk).length}</b></div>}
            </div>
            {campaignClear && difficulty === "survival" && operationRecord && (
              <section className="operation-record" aria-label="サバイバル作戦記録">
                <header><span>OPERATION RECORD</span><b>全4作戦・航海記録</b></header>
                <div className="operation-record-summary">
                  <div><span>ACTIVE TIME</span><b>{formatOperationDuration(operationRecord.activeMs)}</b></div>
                  <div><span>TOTAL DAMAGE</span><b>{operationRecord.damage}</b></div>
                  <div><span>RETRIES</span><b>{operationRecord.retries}</b></div>
                  <div><span>FINAL FORCE</span><b>{finalSurvivors.length}艦 / {finalHullSections}区画</b></div>
                  <div><span>STRIKE ACCURACY</span><b>{operationRecord.shots ? Math.round(operationRecord.hits / operationRecord.shots * 100) : 0}%</b></div>
                  <div><span>ENGAGEMENTS</span><b>{operationRecord.engagements}</b></div>
                </div>
                <details>
                  <summary>作戦別記録 / OPERATION BREAKDOWN</summary>
                  <ol>
                    {operationRecord.stages.map((item) => (
                      <li key={item.ordinal}>
                        <span>{String(item.ordinal).padStart(2, "0")} / {item.title}</span>
                        <b>{formatOperationDuration(item.activeMs)}　被害 {item.damage}　再出撃 {item.retries}</b>
                        <small>交戦 {item.engagements} / 行動 {item.turns} / 命中 {item.hits}/{item.shots} / 損失 {item.losses.length}</small>
                      </li>
                    ))}
                  </ol>
                </details>
              </section>
            )}
            {(difficulty === "mission" || difficulty === "training") && missionEndReport && <section className="mission-end-report" aria-label={difficulty === "training" ? "訓練判定" : "限定任務判定"}>
              <header><span>{difficulty === "training" ? "TRAINING REPORT" : "MISSION OUTCOME"}</span><b>{phase === "victory" ? difficulty === "training" ? "教程修了" : "任務達成" : difficulty === "training" ? "訓練未修了" : "任務条件未達"}</b></header>
              <p>{missionEndReport}</p>
              <small>指令使用 {stats.turns} / {missionRule?.objective.maxFriendlyActions ?? 0}　開始時損傷 {missionRule?.playerInitialHits?.length ?? 0}区画　交戦中被害 {stats.damage}区画</small>
            </section>}
            {difficulty === "training" && phase === "victory" && missionRule?.training && <section className="training-debrief" aria-label="教程確認事項">
              <header><span>LESSON DEBRIEF</span><b>確認事項</b></header>
              <ul>{missionRule.training.debrief.map((line) => <li key={line}>{line}</li>)}</ul>
            </section>}
            {difficulty === "mission" && (
              <section className="mission-record-panel" aria-label="限定任務記録">
                <header><span>LOCAL MISSION RECORD</span><b>この端末の達成記録</b></header>
                <div>
                  <p><span>CURRENT</span><b>{stats.turns} ORDERS</b><small>{formatOperationDuration(missionElapsedMs)}</small></p>
                  <p><span>FEWEST</span><b>{activeMissionRecord ? `${activeMissionRecord.fewestCommands} ORDERS` : "—"}</b><small>最少指令</small></p>
                  <p><span>FASTEST</span><b>{activeMissionRecord ? formatOperationDuration(activeMissionRecord.fastestActiveMs) : "—"}</b><small>最短活動時間</small></p>
                  <p><span>CLEARS</span><b>{activeMissionRecord?.clearCount ?? 0}</b><small>達成回数</small></p>
                </div>
                {missionRecordUpdate && phase === "victory" && (
                  <footer>
                    {missionRecordUpdate.firstClear && <em>FIRST CLEAR</em>}
                    {missionRecordUpdate.fewestCommandsImproved && <em>NEW ORDER RECORD</em>}
                    {missionRecordUpdate.fastestTimeImproved && <em>NEW TIME RECORD</em>}
                  </footer>
                )}
              </section>
            )}
            {assessment && <section className="command-assessment" aria-label="指揮所見">
              <header><span>COMMAND ASSESSMENT</span><b>指揮所見</b></header>
              <dl>{assessment.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
              <p><span>所見</span>{assessment.finding}</p>
            </section>}
            <div className="result-actions">
              <button className="cmd open-operation-log" onClick={() => setLogOpen(true)}>
                <b>FULL ENGAGEMENT LOG</b>
                <small>{difficulty === "survival" ? "全作戦・全交戦記録を表示" : difficulty === "mission" ? "作戦日誌・当該任務の交戦記録を表示" : difficulty === "training" ? "当該教程の操作記録を表示" : "全海域・全交戦記録を表示"}</small>
              </button>
              <button className="cmd review-battlefield" onClick={() => { setVisibleBoard("player"); setResultReview(true); }}>
                <b>{isExtremeDefeat ? "POST-ENGAGEMENT REVIEW" : phase === "defeat" ? "POST-ENGAGEMENT INTELLIGENCE" : "TACTICAL PLOT REVIEW"}</b>
                <small>{isExtremeDefeat ? "公開情報のみ解析・未確認配置は秘匿" : phase === "defeat" ? "交戦後解析：敵配置確認" : "最終戦況・交戦記録を確認"}</small>
              </button>
              <button className="cmd primary" onClick={advanceFromResult}>
                <b>{difficulty === "training"
                  ? phase === "victory" ? hasNextTrainingLesson ? "NEXT LESSON" : "TRAINING INDEX" : "RETRY LESSON"
                  : difficulty === "mission"
                  ? phase === "victory" ? "MISSION INDEX" : "RETRY MISSION"
                  : phase === "victory"
                  ? campaignClear
                    ? "MODE SELECT"
                    : difficulty === "survival" ? "NEXT OPERATION" : "NEXT SECTOR"
                  : difficulty === "survival" ? "RETRY OPERATION" : "RETRY SECTOR"}</b>
                <small>{difficulty === "training"
                  ? phase === "victory" ? hasNextTrainingLesson ? missionFor("training", activeStages[nextTrainingIndex]).title : trainingAllComplete ? "全教程修了・教程一覧へ" : "教程一覧へ戻る" : "同一教材を再読込"
                  : difficulty === "mission"
                  ? phase === "victory" ? "任務一覧へ戻る" : "同一状況を再読込"
                  : campaignClear
                  ? "作戦モード選択へ戻る"
                  : phase === "victory"
                    ? missionFor(activeMode, activeStages[stageIndex + 1]).title
                    : difficulty === "survival"
                      ? "現在の残存艦隊で再配置"
                      : "艦隊を再配置"}</small>
              </button>
              {(difficulty === "mission" || difficulty === "training") && (
                <button className="cmd mission-list-action" onClick={phase === "victory" ? retryCurrentStage : returnToMissionLibrary}>
                  <b>{phase === "victory" ? difficulty === "training" ? "REPEAT LESSON" : "RETRY FOR RECORD" : difficulty === "training" ? "TRAINING INDEX" : "MISSION INDEX"}</b>
                  <small>{phase === "victory" ? difficulty === "training" ? "同じ教程を再受講" : "同一状況で記録更新へ" : difficulty === "training" ? "教程一覧へ戻る" : "任務一覧へ戻る"}</small>
                </button>
              )}
              {phase === "defeat" && (
                <button
                  className={"cmd withdraw-action" + (withdrawArmed ? " armed" : "")}
                  onClick={withdrawToModeSelect}
                >
                  <b>{withdrawArmed ? "本当に撤退しますか？もう一度押す" : "WITHDRAW"}</b>
                  <small>{withdrawArmed ? "進行状況を破棄してモード選択へ" : "作戦を終了し、モード選択へ戻る"}</small>
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
