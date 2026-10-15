"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { currentBriefingCue, isLastBriefingCue, type BriefingDirectorAction, type BriefingDirectorState } from "./BriefingDirector.ts";
import type { BriefingCue, BriefingDismissReason } from "./BriefingSequence.ts";

type FocusRect = Readonly<{ left: number; top: number; width: number; height: number }>;

type BriefingCoachProps = Readonly<{
  state: BriefingDirectorState;
  dispatch: Dispatch<BriefingDirectorAction>;
  reducedMotion: boolean;
  onCueChange: (cue: BriefingCue | null) => void;
  onDismiss: (reason: BriefingDismissReason) => void;
  onQuickComplete?: () => void;
}>;

export function BriefingCoach({ state, dispatch, reducedMotion, onCueChange, onDismiss, onQuickComplete }: BriefingCoachProps) {
  const cue = currentBriefingCue(state);
  const sequence = state.sequence;
  const briefingOpen = Boolean(sequence);
  const last = isLastBriefingCue(state);
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [focusRect, setFocusRect] = useState<FocusRect | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const progress = useMemo(() => sequence?.cues.length ? Math.round((state.cueIndex + 1) / sequence.cues.length * 100) : 0, [sequence, state.cueIndex]);

  useEffect(() => {
    onCueChange(cue);
    if (!cue) return;
    let frame = 0;
    let secondFrame = 0;
    let observedAnchor: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    const update = (bringIntoView = false) => {
      // onCueChange can swap the compact player/enemy plot. Resolve the
      // anchor after that React update instead of retaining the old hidden DOM.
      const anchor = visibleAnchor(cue.focus);
      if (anchor !== observedAnchor) {
        observer?.disconnect();
        observedAnchor = anchor;
        observer = anchor && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => update()) : null;
        if (anchor) observer?.observe(anchor);
      }
      if (!anchor || cue.focus === "overview") {
        setFocusRect(null);
        return;
      }
      if (bringIntoView) {
        anchor.scrollIntoView({ block: cue.focus === "confirm-action" || cue.focus === "command-deck" ? "end" : "center", behavior: "auto" });
        revealCompactAnchor(anchor, cue, rootRef.current);
      }
      const rect = anchor.getBoundingClientRect();
      const pad = window.innerWidth <= 760 ? 5 : 9;
      const left = Math.max(4, Math.min(window.innerWidth - 8, rect.left - pad));
      const top = Math.max(4, Math.min(window.innerHeight - 8, rect.top - pad));
      setFocusRect({
        left,
        top,
        width: Math.max(4, Math.min(window.innerWidth - left - 4, rect.width + pad * 2)),
        height: Math.max(4, Math.min(window.innerHeight - top - 4, rect.height + pad * 2)),
      });
    };
    const track = () => update(false);
    frame = requestAnimationFrame(() => {
      update(true);
      secondFrame = requestAnimationFrame(() => update(true));
    });
    window.addEventListener("resize", track);
    window.addEventListener("scroll", track, true);
    window.visualViewport?.addEventListener("resize", track);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      observer?.disconnect();
      window.removeEventListener("resize", track);
      window.removeEventListener("scroll", track, true);
      window.visualViewport?.removeEventListener("resize", track);
    };
  }, [cue, onCueChange, replayKey, sequence]);

  useEffect(() => {
    if (!state.playing || !cue || reducedMotion) return;
    const timer = window.setTimeout(() => {
      if (last) dispatch({ type: "pause" });
      else dispatch({ type: "next" });
    }, cue.durationMs);
    return () => window.clearTimeout(timer);
  }, [cue, dispatch, last, reducedMotion, replayKey, state.playing]);

  useEffect(() => {
    if (!briefingOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    primaryRef.current?.focus({ preventScroll: true });
    return () => previousFocus?.focus({ preventScroll: true });
  }, [briefingOpen]);

  if (!sequence || !cue) return null;

  const advance = () => {
    if (last) onDismiss("complete");
    else dispatch({ type: "next" });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && sequence.allowSkip) {
      event.preventDefault();
      onDismiss("skip");
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      dispatch({ type: "previous" });
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      advance();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (reducedMotion) return;
      dispatch({ type: state.playing ? "pause" : "play" });
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current >= controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next].focus();
  };

  return (
    <div
      ref={rootRef}
      className={`briefing-coach briefing-${sequence.kind} presentation-${sequence.presentation ?? "edge-console"} focus-${cue.focus} ${state.playing && !reducedMotion ? "playing" : "paused"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-cue-title"
      aria-describedby="briefing-cue-narration"
      data-briefing-cue={cue.id}
      onKeyDown={handleKeyDown}
    >
      {focusRect ? (
        <div
          key={`${cue.id}-${replayKey}`}
          className={`briefing-focus-frame${focusRect.top < 32 ? " label-inside" : ""}`}
          style={{ left: focusRect.left, top: focusRect.top, width: focusRect.width, height: focusRect.height }}
          aria-hidden="true"
        ><span>{cue.chapter}</span></div>
      ) : <div className="briefing-full-dim" aria-hidden="true" />}
      <section className="briefing-console">
        <header className="briefing-console-head">
          <div><span>{sequence.eyebrow}</span><b>{sequence.title}</b><small>{sequence.subtitle}</small></div>
          {sequence.allowSkip && <button className="briefing-skip" onClick={() => onDismiss("skip")}>説明を閉じる <small>ESC</small></button>}
        </header>
        <div className="briefing-timeline" aria-label={`説明 ${state.cueIndex + 1} / ${sequence.cues.length}`}>
          <div role="progressbar" aria-valuemin={1} aria-valuemax={sequence.cues.length} aria-valuenow={state.cueIndex + 1} style={{ "--briefing-progress": progress / 100 } as CSSProperties} />
          <span>SCENE {String(state.cueIndex + 1).padStart(2, "0")} / {String(sequence.cues.length).padStart(2, "0")}</span>
        </div>
        <div className="briefing-learning-area">
          <BriefingMotionStage cue={cue} replayKey={replayKey} />
          <div className="briefing-copy" role="status" aria-live="polite" aria-atomic="true">
            <Fragment key={`${cue.id}-copy-${replayKey}`}>
              <div className="briefing-chapter"><span>{cue.chapter}</span><small>{cue.kicker}</small></div>
              <div className="briefing-now"><b>いまやること</b><span>{plainActionHint(cue)}</span></div>
              <h2 id="briefing-cue-title">{cue.title}</h2>
              <p id="briefing-cue-narration">{cue.narration}</p>
              <strong>{cue.caption}</strong>
              <div className="briefing-hint-title">HINT / ここだけ覚える</div>
              <ul>{cue.facts.map((fact, index) => <li key={`${cue.id}-${index}`}>{fact}</li>)}</ul>
            </Fragment>
          </div>
        </div>
        <footer className="briefing-controls">
          {sequence.presentation !== "center-stage" && <button onClick={() => dispatch({ type: "seek", cueIndex: 0 })} disabled={state.cueIndex === 0}><b>最初から</b><small>RESTART</small></button>}
          <button onClick={() => dispatch({ type: "previous" })} disabled={state.cueIndex === 0}><b>ひとつ戻る</b><small>BACK</small></button>
          {sequence.presentation !== "center-stage" && <button onClick={() => dispatch({ type: state.playing ? "pause" : "play" })} disabled={reducedMotion}><b>{state.playing ? "一時停止" : "自動再生"}</b><small>{reducedMotion ? "静止表示中" : state.playing ? "PAUSE" : "PLAY"}</small></button>}
          <button onClick={() => setReplayKey((value) => value + 1)}><b>もう一度再生</b><small>REPLAY</small></button>
          <button ref={primaryRef} className="primary" onClick={advance}><b>{last ? sequence.finishLabel : "次へ"}</b><small>{last ? "END REEL" : "NEXT SCENE"}</small></button>
          {sequence.quickComplete && onQuickComplete && <button className="briefing-quick-complete" onClick={onQuickComplete}><b>説明だけで修了</b><small>ONE TAP CLEAR</small></button>}
        </footer>
      </section>
    </div>
  );
}

function plainActionHint(cue: BriefingCue) {
  if (cue.focus === "own-plot") return "自軍図の光るマスだけ見ればOKです";
  if (cue.focus === "hostile-plot") return "敵情図の光るマスだけ見ればOKです";
  if (cue.focus === "placement-tools") return "ROTATEで回転し、LOCKで決定します";
  if (cue.focus === "command-deck") return "光っている兵装ボタンを選びます";
  if (cue.focus === "confirm-action") return "プレビューを見て、最後に実行を押します";
  if (cue.focus === "damage-report") return "被害を見て、報告ボタンを1回押します";
  if (cue.focus === "plot-switch") return "自軍図と敵情図の切替場所を見ます";
  if (cue.focus === "result") return "結果を眺めれば完了です";
  return "まずは画面を見るだけで大丈夫です";
}

function BriefingMotionStage({ cue, replayKey }: Readonly<{ cue: BriefingCue; replayKey: number }>) {
  const marks = new Map((cue.marks ?? []).map((mark) => [`${mark.coord.x},${mark.coord.y}`, mark]));
  const motionCoords = [
    ...(cue.visual?.cells ?? []),
    ...(cue.visual?.from ? [cue.visual.from] : []),
    ...(cue.visual?.to ? [cue.visual.to] : []),
  ];
  const motion = new Set(motionCoords.map((coord) => `${coord.x},${coord.y}`));
  const placementDemo = cue.visual?.kind === "path" || cue.visual?.kind === "rotate";
  const markedCoords = (cue.marks ?? []).map((mark) => mark.coord);
  const destinationCoords = markedCoords.length ? markedCoords : motionCoords;
  const minX = destinationCoords.length ? Math.min(...destinationCoords.map((coord) => coord.x)) : 3;
  const maxX = destinationCoords.length ? Math.max(...destinationCoords.map((coord) => coord.x)) : minX;
  const minY = destinationCoords.length ? Math.min(...destinationCoords.map((coord) => coord.y)) : 3;
  const maxY = destinationCoords.length ? Math.max(...destinationCoords.map((coord) => coord.y)) : minY;
  const from = cue.visual?.from ?? destinationCoords[0] ?? { x: 3, y: 3 };
  const shipStyle = {
    "--ship-from-left": `${(from.x + .5) * 12.5}%`,
    "--ship-from-top": `${(from.y + .5) * 12.5}%`,
    "--ship-to-left": `${((minX + maxX + 1) * .5) * 12.5}%`,
    "--ship-to-top": `${((minY + maxY + 1) * .5) * 12.5}%`,
    "--ship-travel-x": `${(((minX + maxX) * .5 - from.x) * 12.5 / 34) * 100}%`,
    "--ship-travel-y": `${(((minY + maxY) * .5 - from.y) * 12.5 / 8) * 100}%`,
  } as CSSProperties;
  const destinationStyle = {
    left: `${minX * 12.5}%`, top: `${minY * 12.5}%`,
    width: `${(maxX - minX + 1) * 12.5}%`, height: `${(maxY - minY + 1) * 12.5}%`,
  } as CSSProperties;
  const cells = Array.from({ length: 64 }, (_, index) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    const mark = marks.get(`${x},${y}`);
    const active = motion.has(`${x},${y}`);
    return <span
      key={`${cue.id}-${replayKey}-${x}-${y}`}
      className={`briefing-motion-cell${mark ? ` tone-${mark.tone}` : ""}${active ? " is-moving" : ""}`}
      style={{ "--hint-delay": `${(x + y) * 45}ms` } as CSSProperties}
    >{mark?.label ?? ""}</span>;
  });
  return <div className={`briefing-motion-stage motion-${cue.visual?.kind ?? "scan"}`} role="img" aria-label="盤面の動くヒント図">
    <div className="briefing-motion-label"><b>動くヒント</b><span>{cue.plot === "enemy" ? "敵情図" : cue.plot === "player" ? "自軍図" : "操作の流れ"}</span></div>
    <div className="briefing-motion-grid">
      {cells}
      {placementDemo && <div className="briefing-demo-destination" style={destinationStyle}><b>ここへ置く</b></div>}
      {placementDemo && <div key={`${cue.id}-${replayKey}-ship`} className="briefing-demo-ship" style={shipStyle} aria-hidden="true"><b>DD</b><i /><i /></div>}
    </div>
    {!placementDemo && <div className="briefing-motion-hand" aria-hidden="true">＋</div>}
    <div className="briefing-action-strip">{actionSteps(cue).map((step, index) => <span key={`${cue.id}-action-${index}`}><b>{index + 1}</b>{step}</span>)}</div>
  </div>;
}

function actionSteps(cue: BriefingCue) {
  if (cue.visual?.kind === "path" || cue.visual?.kind === "rotate") return ["艦を押す", "ここへ動かす", "ROTATE", "LOCK"];
  if (cue.visual?.kind === "scan") return ["光る範囲を見る", "SONARを選ぶ", "実行"];
  if (cue.visual?.kind === "impact") return ["光るマスを見る", "結果を確認"];
  if (cue.focus === "command-deck") return ["兵装を選ぶ", "光るマスを押す", "実行"];
  return ["動きを見る", "説明を読む", "次へ"];
}

/**
 * On a portrait handset the briefing console occupies either the upper or
 * lower part of the visual viewport. scrollIntoView() knows nothing about
 * that fixed overlay, so make a second, minimal correction around the actual
 * marked cells (or the focused control when there are no cells).
 */
function revealCompactAnchor(anchor: HTMLElement, cue: BriefingCue, root: HTMLElement | null) {
  if (!window.matchMedia("(max-width: 1099px) and (orientation: portrait)").matches) return;
  const console = root?.querySelector<HTMLElement>(".briefing-console");
  if (!console) return;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const consoleRect = console.getBoundingClientRect();
  const gap = 10;
  const consoleAtTop = consoleRect.top <= viewportTop + (viewportBottom - viewportTop) / 2;
  const availableTop = consoleAtTop ? Math.min(viewportBottom, consoleRect.bottom + gap) : viewportTop + gap;
  const availableBottom = consoleAtTop ? viewportBottom - gap : Math.max(viewportTop, consoleRect.top - gap);
  if (availableBottom <= availableTop) return;

  const target = briefingTargetBand(anchor, cue);
  const availableHeight = availableBottom - availableTop;
  const targetHeight = target.bottom - target.top;
  let delta = 0;
  if (targetHeight > availableHeight) {
    delta = (target.top + target.bottom) / 2 - (availableTop + availableBottom) / 2;
  } else if (target.top < availableTop) {
    delta = target.top - availableTop;
  } else if (target.bottom > availableBottom) {
    delta = target.bottom - availableBottom;
  }
  if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
}

function briefingTargetBand(anchor: HTMLElement, cue: BriefingCue) {
  const coords = [
    ...(cue.marks ?? []).map((mark) => mark.coord),
    ...(cue.visual?.cells ?? []),
    ...(cue.visual?.from ? [cue.visual.from] : []),
    ...(cue.visual?.to ? [cue.visual.to] : []),
  ];
  const canvasWrap = anchor.querySelector<HTMLElement>(".canvas-wrap");
  if (canvasWrap && coords.length) {
    const rect = canvasWrap.getBoundingClientRect();
    const margin = rect.width * .075;
    const cell = (rect.width - margin * 1.18) / 8;
    const rows = coords.map((coord) => coord.y);
    return {
      top: rect.top + margin + Math.min(...rows) * cell,
      bottom: rect.top + margin + (Math.max(...rows) + 1) * cell,
    };
  }
  const rect = anchor.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

function visibleAnchor(focus: BriefingCue["focus"]) {
  if (focus === "overview") return null;
  const matches = [...document.querySelectorAll<HTMLElement>(`[data-briefing-anchor="${focus}"]`)];
  return matches.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
  }) ?? null;
}
