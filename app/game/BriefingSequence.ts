import type { Coord } from "./constants.ts";

/**
 * Presentation contract shared by training reels, mode introductions,
 * operation briefings and after-action sequences.  It contains no game-state
 * mutations, so every caller can use the same player without adding phases to
 * the battle state machine.
 */
export type BriefingKind = "training-intro" | "training-debrief" | "mode-intro" | "operation-clear";
export type BriefingFocus =
  | "overview"
  | "status"
  | "plot-switch"
  | "own-plot"
  | "hostile-plot"
  | "placement-tools"
  | "command-deck"
  | "confirm-action"
  | "damage-report"
  | "result";
export type BriefingPlot = "player" | "enemy";
export type BriefingMarkTone = "observe" | "target" | "exclude" | "link";
export type BriefingVisualKind = "scan" | "path" | "rotate" | "echo-cross" | "weapon-pattern" | "impact" | "link";

export type BriefingVisual = Readonly<{
  kind: BriefingVisualKind;
  cells?: ReadonlyArray<Coord>;
  from?: Coord;
  to?: Coord;
}>;

export type BriefingPlotMark = Readonly<{
  coord: Coord;
  label: string;
  tone: BriefingMarkTone;
}>;

export type BriefingCue = Readonly<{
  id: string;
  chapter: "WATCH" | "READ" | "GUIDED" | "CHECK" | "DEBRIEF";
  kicker: string;
  title: string;
  narration: string;
  caption: string;
  focus: BriefingFocus;
  plot?: BriefingPlot;
  marks?: ReadonlyArray<BriefingPlotMark>;
  visual?: BriefingVisual;
  facts: ReadonlyArray<string>;
  durationMs: number;
}>;

export type BriefingSequence = Readonly<{
  id: string;
  kind: BriefingKind;
  eyebrow: string;
  title: string;
  subtitle: string;
  cues: ReadonlyArray<BriefingCue>;
  finishLabel: string;
  allowSkip: boolean;
  presentation?: "center-stage" | "edge-console";
  quickComplete?: boolean;
}>;

export type BriefingSequenceDefinition = Readonly<{
  id: string;
  kind: BriefingKind;
  eyebrow: string;
  title: string;
  subtitle: string;
  cues: ReadonlyArray<BriefingCue>;
  finishLabel: string;
  allowSkip?: boolean;
  presentation?: "center-stage" | "edge-console";
  quickComplete?: boolean;
}>;

export type BriefingDismissReason = "complete" | "skip";

export function buildBriefingSequence(input: BriefingSequenceDefinition): BriefingSequence {
  if (!input.cues.length) throw new Error(`${input.id} briefing has no cues`);
  const ids = new Set<string>();
  for (const cue of input.cues) {
    if (!cue.id.trim()) throw new Error(`${input.id} briefing has a cue without an id`);
    if (ids.has(cue.id)) throw new Error(`${input.id} briefing has duplicate cue ${cue.id}`);
    ids.add(cue.id);
  }
  return { ...input, allowSkip: input.allowSkip ?? true, cues: [...input.cues] };
}

type SinglePurposeBriefingInput = Readonly<{
  id: string;
  title: string;
  subtitle: string;
  facts: readonly string[];
  cues?: ReadonlyArray<BriefingCue>;
  finishLabel?: string;
  allowSkip?: boolean;
}>;

export function buildModeIntroductionSequence(input: SinglePurposeBriefingInput): BriefingSequence {
  return singlePurposeSequence("mode-intro", input, input.finishLabel ?? "作戦配置へ", "MODE AUTHORIZATION / 作戦区分");
}

export function buildOperationClearSequence(input: SinglePurposeBriefingInput): BriefingSequence {
  return singlePurposeSequence("operation-clear", input, input.finishLabel ?? "作戦報告へ", "OPERATION COMPLETE / 作戦完了");
}

function singlePurposeSequence(
  kind: "mode-intro" | "operation-clear",
  input: SinglePurposeBriefingInput,
  finishLabel: string,
  eyebrow: string,
): BriefingSequence {
  const defaultCue: BriefingCue = {
    id: `${input.id}-overview`,
    chapter: kind === "operation-clear" ? "DEBRIEF" : "WATCH",
    kicker: eyebrow,
    title: input.title,
    narration: input.subtitle,
    caption: input.facts[0] ?? "表示内容を確認してください。",
    focus: kind === "operation-clear" ? "result" : "overview",
    facts: input.facts,
    durationMs: 8000,
  };
  return buildBriefingSequence({
    id: input.id,
    kind,
    eyebrow,
    title: input.title,
    subtitle: input.subtitle,
    finishLabel,
    allowSkip: input.allowSkip,
    cues: input.cues?.length ? input.cues : [defaultCue],
  });
}
