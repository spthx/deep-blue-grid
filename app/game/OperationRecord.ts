import type { ShipId } from "./constants.ts";

export type OperationStageRecord = {
  ordinal: number;
  title: string;
  engagements: number;
  retries: number;
  turns: number;
  shots: number;
  hits: number;
  specials: number;
  damage: number;
  losses: ShipId[];
  activeMs: number;
  completed: boolean;
};

export type OperationRecordSnapshot = {
  activeMs: number;
  engagements: number;
  retries: number;
  turns: number;
  shots: number;
  hits: number;
  specials: number;
  damage: number;
  confirmedLosses: ShipId[];
  stages: OperationStageRecord[];
};

export class OperationRecorder {
  private activeMs = 0;
  private activeSince: number | null;
  private finished = false;
  private stageStartedAt = new Map<number, number>();
  private stages: OperationStageRecord[];
  private confirmedLosses = new Set<ShipId>();

  constructor(titles: string[], now = 0) {
    this.activeSince = now;
    this.stages = titles.map((title, index) => ({
      ordinal: index + 1,
      title,
      engagements: 0,
      retries: 0,
      turns: 0,
      shots: 0,
      hits: 0,
      specials: 0,
      damage: 0,
      losses: [],
      activeMs: 0,
      completed: false,
    }));
    this.stageStartedAt.set(0, 0);
  }

  pause(now: number) {
    if (this.activeSince === null || this.finished) return;
    this.activeMs += Math.max(0, now - this.activeSince);
    this.activeSince = null;
  }

  resume(now: number) {
    if (this.activeSince !== null || this.finished) return;
    this.activeSince = now;
  }

  beginStage(index: number, now: number) {
    this.resume(now);
    if (!this.stageStartedAt.has(index)) this.stageStartedAt.set(index, this.elapsed(now));
  }

  noteEngagement(index: number) {
    const stage = this.stages[index];
    if (stage) stage.engagements += 1;
  }

  noteRetry(index: number) {
    const stage = this.stages[index];
    if (stage) stage.retries += 1;
  }

  noteAction(index: number, shots: number, hits: number, special: boolean) {
    const stage = this.stages[index];
    if (!stage) return;
    stage.turns += 1;
    stage.shots += shots;
    stage.hits += hits;
    if (special) stage.specials += 1;
  }

  noteDamage(index: number, sections: number) {
    const stage = this.stages[index];
    if (stage) stage.damage += Math.max(0, sections);
  }

  completeStage(index: number, losses: ShipId[], now: number) {
    const stage = this.stages[index];
    if (!stage || stage.completed) return;
    const start = this.stageStartedAt.get(index) ?? 0;
    stage.activeMs = Math.max(0, this.elapsed(now) - start);
    stage.losses = [...new Set(losses)];
    stage.losses.forEach((id) => this.confirmedLosses.add(id));
    stage.completed = true;
  }

  finish(now: number) {
    this.pause(now);
    this.finished = true;
  }

  snapshot(now: number): OperationRecordSnapshot {
    const stages = this.stages.map((stage) => ({
      ...stage,
      losses: [...stage.losses],
      activeMs: stage.completed
        ? stage.activeMs
        : Math.max(0, this.elapsed(now) - (this.stageStartedAt.get(stage.ordinal - 1) ?? this.elapsed(now))),
    }));
    return {
      activeMs: this.elapsed(now),
      engagements: stages.reduce((sum, stage) => sum + stage.engagements, 0),
      retries: stages.reduce((sum, stage) => sum + stage.retries, 0),
      turns: stages.reduce((sum, stage) => sum + stage.turns, 0),
      shots: stages.reduce((sum, stage) => sum + stage.shots, 0),
      hits: stages.reduce((sum, stage) => sum + stage.hits, 0),
      specials: stages.reduce((sum, stage) => sum + stage.specials, 0),
      damage: stages.reduce((sum, stage) => sum + stage.damage, 0),
      confirmedLosses: [...this.confirmedLosses],
      stages,
    };
  }

  private elapsed(now: number) {
    return this.activeMs + (this.activeSince === null || this.finished ? 0 : Math.max(0, now - this.activeSince));
  }
}

export function formatOperationDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
