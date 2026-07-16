"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CELL_LABELS, GAME_TITLE, SHIPS, WEAPON_MAX, type Coord, type Orientation, type ShipId, type WeaponId } from "./constants.ts";
import { Arsenal, Board, SeededRandom, harpoonCells, radarCells, type AttackResult } from "./engine.ts";
import { EnemyAI } from "./EnemyAI.ts";
import { AudioManager } from "./AudioManager.ts";
import { drawBoard, pointerToCoord } from "./Renderer.ts";

type Phase="placement"|"player"|"enemy"|"victory"|"defeat";
type Stats={turns:number;shots:number;hits:number;sunk:number;specials:number;damage:number};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const coordName=(c:Coord)=>`${CELL_LABELS[c.y]}-${c.x+1}`;

export function DeepBlueGrid(){
  const seedRef=useRef(0); const rngRef=useRef(new SeededRandom(seedRef.current));
  const player=useRef(new Board()); const enemy=useRef(new Board()); const arsenal=useRef(new Arsenal()); const ai=useRef(new EnemyAI(new SeededRandom(seedRef.current^0x51f15e)));
  const audio=useRef<AudioManager|null>(null); if(!audio.current&&typeof window!=="undefined")audio.current=new AudioManager();
  const playerCanvas=useRef<HTMLCanvasElement>(null),enemyCanvas=useRef<HTMLCanvasElement>(null);
  const [phase,setPhase]=useState<Phase>("placement"),[message,setMessage]=useState("艦艇を選択し、海域へ配置せよ。"),[selectedShip,setSelectedShip]=useState<ShipId>("battleship");
  const [orientation,setOrientation]=useState<Orientation>("horizontal"),[cursor,setCursor]=useState<Coord>({x:1,y:2}),[weapon,setWeapon]=useState<WeaponId>("fire"),[picked,setPicked]=useState<Coord[]>([]);
  const [locked,setLocked]=useState(false),[revision,setRevision]=useState(0),[active,setActive]=useState<Coord[]>([]),[flash,setFlash]=useState<"player"|"enemy"|null>(null),[muted,setMuted]=useState(false);
  const [stats,setStats]=useState<Stats>({turns:0,shots:0,hits:0,sunk:0,specials:0,damage:0}); const animation=useRef(0);
  const bump=()=>setRevision(v=>v+1);
  const alivePlayer=player.current.ships.filter(s=>!s.sunk).length,aliveEnemy=enemy.current.ships.filter(s=>!s.sunk).length;

  useEffect(()=>{
    seedRef.current=Date.now();
    rngRef.current=new SeededRandom(seedRef.current);
    ai.current=new EnemyAI(new SeededRandom(seedRef.current^0x51f15e));
    bump();
  },[]);

  const render=useCallback((time:number)=>{
    animation.current=requestAnimationFrame(render);
    if(playerCanvas.current)drawBoard(playerCanvas.current,player.current,{revealShips:true,cursor:phase==="placement"?cursor:undefined,previewShip:phase==="placement"?{id:selectedShip,orientation,valid:player.current.canPlace(selectedShip,cursor,orientation)}:undefined,active:phase==="enemy"?active:[],time});
    if(enemyCanvas.current)drawBoard(enemyCanvas.current,enemy.current,{revealShips:false,cursor:phase==="player"&&!locked?cursor:undefined,weapon,selected:picked,active:phase==="player"?active:[],time});
  },[phase,cursor,selectedShip,orientation,weapon,picked,active,locked,revision]);
  useEffect(()=>{animation.current=requestAnimationFrame(render);return()=>cancelAnimationFrame(animation.current);},[render]);

  const reset=useCallback(()=>{
    seedRef.current=Date.now();rngRef.current=new SeededRandom(seedRef.current);player.current=new Board();enemy.current=new Board();arsenal.current=new Arsenal();ai.current=new EnemyAI(new SeededRandom(seedRef.current^0x51f15e));
    setPhase("placement");setMessage("艦艇を選択し、海域へ配置せよ。");setSelectedShip("battleship");setOrientation("horizontal");setWeapon("fire");setPicked([]);setLocked(false);setActive([]);setStats({turns:0,shots:0,hits:0,sunk:0,specials:0,damage:0});bump();
  },[]);
  const randomize=()=>{player.current.randomize(rngRef.current);setSelectedShip("battleship");setMessage("配置完了。戦闘開始を押してください。");audio.current?.confirm();bump();};
  const clearPlacement=()=>{player.current.reset();setSelectedShip("battleship");setMessage("配置を初期化しました。");audio.current?.cancel();bump();};
  const startBattle=()=>{if(!player.current.allPlaced()){setMessage("全3隻を配置してください。");return;}enemy.current.randomize(rngRef.current);setPhase("player");setMessage("敵海域を指定。攻撃コマンドを実行せよ。");setFlash("player");setTimeout(()=>setFlash(null),700);audio.current?.confirm();audio.current?.turn();bump();};

  const resolvePlayerAttack=async(targets:Coord[],special=false)=>{
    setLocked(true);setActive(targets);audio.current?.fire();await sleep(350);const results:AttackResult[]=[];
    for(const target of targets){const result=enemy.current.attack(target);if(result.kind==="ALREADY")continue;results.push(result);setActive([target]);await sleep(180);if(result.kind==="HIT"||result.kind==="SUNK")audio.current?.hit();else audio.current?.splash();if(result.kind==="SUNK")audio.current?.sunk();bump();}
    const valid=results.filter(r=>r.kind!=="ALREADY");const hits=valid.filter(r=>r.kind==="HIT"||r.kind==="SUNK").length;const sunk=valid.filter(r=>r.kind==="SUNK").length;
    setStats(s=>({...s,turns:s.turns+1,shots:s.shots+valid.length,hits:s.hits+hits,sunk:s.sunk+sunk,specials:s.specials+(special?1:0)}));
    const last=valid.at(-1);setMessage(last?.kind==="SUNK"?`${last.shipName} — SUNK!`:hits?`命中 ${hits} / ${valid.length}。敵艦に損傷。`:valid.some(r=>r.kind==="ECHO")?"SONAR ECHO — 周辺に反応あり。":"MISS — 反応なし。");
    setActive([]);setPicked([]);bump();await sleep(520);if(enemy.current.allSunk()){setPhase("victory");audio.current?.victory();setLocked(false);return;}await enemyTurn();
  };
  const enemyTurn=async()=>{
    setPhase("enemy");setFlash("enemy");setMessage("敵照準システム作動中…");audio.current?.turn(true);await sleep(700);setFlash(null);
    const decision=ai.current.decide(enemy.current);setMessage(`ENEMY ${decision.state} — ${decision.weapon.toUpperCase()} LOCK`);setActive(decision.targets);await sleep(650);
    if(decision.weapon==="radar"){
      audio.current?.sonar();const contact=player.current.radar(decision.targets[0]);ai.current.observeRadar(decision.targets[0],contact);setMessage(contact?"敵ソナーが接触反応を捕捉。":"敵レーダー走査 — CLEAR");bump();await sleep(700);
    }else{
      audio.current?.fire();const results:AttackResult[]=[];
      for(const target of decision.targets){const result=player.current.attack(target);if(result.kind!=="ALREADY")results.push(result);setActive([target]);await sleep(230);if(result.kind==="HIT"||result.kind==="SUNK")audio.current?.hit();else audio.current?.splash();if(result.kind==="SUNK")audio.current?.sunk();bump();}
      ai.current.observe(results);const hits=results.filter(r=>r.kind==="HIT"||r.kind==="SUNK").length;setStats(s=>({...s,damage:s.damage+hits}));const sunk=results.find(r=>r.kind==="SUNK");setMessage(sunk?`警告：${sunk.shipName} 撃沈。`:hits?`被弾 ${hits}。敵は追撃態勢へ移行。`:results.some(r=>r.kind==="ECHO")?"敵弾 MISS — ただし反応を捕捉された。":"敵弾 MISS。損害なし。");
    }
    setActive([]);bump();await sleep(520);if(player.current.allSunk()){setPhase("defeat");audio.current?.defeat();setLocked(false);return;}setPhase("player");setFlash("player");setMessage("COMMAND — 攻撃方法と目標を選択。");audio.current?.turn();setTimeout(()=>setFlash(null),700);setLocked(false);
  };

  const useAt=async(c:Coord)=>{
    if(phase!=="player"||locked)return;
    if(weapon==="fire"){if(enemy.current.shots[c.y][c.x]!=="unknown"){setMessage("その座標は攻撃済みです。");audio.current?.cancel();return;}await resolvePlayerAttack([c]);}
    if(weapon==="harpoon"){if(!arsenal.current.spend("harpoon",player.current)){setMessage("HARPOON 使用不能。");return;}await resolvePlayerAttack(harpoonCells(c),true);}
    if(weapon==="radar"){
      if(!arsenal.current.spend("radar",player.current)){setMessage("SPS-10 RADAR 使用不能。");return;}setLocked(true);setActive(radarCells(c));audio.current?.sonar();await sleep(750);const contact=enemy.current.radar(c);setStats(s=>({...s,turns:s.turns+1,specials:s.specials+1}));setMessage(contact?"CONTACT — 2×2範囲内に生存艦反応。":"CLEAR — 範囲内に反応なし。");bump();await sleep(850);setActive([]);await enemyTurn();
    }
    if(weapon==="mk45"){
      if(enemy.current.shots[c.y][c.x]!=="unknown"||picked.some(p=>p.x===c.x&&p.y===c.y)){setMessage("異なる未攻撃座標を選択してください。");return;}
      const next=[...picked,c];setPicked(next);audio.current?.cursor();setMessage(next.length===1?`第1目標 ${coordName(c)}。第2目標を選択。`:`2目標選択完了。MK-45 発射ボタンで決定。`);
    }
  };
  const fireMk45=async()=>{if(picked.length!==2||!arsenal.current.spend("mk45",player.current))return;await resolvePlayerAttack(picked,true);};
  const selectWeapon=(w:WeaponId)=>{if(phase!=="player"||locked)return;setPicked([]);setWeapon(w);audio.current?.cursor();setMessage(w==="fire"?"FIRE — 未攻撃の1マスを指定。":w==="harpoon"?"HARPOON — 3×3内の5地点を同時爆撃。":w==="mk45"?"MK-45 II — 異なる2地点を選択。":"RADAR — 2×2範囲を索敵（攻撃力なし）。");};

  const onBoardPointer=(side:"player"|"enemy",e:React.PointerEvent<HTMLCanvasElement>)=>{const canvas=e.currentTarget,c=pointerToCoord(canvas,e.clientX,e.clientY);if(!c)return;setCursor(c);if(side==="player"&&phase==="placement"){
      if(player.current.canPlace(selectedShip,c,orientation)){player.current.placeShip(selectedShip,c,orientation);audio.current?.confirm();const next=SHIPS.find(s=>!player.current.ships.some(p=>p.id===s.id));if(next)setSelectedShip(next.id);setMessage(next?`${SHIPS.find(s=>s.id===selectedShip)?.name} 配置完了。次の艦を配置。`:"全艦配置完了。戦闘開始できます。");bump();}else{setMessage("配置不可：盤面外または他艦と重なっています。");audio.current?.cancel();}
    }else if(side==="enemy")void useAt(c);};
  const onMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{const c=pointerToCoord(e.currentTarget,e.clientX,e.clientY);if(c)setCursor(c);};

  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();if(e.key.toLowerCase()==="m"){setMuted(audio.current?.toggle()??false);return;}if(e.key.toLowerCase()==="r"&&phase==="placement")setOrientation(o=>o==="horizontal"?"vertical":"horizontal");if(e.key==="Escape"){setPicked([]);setWeapon("fire");audio.current?.cancel();}if(phase==="player"){if(e.key==="1")selectWeapon("fire");if(e.key==="2")selectWeapon("harpoon");if(e.key==="3")selectWeapon("mk45");if(e.key==="4")selectWeapon("radar");}const d:{[k:string]:Coord}={ArrowLeft:{x:-1,y:0},a:{x:-1,y:0},ArrowRight:{x:1,y:0},d:{x:1,y:0},ArrowUp:{x:0,y:-1},w:{x:0,y:-1},ArrowDown:{x:0,y:1},s:{x:0,y:1}};const delta=d[e.key];if(delta)setCursor(c=>({x:Math.max(0,Math.min(7,c.x+delta.x)),y:Math.max(0,Math.min(7,c.y+delta.y))}));if((e.key==="Enter"||e.key===" ")&&phase==="player")void useAt(cursor);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[phase,cursor,weapon,picked,locked]);

  const shipCard=(board:Board,shipId:ShipId,selectable=false)=>{const def=SHIPS.find(s=>s.id===shipId)!,ship=board.ships.find(s=>s.id===shipId);return <button key={shipId} className={`ship-card ${selectable&&selectedShip===shipId?"active":""} ${ship?.sunk?"sunk":""}`} onClick={()=>selectable&&!ship&&setSelectedShip(shipId)} disabled={!selectable||!!ship}><strong>{def.name} / {def.code}</strong><small>{ship?.sunk?"LOST":ship?"DEPLOYED":selectable?"SELECT TO PLACE":"UNKNOWN"}</small><span className="hull-meter">{Array.from({length:def.size},(_,i)=><i key={i} className={ship&&i<ship.hits.size?"hit":""}/>)}</span></button>};
  const canWeapon=(id:"harpoon"|"mk45"|"radar")=>arsenal.current.canUse(id,player.current);
  const carrierStatus=(id:"harpoon"|"mk45"|"radar")=>{const carrier=id==="harpoon"?"battleship":id==="mk45"?"destroyer":"submarine";return player.current.alive(carrier)?`${arsenal.current.uses[id]} / ${WEAPON_MAX[id]}`:"CARRIER LOST";};
  const result=phase==="victory"||phase==="defeat";
  return <main className={`game-shell ${active.length?"shake":""}`}><div className="noise"/>
    <header className="masthead"><div><div className="brand-kicker">TACTICAL SONAR / ONE STAGE</div><h1 className="brand-title" aria-label={GAME_TITLE}>DEEP <span>BLUE</span> GRID</h1></div><div className="phase-badge"><strong>{phase==="placement"?"FLEET DEPLOY":phase==="player"?"COMMAND":phase==="enemy"?"ENEMY ACTION":result?"MISSION END":""}</strong><small>8×8 NAVAL TACTICAL DISPLAY</small></div><div className="system-info">SEED <b>{seedRef.current.toString(16).toUpperCase()}</b><br/>LINK STATUS <b>ONLINE</b></div></header>
    <section className={`status-strip ${phase==="enemy"?"enemy":""}`} aria-live="polite"><span className="tag">{phase==="enemy"?"ALERT":"OPS"}</span><p>{message}</p><span className="turn-counter">TURN {String(stats.turns+1).padStart(2,"0")} / OWN {alivePlayer} / HOSTILE {phase==="placement"?"?":aliveEnemy}</span></section>
    <div className="boards">
      <section className="tactical-panel"><div className="panel-head"><h2>OWN WATERS // 自軍海域</h2><span>DEFENSE GRID</span></div><div className="canvas-wrap"><canvas ref={playerCanvas} className={`board-canvas ${locked?"locked":""}`} aria-label="自軍海域8×8盤面" onPointerMove={onMove} onPointerDown={e=>onBoardPointer("player",e)} onContextMenu={e=>{e.preventDefault();if(phase==="placement")setOrientation(o=>o==="horizontal"?"vertical":"horizontal");}}/><div className="radar-line"/></div><div className="fleet-row">{SHIPS.map(s=>shipCard(player.current,s.id,phase==="placement"))}</div></section>
      <section className="tactical-panel enemy-board"><div className="panel-head"><h2>HOSTILE WATERS // 敵海域</h2><span>CONTACT GRID</span></div><div className="canvas-wrap"><canvas ref={enemyCanvas} className={`board-canvas ${locked?"locked":""}`} aria-label="敵海域8×8盤面" onPointerMove={onMove} onPointerDown={e=>onBoardPointer("enemy",e)}/><div className="radar-line"/></div><div className="fleet-row">{SHIPS.map(s=>shipCard(enemy.current,s.id))}</div></section>
    </div>
    {phase==="placement"?<section className="placement-tools"><div className="placement-help">艦を選択 → 海図をタップ / 右クリックまたは R で回転</div><button className="cmd" onClick={()=>{setOrientation(o=>o==="horizontal"?"vertical":"horizontal");audio.current?.cursor();}}><b>ROTATE [R]</b><small>{orientation==="horizontal"?"HORIZONTAL":"VERTICAL"}</small></button><button className="cmd" onClick={clearPlacement}><b>CLEAR</b><small>配置やり直し</small></button><button className="cmd" onClick={randomize}><b>RANDOM</b><small>自動配置</small></button><button className="cmd primary" onClick={startBattle} disabled={!player.current.allPlaced()}><b>BATTLE START</b><small>交戦を開始</small></button></section>
    :!result?<><section className="command-deck"><button className={`cmd ${weapon==="fire"?"selected":""}`} onClick={()=>selectWeapon("fire")} disabled={phase!=="player"||locked}><b>1 / FIRE</b><small>通常砲撃</small></button><button className={`cmd ${weapon==="harpoon"?"selected":""}`} onClick={()=>selectWeapon("harpoon")} disabled={phase!=="player"||locked||!canWeapon("harpoon")}><b>2 / HARPOON</b><small>{carrierStatus("harpoon")}</small></button><button className={`cmd ${weapon==="mk45"?"selected":""}`} onClick={()=>selectWeapon("mk45")} disabled={phase!=="player"||locked||!canWeapon("mk45")}><b>3 / MK-45 II</b><small>{carrierStatus("mk45")}</small></button><button className={`cmd ${weapon==="radar"?"selected":""}`} onClick={()=>selectWeapon("radar")} disabled={phase!=="player"||locked||!canWeapon("radar")}><b>4 / RADAR</b><small>{carrierStatus("radar")}</small></button>{weapon==="mk45"&&<button className="cmd primary" onClick={()=>void fireMk45()} disabled={picked.length!==2||locked}><b>MK-45 発射</b><small>{picked.length} / 2 TARGETS</small></button>}<button className="cmd" onClick={()=>{setPicked([]);setWeapon("fire");audio.current?.cancel();}} disabled={locked}><b>CANCEL</b><small>ESC</small></button><button className="cmd" onClick={()=>setMuted(audio.current?.toggle()??false)}><b>{muted?"SOUND ON":"MUTE"}</b><small>KEY M</small></button><button className="cmd danger" onClick={reset} disabled={locked}><b>RESTART</b><small>配置へ戻る</small></button></section><div className="legend"><span><i className="miss"/>MISS</span><span><i className="echo"/>ECHO</span><span><i className="hit"/>HIT</span><span><i className="sunk"/>SUNK</span></div></>:null}
    {flash&&<div className={`turn-flash ${flash}`}><div>{flash==="player"?"COMMAND":"ENEMY ACTION"}</div></div>}
    {result&&<div className="result-modal"><section className={`result-card ${phase==="defeat"?"loss":""}`}><div className="eyebrow">OPERATION AFTER ACTION REPORT</div><h2>{phase==="victory"?"VICTORY":"DEFEAT"}</h2><p>{phase==="victory"?"敵艦隊の全目標を排除。海域を確保しました。":"自軍艦隊は戦闘能力を喪失。再配置を要請します。"}</p><div className="stats"><div>TOTAL TURNS<b>{stats.turns}</b></div><div>ACCURACY<b>{stats.shots?Math.round(stats.hits/stats.shots*100):0}%</b></div><div>SHIPS SUNK<b>{stats.sunk} / 3</b></div><div>SPECIAL USED<b>{stats.specials}</b></div><div>DAMAGE TAKEN<b>{stats.damage} / 9</b></div><div>SEED<b>{seedRef.current.toString(16).toUpperCase()}</b></div></div><button className="cmd primary" onClick={reset}><b>REMATCH</b><small>新しい海域で再戦</small></button></section></div>}
  </main>;
}
