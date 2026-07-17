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
  sparrowCells,
  type AttackResult,
} from "./engine.ts";
import { advanceAcousticTrace, emptyAcousticIntel, type AcousticIntel } from "./AcousticTrace.ts";
import { EnemyAI } from "./EnemyAI.ts";
import { AudioManager } from "./AudioManager.ts";
import { drawBoard, pointerToCoord } from "./Renderer.ts";

type Phase = "placement" | "player" | "enemy" | "victory" | "defeat";
type Stats = { turns: number; shots: number; hits: number; sunk: number; specials: number; damage: number };
type LogEntry = { id: number; text: string; tone: "info" | "good" | "bad" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const coordName = (coord: Coord) => CELL_LABELS[coord.y] + "-" + (coord.x + 1);
const sameCoord = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;
const freshStats = (): Stats => ({ turns: 0, shots: 0, hits: 0, sunk: 0, specials: 0, damage: 0 });

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
  const ai = useRef(new EnemyAI(new SeededRandom(seedRef.current ^ 0x51f15e), STAGES[0].fleet, STAGES[0].aiSkill));
  const audio = useRef<AudioManager | null>(null);
  const playerCanvas = useRef<HTMLCanvasElement>(null);
  const enemyCanvas = useRef<HTMLCanvasElement>(null);
  const animation = useRef(0);
  const playerTraceRef = useRef<AcousticIntel>(emptyAcousticIntel());
  const enemyTraceRef = useRef<AcousticIntel>(emptyAcousticIntel());

  if (!audio.current && typeof window !== "undefined") audio.current = new AudioManager();

  const [stageIndex, setStageIndex] = useState(0);
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
  const [playerTrace, setPlayerTrace] = useState<AcousticIntel>(emptyAcousticIntel());
  const [enemyTrace, setEnemyTrace] = useState<AcousticIntel>(emptyAcousticIntel());

  const bump = () => setRevision((value) => value + 1);
  const addLog = (text: string, tone: LogEntry["tone"] = "info") => {
    setLogs((current) => [...current, { id: Date.now() + Math.random(), text, tone }].slice(-8));
  };

  const ownAlive = player.current.ships.filter((ship) => !ship.sunk).length;
  const enemyAlive = enemy.current.ships.filter((ship) => !ship.sunk).length;
  const fleetCells = stage.fleet.reduce((total, id) => total + SHIPS.find((ship) => ship.id === id)!.size, 0);
  const onlySubmarine = (board: Board) => {
    const alive = board.ships.filter((ship) => !ship.sunk);
    return alive.length === 1 && alive[0].id === "submarine";
  };

  const initStage = useCallback((nextStageIndex: number) => {
    const nextStage = STAGES[nextStageIndex];
    seedRef.current = Date.now() + nextStageIndex * 7919;
    rngRef.current = new SeededRandom(seedRef.current);
    player.current = new Board();
    enemy.current = new Board();
    arsenal.current = new Arsenal();
    ai.current = new EnemyAI(new SeededRandom(seedRef.current ^ 0x51f15e), nextStage.fleet, nextStage.aiSkill);
    playerTraceRef.current = emptyAcousticIntel();
    enemyTraceRef.current = emptyAcousticIntel();
    setPlayerTrace(emptyAcousticIntel());
    setEnemyTrace(emptyAcousticIntel());
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
        cursor: phase === "placement" ? cursor : undefined,
        previewShip: phase === "placement" ? {
          id: selectedShip,
          orientation,
          valid: player.current.canPlace(selectedShip, cursor, orientation),
        } : undefined,
        active: phase === "enemy" ? active : [],
        acoustic: playerTrace,
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
        acoustic: enemyTrace,
        time,
      });
    }
  }, [phase, cursor, selectedShip, orientation, weapon, previewTargets, active, locked, playerTrace, enemyTrace, revision]);

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
    setMessage("配置を初期化しました。艦を選び直してください。");
    addLog("配置を初期化しました。");
    audio.current?.cancel();
    bump();
  };

  const startBattle = () => {
    if (!player.current.allPlaced(stage.fleet)) {
      setMessage("このステージの全艦を配置してください。");
      return;
    }
    enemy.current.randomize(rngRef.current, stage.fleet);
    setPhase("player");
    setMessage("COMMAND：兵装を選び、敵海域に照準を置いてください。");
    addLog("交戦開始。先攻は自艦隊です。");
    setFlash("player");
    setTimeout(() => setFlash(null), 700);
    audio.current?.confirm();
    audio.current?.turn();
    bump();
  };

  const exposePlayerSubmarine = () => {
    if (!onlySubmarine(player.current)) return;
    const submarine = player.current.ships.find((ship) => ship.id === "submarine")!;
    const next = advanceAcousticTrace(playerTraceRef.current, submarine.cells[0], rngRef.current);
    playerTraceRef.current = next;
    setPlayerTrace(next);
    ai.current.observeAcoustic(next);
    addLog("警告：発射音から自艦の音紋が解析されました（" + next.level + "/5）。", "bad");
  };

  const exposeEnemySubmarine = () => {
    if (!onlySubmarine(enemy.current)) return;
    const submarine = enemy.current.ships.find((ship) => ship.id === "submarine")!;
    const next = advanceAcousticTrace(enemyTraceRef.current, submarine.cells[0], rngRef.current);
    enemyTraceRef.current = next;
    setEnemyTrace(next);
    addLog(next.level === 5 ? "音紋解析：敵潜水艦の強反応を捕捉。" : "音紋解析が進行（" + next.level + "/5）。", "good");
  };

  const enemyTurn = async () => {
    setPhase("enemy");
    setFlash("enemy");
    setMessage("敵照準システム作動中…");
    audio.current?.turn(true);
    await sleep(650);
    setFlash(null);
    const decision = ai.current.decide(enemy.current);
    setMessage("ENEMY " + decision.state + "： " + decision.weapon.toUpperCase() + " LOCK");
    setActive(decision.targets);
    await sleep(550);

    if (decision.weapon === "radar") {
      audio.current?.sonar();
      const contact = player.current.radar(decision.targets[0]);
      ai.current.observeRadar(decision.targets[0], contact);
      const report = contact ? "敵レーダーが生存艦反応を捕捉。" : "敵レーダー走査：反応なし。";
      setMessage(report);
      addLog(report, contact ? "bad" : "info");
      bump();
      await sleep(650);
    } else {
      audio.current?.fire();
      const results: AttackResult[] = [];
      for (const target of decision.targets) {
        const result = player.current.attack(target);
        if (result.kind !== "ALREADY") results.push(result);
        setActive([target]);
        await sleep(200);
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
      exposeEnemySubmarine();
    }

    setActive([]);
    bump();
    await sleep(500);
    if (player.current.allSunk()) {
      setPhase("defeat");
      audio.current?.defeat();
      setLocked(false);
      return;
    }
    setPhase("player");
    setFlash("player");
    setMessage("COMMAND：兵装と目標を選択してください。");
    audio.current?.turn();
    setTimeout(() => setFlash(null), 700);
    setLocked(false);
  };

  const resolvePlayerAttack = async (targets: Coord[], special = false) => {
    setLocked(true);
    setActive(targets);
    audio.current?.fire();
    await sleep(320);
    const results: AttackResult[] = [];
    for (const target of targets) {
      const result = enemy.current.attack(target);
      if (result.kind === "ALREADY") continue;
      results.push(result);
      setActive([target]);
      await sleep(165);
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
    exposePlayerSubmarine();
    setActive([]);
    setPicked([]);
    bump();
    await sleep(480);
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
      await sleep(650);
      const contact = enemy.current.radar(picked[0]);
      setStats((current) => ({ ...current, turns: current.turns + 1, specials: current.specials + 1 }));
      const report = contact ? "CONTACT：2×2範囲内に生存艦反応。" : "CLEAR：2×2範囲内に反応なし。";
      setMessage(report);
      addLog("SPS-10 RADAR： " + report, contact ? "good" : "info");
      setPicked([]);
      setActive([]);
      bump();
      await sleep(700);
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

  const onBoardPointer = (side: "player" | "enemy", event: React.PointerEvent<HTMLCanvasElement>) => {
    const coord = pointerToCoord(event.currentTarget, event.clientX, event.clientY);
    if (!coord) return;
    setCursor(coord);
    if (side === "player" && phase === "placement") {
      if (player.current.canPlace(selectedShip, coord, orientation)) {
        player.current.placeShip(selectedShip, coord, orientation);
        audio.current?.confirm();
        const next = stage.fleet.find((id) => !player.current.ships.some((placed) => placed.id === id));
        if (next) setSelectedShip(next);
        const placedName = SHIPS.find((ship) => ship.id === selectedShip)!.name;
        setMessage(next ? placedName + " 配置完了。次の艦を配置してください。" : "全艦配置完了。戦闘を開始できます。");
        bump();
      } else {
        setMessage("配置不可：盤面外、重複、または配置済みです。");
        audio.current?.cancel();
      }
    } else if (side === "enemy") {
      chooseTarget(coord);
    }
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const coord = pointerToCoord(event.currentTarget, event.clientX, event.clientY);
    if (coord) setCursor(coord);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
      if (event.key.toLowerCase() === "m") {
        setMuted(audio.current?.toggle() ?? false);
        return;
      }
      if (event.key.toLowerCase() === "r" && phase === "placement") {
        setOrientation((current) => current === "horizontal" ? "vertical" : "horizontal");
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, cursor, weapon, picked, locked, ready]);

  const shipCard = (board: Board, shipId: ShipId, selectable = false) => {
    const definition = SHIPS.find((ship) => ship.id === shipId)!;
    const ship = board.ships.find((candidate) => candidate.id === shipId);
    return (
      <button
        key={shipId}
        className={"ship-card " + (selectable && selectedShip === shipId ? "active " : "") + (ship?.sunk ? "sunk" : "")}
        onClick={() => selectable && !ship && setSelectedShip(shipId)}
        disabled={!selectable || !!ship}
        title={definition.weapon === "NONE" ? "特殊兵装なし" : "搭載兵装：" + definition.weapon}
      >
        <strong>{definition.name} / {definition.code}</strong>
        <small>{ship?.sunk ? "LOST" : ship ? "DEPLOYED" : selectable ? "SELECT TO PLACE" : "UNKNOWN"}</small>
        <span className="hull-meter">
          {Array.from({ length: definition.size }, (_, index) => <i key={index} className={ship && index < ship.hits.size ? "hit" : ""} />)}
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
    return { available: uses > 0, status: uses + " / " + WEAPON_MAX[id], reason: uses > 0 ? "" : "このステージでの使用回数を使い切りました。" };
  };

  const result = phase === "victory" || phase === "defeat";
  const campaignClear = phase === "victory" && stageIndex === STAGES.length - 1;
  const selectedMeta = WEAPON_META[weapon];
  const selectedState = weaponState(weapon);
  const confirmLabel = weapon === "radar" ? "走査実行" : selectedMeta.label + " 発射";

  return (
    <main className={"game-shell " + (active.length ? "shake" : "")}>
      <div className="noise" />
      <header className="masthead">
        <div>
          <div className="brand-kicker">TACTICAL SONAR / CAMPAIGN</div>
          <h1 className="brand-title" aria-label={GAME_TITLE}>DEEP <span>BLUE</span> GRID</h1>
        </div>
        <div className="phase-badge">
          <strong>{phase === "placement" ? "FLEET DEPLOY" : phase === "player" ? "COMMAND" : phase === "enemy" ? "ENEMY ACTION" : "MISSION END"}</strong>
          <small>STAGE {stage.id} / LEVEL {stage.level}</small>
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

      <section className={"status-strip " + (phase === "enemy" ? "enemy" : "")} aria-live="polite">
        <span className="tag">{phase === "enemy" ? "ALERT" : "OPS"}</span>
        <p><b>{stage.title}</b> — {message}</p>
        <span className="turn-counter">TURN {String(stats.turns + 1).padStart(2, "0")} / OWN {ownAlive} / HOSTILE {phase === "placement" ? "?" : enemyAlive}</span>
      </section>

      <section className="quick-guide">
        <b>NAVY BLUE式 作戦要領</b>
        <span>1. 自艦を配置</span><span>2. 兵装と目標を選択</span><span>3. プレビューを確認して発射</span><span>4. 全区画命中で撃沈</span>
      </section>

      <div className="boards">
        <section className="tactical-panel">
          <div className="panel-head"><h2>OWN WATERS // 自軍海域</h2><span>DEFENSE GRID</span></div>
          <div className="canvas-wrap">
            <canvas
              ref={playerCanvas}
              className={"board-canvas " + (locked ? "locked" : "")}
              aria-label="自軍海域8×8盤面"
              onPointerMove={onMove}
              onPointerDown={(event) => onBoardPointer("player", event)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (phase === "placement") setOrientation((current) => current === "horizontal" ? "vertical" : "horizontal");
              }}
            />
            <div className="radar-line" />
          </div>
          <div className="fleet-row">{stage.fleet.map((id) => shipCard(player.current, id, phase === "placement"))}</div>
        </section>

        <section className="tactical-panel enemy-board">
          <div className="panel-head"><h2>HOSTILE WATERS // 敵軍海域</h2><span>CONTACT GRID</span></div>
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
          <div className="fleet-row">{stage.fleet.map((id) => shipCard(enemy.current, id))}</div>
        </section>
      </div>

      {phase === "placement" ? (
        <section className="placement-tools">
          <div className="placement-help">艦を選択 → 自軍海域をタップ / 右クリックまたは R で回転</div>
          <button className="cmd" onClick={() => { setOrientation((current) => current === "horizontal" ? "vertical" : "horizontal"); audio.current?.cursor(); }}>
            <b>ROTATE [R]</b><small>{orientation === "horizontal" ? "HORIZONTAL" : "VERTICAL"}</small>
          </button>
          <button className="cmd" onClick={clearPlacement}><b>CLEAR</b><small>配置をやり直す</small></button>
          <button className="cmd" onClick={randomize}><b>RANDOM</b><small>自動配置</small></button>
          <button className="cmd primary" onClick={startBattle} disabled={!player.current.allPlaced(stage.fleet)}>
            <b>BATTLE START</b><small>{player.current.ships.length} / {stage.fleet.length} 艦配置</small>
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
            <button className={"cmd confirm " + (ready ? "ready" : "")} onClick={() => void confirmAction()} disabled={!ready || locked}>
              <b>{confirmLabel}</b><small>{picked.length} / {targetRequirement} SELECTED</small>
            </button>
            <button className="cmd" onClick={cancelAim} disabled={locked || !picked.length}><b>CANCEL</b><small>照準解除 / ESC</small></button>
            <button className="cmd" onClick={() => setMuted(audio.current?.toggle() ?? false)}><b>{muted ? "SOUND ON" : "MUTE"}</b><small>KEY M</small></button>
            <button className="cmd danger" onClick={() => initStage(stageIndex)} disabled={locked}><b>RETRY</b><small>現在のステージを再開</small></button>
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
            <span><i className="trace" />音紋候補 {enemyTrace.level}/5</span>
          </div>
        </>
      ) : null}

      {flash && <div className={"turn-flash " + flash}><div>{flash === "player" ? "COMMAND" : "ENEMY ACTION"}</div></div>}

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
              onClick={() => initStage(phase === "victory" ? (campaignClear ? 0 : stageIndex + 1) : stageIndex)}
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
