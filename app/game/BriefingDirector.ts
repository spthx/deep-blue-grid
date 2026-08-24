import type { BriefingDismissReason, BriefingSequence } from "./BriefingSequence.ts";

export type BriefingDirectorState = Readonly<{
  sequence: BriefingSequence | null;
  cueIndex: number;
  playing: boolean;
  lastDismissReason: BriefingDismissReason | null;
}>;

export type BriefingDirectorAction =
  | { type: "open"; sequence: BriefingSequence; cueIndex?: number; playing?: boolean }
  | { type: "next" }
  | { type: "previous" }
  | { type: "seek"; cueIndex: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "close"; reason?: BriefingDismissReason };

export const CLOSED_BRIEFING: BriefingDirectorState = { sequence: null, cueIndex: 0, playing: false, lastDismissReason: null };

/**
 * Pure and deterministic: timers and DOM focus live in the presentation
 * component, while navigation can be tested without a browser or game state.
 */
export function briefingDirector(state: BriefingDirectorState, action: BriefingDirectorAction): BriefingDirectorState {
  if (action.type === "open") {
    if (!action.sequence.cues.length) return CLOSED_BRIEFING;
    const cueIndex = clampCue(action.sequence, action.cueIndex ?? 0);
    return { sequence: action.sequence, cueIndex, playing: Boolean(action.playing), lastDismissReason: null };
  }
  if (action.type === "close") {
    return action.reason ? { ...CLOSED_BRIEFING, lastDismissReason: action.reason } : CLOSED_BRIEFING;
  }
  if (!state.sequence) return state;
  if (action.type === "play") return { ...state, playing: state.sequence.cues.length > 0 };
  if (action.type === "pause") return { ...state, playing: false };
  if (action.type === "seek") return { ...state, cueIndex: clampCue(state.sequence, action.cueIndex), playing: false };
  if (action.type === "previous") return { ...state, cueIndex: Math.max(0, safeCueIndex(state) - 1), playing: false };
  if (action.type === "next") {
    const last = Math.max(0, state.sequence.cues.length - 1);
    const cueIndex = safeCueIndex(state);
    return cueIndex >= last ? { ...state, cueIndex: last, playing: false } : { ...state, cueIndex: cueIndex + 1 };
  }
  return state;
}

export function currentBriefingCue(state: BriefingDirectorState) {
  if (!state.sequence?.cues.length) return null;
  return state.sequence.cues[clampCue(state.sequence, state.cueIndex)] ?? null;
}

export function isLastBriefingCue(state: BriefingDirectorState) {
  return Boolean(state.sequence?.cues.length) && safeCueIndex(state) === state.sequence!.cues.length - 1;
}

function clampCue(sequence: BriefingSequence, cueIndex: number) {
  const finiteIndex = Number.isFinite(cueIndex) ? Math.trunc(cueIndex) : 0;
  return Math.min(Math.max(0, finiteIndex), Math.max(0, sequence.cues.length - 1));
}

function safeCueIndex(state: BriefingDirectorState) {
  return state.sequence ? clampCue(state.sequence, state.cueIndex) : 0;
}
