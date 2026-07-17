"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CELL_LABELS,
  GAME_TITLE,
  SHIPS,
  STAGES,
  WEAPON_MAX,
  type Coord,
  type Orientation,
  type ShipId,
  type WeaponId,
} from "./constants.ts";
import {
  Arsenal,
  Board,
  SeededRandom,
  harpoonCells,
  radarCells,
  type AttackResult,
} from "./engine.ts";
import { EnemyAI } from "./EnemyAI.ts";
import { AudioManager } from "./AudioManager.ts";
import { drawBoard, pointerToCoord } from "./Renderer.ts";
import { nextSubmarineWake } from "./SubmarineWake.ts";

type Phase = "placement" | "player" | "enemy" | "review" | "victory" | "defeat";
type Difficulty = "casual" | "tactics";
type Stats = { turns: number; shots: number; hits: number; sunk: number; specials: number; damage: number };
type LogEntry = { id: number; text: string; tone: "info" | "good" | "bad" };
type ShipCardOptions = { selectable?: boolean; concealDamage?: boolean };
type PlacementGesture = { pointerId: number; offset: Coord; origin: Coord; moved: boolean; confirm: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const coordName = (coord: Coord) => CELL_LABELS[coord.y] + "-" + (coord.x + 1);
const sameCoord = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;
const freshStats = (): Stats => ({ turns: 0, shots: 0, hits: 0, sunk: 0, specials: 0, damage: 0 });
const difficultySkill = (base: number, difficulty: Difficulty) => base * (difficulty === "tactics" ? 1.7 : 1.38);

const WEAPON_META: Record<WeaponId, { label: string; carrier?: ShipId; help: string; requirement: string }> = {
  fire: { label: "通常砲撃", help: "敵海域の1マスを攻撃します。", requirement: "目標 1" },
  phantom: { label: "F-4 PHANTOM", carrier: "carrier", help: "異なる4マスへ航空攻撃を行います。", requirement: "目標 4" },
  harpoon: { label: "HARPOON", carrier: "battleship", help: "照準を中心にX字5マスを攻撃します。", requirement: "中心 1" },
  sparrow: { label: "SEA SPARROW", carrier: "cruiser", help: "2×2の4マスを同時攻撃します。", requirement: "左上 1" },
  mk45: { label: "MK-45 II", carrier: "destroyer", help: "異なる2マスを連続攻撃します。", requirement: "目標 2" },
  radar: { label: "SPS-10 RADAR", carrier: "submarine", help: "2×2内の生存艦反応だけを調べます。ダメージはありません。", requirement: "左上 1" },
};

export function DeepBlueGrid() {
  const seedRef = useRef(Date.now());
  const rngRef = useRef(new SeededRandom(seedRef.current));
  const player = useRef(new Board());
  const enemy = useRef(new Board());
  const arsenal = useRef(new Arsenal());
  const ai = useRef(new EnemyAI(new SeededRandom(seedRef.current ^ 0x51f15e), STAGES[0].fleet, difficultySkill(STAGES[0].aiSkill, "casual"), "casual"));
  const audio = useRef<AudioManager | null>(null);
  const playerCanvas = useRef<HTMLCanvasElement>(null);
  const enemyCanvas = useRef<HTMLCanvasElement>(null);
  const boardsRef = useRef<HTMLDivElement>(null);
  const animation = useRef(0);
  const difficultyRef = useRef<Difficulty>("casual");
  const touchPointers = useRef(new Set<number>());
  const placementGesture = useRef<PlacementGesture | null>(null);
  const touchRotated = useRef(false);
  const playerWakesRef = useRef<Coord[]>([]);
  const enemyWakesRef = useRef<Coord[]>([]);

  if (!audio.current && typeof window !== "undefined") audio.current = new AudioManager();

  const [stageIndex, setStageIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [portraitPhone, setPortraitPhone] = useState(false);
  const [visibleBoard, setVisibleBoard] = useState<"player" | "enemy">("player");
  const stage = STAGES[stageIndex];
  const [phase, setPhase] = useState<Phase>("placement");
  const [message, setMessage] = useState(stage.subtitle);
  const [selectedShip, setSelectedShip] = useState<ShipId>(stage.fleet[0]);
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [cursor, setCursor] = useState<Coord>({ x: 1, y: 2 });
  const [weapon, setWeapon] = useState<WeaponId>("fire");
  const [picked, setPicked] = useState<Coord[]>([]);
  const [locked, setLocked] = useState(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState<Coord[]>([]);
  const [flash, setFlash] = useState<"player" | "enemy" | null>(null);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState<Stats>(freshStats);
  const [logs, setLogs] = useState<LogEntry[]>([{ id: Date.now(), text: "艦隊を配置し、BATTLE STARTを押してください。", tone: "info" }]);
  const [playerWakes, setPlayerWakes] = useState<Coord[]>([]);
  const [enemyWakes, setEnemyWakes] = useState<Coord[]>([]);

  const placementPreviewActive = phase === "placement" && !player.current.ships.some((ship) => ship.id === selectedShip);

  const bump = () => setRevision((value) => value + 1);
  const addLog = (text: string, tone: LogEntry["tone"] = "info") => {
    setLogs((current) => [...current, { id: Date.now() + Math.random(), text, tone }].slice(-8));
  };

  const ownAlive = player.current.ships.filter((ship) => !ship.sunk).length;
  const enemyAlive = enemy.current.ships.filter((ship) => !ship.sunk).length;
  const fleetCells = stage.fleet.reduce((total, id) => total + SHIPS.find((ship) => ship.id === id)!.size, 0);
  const initStage = useCallback((nextStageIndex: number, nextDifficulty?: Difficulty) => {
    const nextStage = STAGES[nextStageIndex];
    const selectedDifficulty = nextDifficulty ?? difficultyRef.current;
    difficultyRef.current = selectedDifficulty;
    seedRef.current = Date.now() + nextStageIndex * 7919;
    rngRef.current = new SeededRandom(seedRef.current);
    player.current = new Board();
    enemy.current = new Board();
    arsenal.current = new Arsenal();
    ai.current = new EnemyAI(
      new SeededRandom(seedRef.current ^ 0x51f15e),
      nextStage.fleet,
      difficultySkill(nextStage.aiSkill, selectedDifficulty),
      selectedDifficulty,
    );
    playerWakesRef.current = [];
    enemyWakesRef.current = [];
    setPlayerWakes([]);
    setEnemyWakes([]);
    setStageIndex(nextStageIndex);
    setPhase("placement");
    setMessage(nextStage.subtitle);
    setSelectedShip(nextStage.fleet[0]);
    setOrientation("horizontal");
    setCursor({ x: 1, y: 2 });
    setWeapon("fire");
    setPicked([]);
    setLocked(false);
    setActive([]);
    setStats(freshStats());
    setLogs([{ id: Date.now(), text: "STAGE " + nextStage.id + "：艦隊を配置してください。", tone: "info" }]);
    bump();
  }, []);

  useEffect(() => {
    initStage(0);
  }, [initStage]);

  useEffect(() => {
    const portraitQuery = window.matchMedia("(max-width: 760px) and (orientation: portrait)");
    const updateLayout = () => setPortraitPhone(portraitQuery.matches);
    updateLayout();
    portraitQuery.addEventListener("change", updateLayout);
    return () => portraitQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!portraitPhone) return;
    setVisibleBoard(phase === "player" ? "enemy" : "player");
    if (phase !== "placement") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => boardsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
      });
    }
  }, [phase, portraitPhone]);

  const startCampaign = (selectedDifficulty: Difficulty) => {
    difficultyRef.current = selectedDifficulty;
    setDifficulty(selectedDifficulty);
    initStage(0, selectedDifficulty);
  };

  const previewTargets = useMemo(() => {
    if (!picked.length) return [];
    if (weapon === "harpoon") return harpoonCells(picked[0]);
    if (weapon === "sparrow" || weapon === "radar") return radarCells(picked[0]);
    return picked;
  }, [picked, weapon]);

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
        time,
      });
    }
    if (enemyCanvas.current) {
      drawBoard(enemyCanvas.current, enemy.current, {
        revealShips: false,
        cursor: phase === "player" && !locked ? cursor : undefined,
        weapon,
        selected: previewTargets,
        active: phase === "player" ? active : [],
        waves: enemyWakes,
        time,
      });
    }
  }, [phase, cursor, selectedShip, orientation, weapon, previewTargets, active, locked, placementPreviewActive, playerWakes, enemyWakes, revision]);

  useEffect(() => {
    animation.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animation.current);
  }, [render]);

  const randomize = () => {
    player.current.randomize(rngRef.current, stage.fleet);
    setSelectedShip(stage.fleet[0]);
    setMessage("配置完了。艦隊カードと海図を確認して戦闘を開始してください。");
    addLog("自動配置を実行しました。");
    audio.current?.confirm();
    bump();
  };

  const clearPlacement = () => {
    player.current.reset();
    setSelectedShip(stage.fleet[0]);
    setOrientation("horizontal");
    setCursor({ x: 1, y: 2 });
    setMessage("配置を初期化しました。艦を選び直してください。");
    addLog("配置を初期化しました。");
    audio.current?.cancel();
    bump();
  };

  const emitEnemySubmarineWake = () => {
    const wake = nextSubmarineWake(enemy.current, enemyWakesRef.current, rngRef.current);
    if (!wake || enemyWakesRef.current.some((seen) => sameCoord(seen, wake))) return;
    enemyWakesRef.current = [...enemyWakesRef.current, wake];
    setEnemyWakes(enemyWakesRef.current);
    addLog("音紋反応：敵潜水艦の周辺に波紋を検知。", "good");
  };

  const emitPlayerSubmarineWake = () => {
    const wake = nextSubmarineWake(player.current, playerWakesRef.current, rngRef.current);
    if (!wake || playerWakesRef.current.some((seen) => sameCoord(seen, wake))) return;
    playerWakesRef.current = [...playerWakesRef.current, wake];
    setPlayerWakes(playerWakesRef.current);
    ai.current.observeWake(wake);
    addLog("追跡警告：自軍潜水艦の周辺に波紋が発生。", "bad");
  };

  const startBattle = () => {
    if (!player.current.allPlaced(stage.fleet)) {
      setMessage("このステージの全艦を配置してください。");
      return;
    }
    enemy.current.randomize(rngRef.current, stage.fleet);
    if (difficultyRef.current === "tactics") {
      setLocked(true);
      addLog("TACTICS：敵艦隊が先制攻撃を開始。", "bad");
      audio.current?.confirm();
      bump();
      void enemyTurn();
      return;
    }
    setPhase("player");
    setMessage("COMMAND：兵装を選び、敵海域に照準を置いてください。");
    addLog("交戦開始。先攻は自艦隊です。");
    setFlash("player");
    setTimeout(() => setFlash(null), 700);
    audio.current?.confirm();
    audio.current?.turn();
    bump();
  };

  const enemyTurn = async () => {
    setPhase("enemy");
    setFlash("enemy");
    setMessage("敵照準システム作動中…");
    audio.current?.turn(true);
    await sleep(900);
    setFlash(null);
    const decision = ai.current.decide(enemy.current);
    setMessage("ENEMY " + decision.state + "： " + decision.weapon.toUpperCase() + " LOCK");
    setActive(decision.targets);
    await sleep(750);

    if (decision.weapon === "radar") {
      audio.current?.sonar();
      const contact = player.current.radar(decision.targets[0]);
      ai.current.observeRadar(decision.targets[0], contact);
      const report = contact ? "敵レーダーが生存艦反応を捕捉。" : "敵レーダー走査：反応なし。";
      setMessage(report);
      addLog(report, contact ? "bad" : "info");
      bump();
      await sleep(900);
    } else {
      audio.current?.fire();
      const results: AttackResult[] = [];
      for (const target of decision.targets) {
        const result = player.current.attack(target);
        if (result.kind !== "ALREADY") results.push(result);
        setActive([target]);
        await sleep(260);
        if (result.kind === "HIT" || result.kind === "SUNK") audio.current?.hit();
        else audio.current?.splash();
        if (result.kind === "SUNK") audio.current?.sunk();
        bump();
      }
      ai.current.observe(results);
      const hits = results.filter((result) => result.kind === "HIT" || result.kind === "SUNK").length;
      const sunk = results.find((result) => result.kind === "SUNK");
      setStats((current) => ({ ...current, damage: current.damage + hits }));
      const report = sunk
        ? "警告：" + sunk.shipName + " 撃沈。"
        : hits
          ? "被弾 " + hits + "。敵は追撃態勢へ移行。"
          : results.some((result) => result.kind === "ECHO")
            ? "敵弾は外れたが近接反応を検知。"
            : "敵弾 MISS。損害なし。";
      setMessage(report);
      addLog(report, hits ? "bad" : "info");
      emitPlayerSubmarineWake();
    }

    setActive([]);
    bump();
    await sleep(850);
    if (player.current.allSunk()) {
      setPhase("defeat");
      audio.current?.defeat();
      setLocked(false);
      return;
    }
    setPhase("review");
    setMessage("戦況確認：敵の攻撃が終了しました。自軍艦隊の損傷を確認してください。");
  };

  const continueToPlayer = () => {
    setWeapon("fire");
    setPicked([]);
    setPhase("player");
    setFlash("player");
    setMessage("COMMAND：兵装と目標を選択してください。");
    audio.current?.turn();
    setTimeout(() => setFlash(null), 1050);
    setLocked(false);
  };

  const showBoard = (board: "player" | "enemy") => {
    setVisibleBoard(board);
    if (portraitPhone) {
      requestAnimationFrame(() => boardsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
    }
  };

  const resolvePlayerAttack = async (targets: Coord[], special = false) => {
    setLocked(true);
    setActive(targets);
    audio.current?.fire();
    await sleep(400);
    const results: AttackResult[] = [];
    for (const target of targets) {
      const result = enemy.current.attack(target);
      if (result.kind === "ALREADY") continue;
      results.push(result);
      setActive([target]);
      await sleep(220);
      if (result.kind === "HIT" || result.kind === "SUNK") audio.current?.hit();
      else audio.current?.splash();
      if (result.kind === "SUNK") audio.current?.sunk();
      bump();
    }
    const hits = results.filter((result) => result.kind === "HIT" || result.kind === "SUNK").length;
    const sunk = results.filter((result) => result.kind === "SUNK").length;
    setStats((current) => ({
      ...current,
      turns: current.turns + 1,
      shots: current.shots + results.length,
      hits: current.hits + hits,
      sunk: current.sunk + sunk,
      specials: current.specials + (special ? 1 : 0),
    }));
    const lastSunk = [...results].reverse().find((result) => result.kind === "SUNK");
    const report = lastSunk
      ? lastSunk.shipName + " — SUNK!"
      : hits
        ? "命中 " + hits + " / " + results.length + "。敵艦に損傷。"
        : results.some((result) => result.kind === "ECHO")
          ? "SONAR ECHO：近傍に生存艦反応。"
          : "MISS：反応なし。";
    setMessage(report);
    addLog(WEAPON_META[weapon].label + "： " + report, hits ? "good" : "info");
    emitEnemySubmarineWake();
    setActive([]);
    setPicked([]);
    bump();
    await sleep(850);
    if (enemy.current.allSunk()) {
      setPhase("victory");
      audio.current?.victory();
      setLocked(false);
      return;
    }
    await enemyTurn();
  };

  const targetRequirement = weapon === "phantom" ? 4 : weapon === "mk45" ? 2 : 1;
  const confirmTargets = previewTargets.filter((coord) => enemy.current.shots[coord.y]?.[coord.x] === "unknown");
  const ready = picked.length === targetRequirement && (weapon === "radar" || confirmTargets.length > 0);

  const chooseTarget = (coord: Coord) => {
    if (phase !== "player" || locked) return;
    if (weapon === "fire" && enemy.current.shots[coord.y][coord.x] !== "unknown") {
      setMessage("その座標は攻撃済みです。未攻撃のマスを選んでください。");
      audio.current?.cancel();
      return;
    }
    if (weapon === "mk45" || weapon === "phantom") {
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

  const confirmAction = async () => {
    if (!ready || locked) return;
    if (weapon === "radar") {
      if (!arsenal.current.spend("radar", player.current)) return;
      setLocked(true);
      const cells = radarCells(picked[0]);
      setActive(cells);
      audio.current?.sonar();
      await sleep(800);
      const contact = enemy.current.radar(picked[0]);
      setStats((current) => ({ ...current, turns: current.turns + 1, specials: current.specials + 1 }));
      const report = contact ? "CONTACT：2×2範囲内に生存艦反応。" : "CLEAR：2×2範囲内に反応なし。";
      setMessage(report);
      addLog("SPS-10 RADAR： " + report, contact ? "good" : "info");
      setPicked([]);
      setActive([]);
      bump();
      await sleep(950);
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
    setPicked([]);
    setWeapon(nextWeapon);
    setMessage(WEAPON_META[nextWeapon].label + "： " + WEAPON_META[nextWeapon].help);
    audio.current?.cursor();
  };

  const cancelAim = () => {
    setPicked([]);
    setMessage("照準を解除しました。兵装または目標を選び直してください。");
    audio.current?.cancel();
  };

  const clampPlacementOrigin = (shipId: ShipId, shipOrientation: Orientation, coord: Coord) => {
    const definition = SHIPS.find((ship) => ship.id === shipId)!;
    const width = shipOrientation === "horizontal" ? definition.width : definition.height;
    const height = shipOrientation === "horizontal" ? definition.height : definition.width;
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
      audio.current?.confirm();
      const next = stage.fleet.find((id) => !player.current.ships.some((placed) => placed.id === id));
      const placedName = SHIPS.find((ship) => ship.id === selectedShip)!.name;
      if (next) {
        const nextOrientation: Orientation = "horizontal";
        setSelectedShip(next);
        setOrientation(nextOrientation);
        setCursor(findPlacementStart(next, nextOrientation, coord));
        setMessage(placedName + " 配置完了。次の艦を配置してください。");
      } else {
        setMessage("全艦配置完了。BATTLE STARTで交戦を開始できます。");
      }
      bump();
    } else {
      setMessage("配置不可：盤面外、重複、または配置済みです。");
      audio.current?.cancel();
    }
  };

  const rotatePlacement = () => {
    if (!placementPreviewActive) return;
    const nextOrientation: Orientation = orientation === "horizontal" ? "vertical" : "horizontal";
    const nextCursor = player.current.canPlace(selectedShip, cursor, nextOrientation)
      ? cursor
      : findPlacementStart(selectedShip, nextOrientation, cursor);
    setOrientation(nextOrientation);
    setCursor(nextCursor);
    setMessage("艦の向きを回転しました。");
    audio.current?.cursor();
  };

  const selectPlacementShip = (shipId: ShipId) => {
    if (phase !== "placement") return;
    const placed = player.current.ships.find((ship) => ship.id === shipId);
    if (placed) {
      const start = placed.cells.reduce((best, coord) => ({ x: Math.min(best.x, coord.x), y: Math.min(best.y, coord.y) }), { x: 7, y: 7 });
      player.current.removeShip(shipId);
      setSelectedShip(shipId);
      setOrientation(placed.orientation);
      setCursor(start);
      setMessage(placed.name + "を再配置します。ドラッグで移動し、シルエットをタップして確定してください。");
      audio.current?.cursor();
      bump();
      return;
    }
    if (selectedShip === shipId) {
      rotatePlacement();
      return;
    }
    const nextOrientation: Orientation = "horizontal";
    setSelectedShip(shipId);
    setOrientation(nextOrientation);
    setCursor(findPlacementStart(shipId, nextOrientation));
    setMessage("シルエットをドラッグで移動。選択中の艦カードを再タップすると回転します。");
    audio.current?.cursor();
  };

  const onBoardPointer = (side: "player" | "enemy", event: React.PointerEvent<HTMLCanvasElement>) => {
    const coord = pointerToCoord(event.currentTarget, event.clientX, event.clientY);
    if (!coord) return;
    if (side === "player" && phase === "placement") {
      if (!placementPreviewActive) return;
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
        moved: false,
        confirm: onPreview,
      };
    } else if (side === "enemy") {
      setCursor(coord);
      chooseTarget(coord);
    }
  };

  const onPointerRelease = (event: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    if (event.pointerType === "touch") touchPointers.current.delete(event.pointerId);
    const gesture = placementGesture.current;
    if (gesture?.pointerId === event.pointerId) {
      if (!cancelled && !touchRotated.current && !gesture.moved && gesture.confirm) placeAt(gesture.origin);
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
        gesture.confirm = false;
        setCursor(origin);
      }
      return;
    }
    setCursor(coord);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      if (event.key.toLowerCase() === "m") {
        setMuted(audio.current?.toggle() ?? false);
        return;
      }
      if (event.key.toLowerCase() === "r" && phase === "placement") {
        rotatePlacement();
      }
      if (event.key === "Escape") cancelAim();
      const order: WeaponId[] = ["fire", "phantom", "harpoon", "sparrow", "mk45", "radar"];
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
  }, [phase, cursor, weapon, picked, locked, ready, selectedShip, orientation, placementPreviewActive]);

  const shipCard = (board: Board, shipId: ShipId, options: ShipCardOptions = {}) => {
    const { selectable = false, concealDamage = false } = options;
    const definition = SHIPS.find((ship) => ship.id === shipId)!;
    const ship = board.ships.find((candidate) => candidate.id === shipId);
    const revealDamage = !concealDamage || Boolean(ship?.sunk);
    return (
      <button
        key={shipId}
        className={"ship-card " + (selectable && !ship && selectedShip === shipId ? "active " : "") + (ship?.sunk ? "sunk" : "")}
        onClick={() => selectable && selectPlacementShip(shipId)}
        disabled={!selectable}
        title={definition.weapon === "NONE" ? "特殊兵装なし" : "搭載兵装：" + definition.weapon}
      >
        <strong>{definition.name} / {definition.code}</strong>
        <small>{ship?.sunk ? "LOST" : ship ? concealDamage ? "HULL DATA MASKED" : selectable ? "配置済み / タップで再配置" : "DEPLOYED" : selectable ? selectedShip === shipId ? "選択中 / 再タップで回転" : "タップして選択" : "UNKNOWN"}</small>
        <span className={"hull-meter " + (!revealDamage ? "concealed" : "")}>
          {Array.from({ length: definition.size }, (_, index) => <i key={index} className={revealDamage && ship && index < ship.hits.size ? "hit" : ""} />)}
        </span>
      </button>
    );
  };

  const weaponState = (id: WeaponId) => {
    if (id === "fire") return { available: true, status: "∞", reason: "" };
    const meta = WEAPON_META[id];
    if (!meta.carrier || !stage.fleet.includes(meta.carrier)) return { available: false, status: "未配備", reason: "搭載艦は後のステージで配備されます。" };
    if (!player.current.alive(meta.carrier)) return { available: false, status: "搭載艦喪失", reason: "搭載艦が撃沈されたため使用不能です。" };
    const uses = arsenal.current.uses[id];
    return { available: uses > 0, status: "残り " + uses + "/" + WEAPON_MAX[id], reason: uses > 0 ? "" : "このステージでの使用回数を使い切りました。" };
  };

  const result = phase === "victory" || phase === "defeat";
  const campaignClear = phase === "victory" && stageIndex === STAGES.length - 1;
  const selectedMeta = WEAPON_META[weapon];
  const selectedState = weaponState(weapon);
  const confirmLabel = weapon === "radar" ? "走査実行" : selectedMeta.label + " 発射";
  const advanceFromResult = () => {
    if (phase === "defeat") {
      initStage(stageIndex);
    } else if (campaignClear) {
      setDifficulty(null);
      initStage(0);
    } else {
      initStage(stageIndex + 1);
    }
  };

  return (
    <main className={"game-shell " + (active.length ? "shake" : "")}>
      <div className="noise" />
      <header className="masthead">
        <div>
          <div className="brand-kicker">TACTICAL SONAR / CAMPAIGN</div>
          <h1 className="brand-title" aria-label={GAME_TITLE}>DEEP <span>BLUE</span> GRID</h1>
        </div>
        <div className="phase-badge">
          <strong>{phase === "placement" ? "FLEET DEPLOY" : phase === "player" ? "COMMAND" : phase === "enemy" ? "ENEMY ACTION" : phase === "review" ? "DAMAGE REPORT" : "MISSION END"}</strong>
          <small>STAGE {stage.id} / {difficulty?.toUpperCase() ?? "SELECT MODE"}</small>
        </div>
        <div className="system-info">SEED <b>{seedRef.current.toString(16).toUpperCase()}</b><br />LINK STATUS <b>ONLINE</b></div>
      </header>

      <nav className="campaign-track" aria-label="作戦進行">
        {STAGES.map((item, index) => (
          <span key={item.id} className={index < stageIndex ? "cleared" : index === stageIndex ? "current" : ""}>
            <i>{item.id}</i><b>{item.title}</b>
          </span>
        ))}
      </nav>

      <section className={"status-strip " + (phase === "enemy" ? "enemy" : phase === "review" ? "review" : "")} aria-live="polite">
        <span className="tag">{phase === "enemy" ? "ALERT" : phase === "review" ? "REPORT" : "OPS"}</span>
        <p><b>{stage.title}</b> — {message}</p>
        <span className="turn-counter">TURN {String(stats.turns + 1).padStart(2, "0")} / OWN {ownAlive} / HOSTILE {phase === "placement" ? "?" : enemyAlive}</span>
      </section>

      <section className="quick-guide">
        <b>NAVY BLUE式 作戦要領</b>
        <span>1. 艦を選びシルエットを配置</span><span>2. 兵装と目標を選択</span><span>3. プレビューを確認して発射</span><span>4. 全区画命中で撃沈</span>
      </section>

      {difficulty && !result && (
        <aside className="utility-overlay" aria-label="ゲーム設定">
          <button
            onClick={() => setMuted(audio.current?.toggle() ?? false)}
            aria-label={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
            title={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
          >
            <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
          </button>
          <button
            className="retry"
            onClick={() => initStage(stageIndex)}
            disabled={locked}
            aria-label="現在のステージをリトライ"
            title="現在のステージをリトライ"
          >
            <span aria-hidden="true">↻</span>
          </button>
        </aside>
      )}

      <nav className="mobile-field-switch" aria-label="表示する海域">
        <div>
          <b>{phase === "enemy" ? "敵攻撃中：自軍海域を表示" : phase === "review" ? "戦況確認：自軍海域を表示" : phase === "player" ? "自軍攻撃：敵軍海域を表示" : "艦隊配置：自軍海域を表示"}</b>
          <small>{phase === "review" ? "確認後に攻撃へ進みます" : "ターンに合わせて同じ位置へ切り替えます"}</small>
        </div>
        <button className={visibleBoard === "player" ? "active" : ""} onClick={() => showBoard("player")}>
          自軍海域
        </button>
        <button className={visibleBoard === "enemy" ? "active" : ""} onClick={() => showBoard("enemy")} disabled={phase === "placement"}>
          敵軍海域
        </button>
        {difficulty && !result && (
          <span className="mobile-switch-utilities" aria-label="ゲーム設定">
            <button
              onClick={() => setMuted(audio.current?.toggle() ?? false)}
              aria-label={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
              title={muted ? "サウンドを有効にする" : "サウンドをミュートする"}
            >
              <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
            </button>
            <button
              className="retry"
              onClick={() => initStage(stageIndex)}
              disabled={locked}
              aria-label="現在のステージをリトライ"
              title="現在のステージをリトライ"
            >
              <span aria-hidden="true">↻</span>
            </button>
          </span>
        )}
      </nav>

      <div className="boards" ref={boardsRef}>
        <section className={"tactical-panel " + (portraitPhone && visibleBoard !== "player" ? "mobile-hidden" : "")}>
          <div className="panel-head"><h2>OWN WATERS // 自軍海域</h2><span>DEFENSE GRID</span></div>
          {phase !== "placement" && (
            <div className={"enemy-command-help own-field-help " + (phase === "review" ? "reviewing" : "")} aria-live="polite">
              <div>
                <span>OWN FLEET STATUS</span>
                <strong>{phase === "review" ? "戦況確認" : phase === "enemy" ? "被攻撃監視" : "防衛海域"}</strong>
                <em>損傷 {stats.damage} / {fleetCells}</em>
              </div>
              <p>{phase === "review" ? "敵の攻撃が終了しました。艦隊と着弾位置を確認してください。" : phase === "enemy" ? "敵の攻撃と着弾結果を追跡しています。" : "現在の自軍艦隊と損傷状況です。"}</p>
              <small>{phase === "review" ? "確認後、下の「戦況確認完了」から攻撃へ進みます。" : "自軍海域ボタンでいつでも確認できます。"}</small>
            </div>
          )}
          <div className="canvas-wrap">
            <canvas
              ref={playerCanvas}
              className={"board-canvas " + (locked ? "locked" : "")}
              aria-label="自軍海域8×8盤面"
              onPointerMove={onMove}
              onPointerDown={(event) => onBoardPointer("player", event)}
              onPointerUp={onPointerRelease}
              onPointerCancel={(event) => onPointerRelease(event, true)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (phase === "placement") rotatePlacement();
              }}
            />
            <div className="radar-line" />
          </div>
          <div className="fleet-row">{stage.fleet.map((id) => shipCard(player.current, id, { selectable: phase === "placement" }))}</div>
        </section>

        <section className={"tactical-panel enemy-board " + (portraitPhone && visibleBoard !== "enemy" ? "mobile-hidden" : "")}>
          <div className="panel-head"><h2>HOSTILE WATERS // 敵軍海域</h2><span>CONTACT GRID</span></div>
          {phase !== "placement" && (
            <div className={"enemy-command-help " + (ready ? "armed" : "")} aria-live="polite">
              <div>
                <span>SELECTED WEAPON</span>
                <strong>{selectedMeta.label}</strong>
                <em>{weapon === "fire" ? "使用回数 ∞" : selectedState.status}</em>
              </div>
              <p>{selectedMeta.help}</p>
              <small>
                {phase === "enemy"
                  ? "敵行動中。自軍海域で着弾を確認してください。"
                  : phase === "review"
                    ? "戦況確認中。自軍海域の損傷を確認してください。"
                  : !selectedState.available
                    ? selectedState.reason
                    : ready
                      ? "照準確定。" + confirmLabel + "ボタンで実行します。"
                      : picked.length
                        ? "目標選択 " + picked.length + "/" + targetRequirement + "。残りの目標を選んでください。"
                        : "敵海域をタップして" + selectedMeta.requirement + "を選んでください。"}
              </small>
            </div>
          )}
          <div className="canvas-wrap">
            <canvas
              ref={enemyCanvas}
              className={"board-canvas " + (locked ? "locked" : "")}
              aria-label="敵軍海域8×8盤面"
              onPointerMove={onMove}
              onPointerDown={(event) => onBoardPointer("enemy", event)}
            />
            <div className="radar-line" />
          </div>
          <div className="fleet-row">{stage.fleet.map((id) => shipCard(enemy.current, id, { concealDamage: difficulty === "tactics" }))}</div>
        </section>
      </div>

      {phase === "placement" ? (
        <section className="placement-tools">
          <div className="placement-help"><b>配置：</b>艦カードで選択・回転 ／ シルエットをドラッグして移動 ／ シルエットをタップして確定</div>
          <div className="placement-secondary">
            <button className="cmd" onClick={clearPlacement}><b>CLEAR</b><small>配置をやり直す</small></button>
            <button className="cmd" onClick={randomize}><b>RANDOM</b><small>自動配置</small></button>
          </div>
          {player.current.allPlaced(stage.fleet) && (
            <button className="cmd primary placement-start" onClick={startBattle}>
              <b>BATTLE START</b><small>{player.current.ships.length} / {stage.fleet.length} 艦配置完了</small>
            </button>
          )}
        </section>
      ) : phase === "review" ? (
        <section className="turn-review" aria-label="戦況確認">
          <div>
            <span>DAMAGE REPORT</span>
            <b>自軍海域を確認してください</b>
            <small>敵の攻撃結果は、確認が終わるまでこの画面に留まります。</small>
          </div>
          <button className="cmd primary review-confirm" onClick={continueToPlayer}>
            <b>戦況確認完了</b><small>敵海域へ切替・攻撃へ</small>
          </button>
        </section>
      ) : !result ? (
        <>
          <section className="command-deck">
            {(["fire", "phantom", "harpoon", "sparrow", "mk45", "radar"] as WeaponId[]).map((id, index) => {
              const state = weaponState(id);
              return (
                <button
                  key={id}
                  className={"cmd " + (weapon === id ? "selected" : "")}
                  onClick={() => selectWeapon(id)}
                  disabled={phase !== "player" || locked || !state.available}
                  title={state.reason || WEAPON_META[id].help}
                >
                  <b>{index + 1} / {WEAPON_META[id].label}</b><small>{state.status}</small>
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
          <section className="ops-lower">
            <div className="command-detail">
              <span>SELECTED COMMAND</span>
              <h3>{selectedMeta.label}</h3>
              <p>{selectedMeta.help}</p>
              <small>{selectedState.available ? selectedMeta.requirement + "を選択後、発射ボタンで確定。" : selectedState.reason}</small>
            </div>
            <div className="battle-log">
              <span>ACTION LOG / LAST {logs.length}</span>
              <ol>{[...logs].reverse().map((entry) => <li key={entry.id} className={entry.tone}>{entry.text}</li>)}</ol>
            </div>
          </section>
          <div className="legend">
            <span><i className="miss" />MISS</span><span><i className="echo" />ECHO</span><span><i className="hit" />HIT</span><span><i className="sunk" />SUNK</span>
            {enemyWakes.length > 0 && <span><i className="wake" />潜水艦音紋</span>}
          </div>
        </>
      ) : null}

      {flash && <div className={"turn-flash " + flash}><div>{flash === "player" ? "COMMAND" : "ENEMY ACTION"}</div></div>}

      {!difficulty && (
        <div className="difficulty-modal">
          <section className="difficulty-card">
            <div className="eyebrow">SELECT ENEMY TACTICS</div>
            <h2>DIFFICULTY</h2>
            <p>両モードとも敵の艦隊・兵装回数は自軍と同じです。TACTICSでは敵先攻と情報秘匿が加わりますが、AIが未発見の配置を読むことはありません。</p>
            <div className="difficulty-options">
              <button className="mode-button" onClick={() => startCampaign("casual")}>
                <span>CASUAL</span><small>公開情報を使い、索敵・追撃・特殊兵装をバランスよく運用します。</small>
              </button>
              <button className="mode-button tactics" onClick={() => startCampaign("tactics")}>
                <span>TACTICS</span><b>敵先攻・情報戦</b><small>敵損傷は撃沈まで非公開。兵装回数は自軍と同じ。公開された戦果だけで最短追撃を狙います。</small>
              </button>
            </div>
          </section>
        </div>
      )}

      {result && (
        <div className="result-modal">
          <section className={"result-card " + (phase === "defeat" ? "loss" : "")}>
            <div className="eyebrow">OPERATION AFTER ACTION REPORT</div>
            <h2>{campaignClear ? "CAMPAIGN CLEAR" : phase === "victory" ? "VICTORY" : "DEFEAT"}</h2>
            <p>
              {campaignClear
                ? "全8海域を制圧しました。DEEP BLUE GRID 作戦完了。"
                : phase === "victory"
                  ? "敵艦隊を撃破。次の海域へ進出できます。"
                  : "自軍艦隊が戦闘能力を喪失。配置と兵装運用を再検討してください。"}
            </p>
            <div className="stats">
              <div>TOTAL TURNS<b>{stats.turns}</b></div>
              <div>ACCURACY<b>{stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0}%</b></div>
              <div>SHIPS SUNK<b>{stats.sunk} / {stage.fleet.length}</b></div>
              <div>SPECIAL USED<b>{stats.specials}</b></div>
              <div>DAMAGE TAKEN<b>{stats.damage} / {fleetCells}</b></div>
              <div>STAGE<b>{stage.id} / {STAGES.length}</b></div>
            </div>
            <button
              className="cmd primary"
              onClick={advanceFromResult}
            >
              <b>{phase === "victory" ? (campaignClear ? "NEW CAMPAIGN" : "NEXT STAGE") : "RETRY STAGE"}</b>
              <small>{phase === "victory" && !campaignClear ? STAGES[stageIndex + 1].title : "艦隊を再配置"}</small>
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
