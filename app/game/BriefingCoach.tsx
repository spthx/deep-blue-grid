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
}>;

export function BriefingCoach({ state, dispatch, reducedMotion, onCueChange, onDismiss }: BriefingCoachProps) {
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
      className={`briefing-coach briefing-${sequence.kind} focus-${cue.focus} ${state.playing && !reducedMotion ? "playing" : "paused"}`}
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
          <div role="progressbar" aria-valuemin={1} aria-valuemax={sequence.cues.length} aria-valuenow={state.cueIndex + 1} style={{ "--briefing-progress": `${progress}%` } as CSSProperties} />
          <span>SCENE {String(state.cueIndex + 1).padStart(2, "0")} / {String(sequence.cues.length).padStart(2, "0")}</span>
        </div>
        <div className="briefing-copy" role="status" aria-live="polite" aria-atomic="true">
          <Fragment key={`${cue.id}-copy-${replayKey}`}>
            <div className="briefing-chapter"><span>{cue.chapter}</span><small>{cue.kicker}</small></div>
            <h2 id="briefing-cue-title">{cue.title}</h2>
            <p id="briefing-cue-narration">{cue.narration}</p>
            <strong>{cue.caption}</strong>
            <ul>{cue.facts.map((fact, index) => <li key={`${cue.id}-${index}`}>{fact}</li>)}</ul>
          </Fragment>
        </div>
        <footer className="briefing-controls">
          <button onClick={() => dispatch({ type: "seek", cueIndex: 0 })} disabled={state.cueIndex === 0}><b>最初から</b><small>RESTART</small></button>
          <button onClick={() => dispatch({ type: "previous" })} disabled={state.cueIndex === 0}><b>戻る</b><small>PREVIOUS</small></button>
          <button onClick={() => dispatch({ type: state.playing ? "pause" : "play" })} disabled={reducedMotion}><b>{state.playing ? "一時停止" : "自動再生"}</b><small>{reducedMotion ? "静止表示中" : state.playing ? "PAUSE" : "PLAY"}</small></button>
          <button onClick={() => setReplayKey((value) => value + 1)}><b>もう一度</b><small>REPLAY SCENE</small></button>
          <button ref={primaryRef} className="primary" onClick={advance}><b>{last ? sequence.finishLabel : "次へ"}</b><small>{last ? "END REEL" : "NEXT SCENE"}</small></button>
        </footer>
      </section>
    </div>
  );
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
