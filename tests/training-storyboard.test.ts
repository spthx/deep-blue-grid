import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TRAINING_STAGES } from "../app/game/Campaign.ts";
import { GRID_SIZE } from "../app/game/constants.ts";
import {
  CLOSED_BRIEFING,
  briefingDirector,
  currentBriefingCue,
  isLastBriefingCue,
} from "../app/game/BriefingDirector.ts";
import {
  briefingCueIndexForTrainingStep,
  buildBriefingSequence,
  buildModeIntroductionSequence,
  buildOperationClearSequence,
  buildTrainingDamageReview,
  buildTrainingDebrief,
  buildTrainingIntroduction,
  buildTrainingStepBriefing,
  buildTrainingStoryboard,
  trainingDirectiveCount,
  type BriefingSequence,
} from "../app/game/TrainingStoryboard.ts";

const EXPECTED_LESSONS = [7, 1, 2, 3, 4, 5, 6, 8, 9];
const VALID_MARK_TONES = new Set(["observe", "target", "exclude", "link"]);
const BRIEFING_COACH_SOURCE = readFileSync(new URL("../app/game/BriefingCoach.tsx", import.meta.url), "utf8");
const DEEP_BLUE_GRID_SOURCE = readFileSync(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");

function assertNonBlank(value: string, label: string) {
  assert.equal(typeof value, "string", `${label} is text`);
  assert.ok(value.trim().length > 0, `${label} is not blank`);
}

function expectedIntroCueCount(stage: (typeof TRAINING_STAGES)[number]) {
  const training = stage.training!;
  return 3
    + (training.placementDrill ? 2 : 0)
    + (training.enemyDemonstration ? 2 : 0)
    + training.steps.length * 3;
}

test("all nine authored lessons produce complete intro and debrief reels", () => {
  assert.equal(TRAINING_STAGES.length, 9);
  assert.deepEqual(TRAINING_STAGES.map((stage) => stage.training?.lesson), EXPECTED_LESSONS);

  for (const stage of TRAINING_STAGES) {
    const training = stage.training;
    assert.ok(training, `${stage.title} has a training plan`);

    const intro = buildTrainingStoryboard(stage);
    const debrief = buildTrainingDebrief(stage);
    assert.equal(intro.id, `training-${stage.id}-intro-v2`);
    assert.equal(intro.kind, "training-intro");
    assert.equal(intro.allowSkip, true);
    assert.equal(intro.presentation, "center-stage");
    assert.equal(intro.quickComplete, true);
    assert.equal(intro.cues.length, expectedIntroCueCount(stage));
    assert.equal(debrief.id, `training-${stage.id}-debrief-v2`);
    assert.equal(debrief.kind, "training-debrief");
    assert.equal(debrief.allowSkip, true);
    assert.equal(debrief.cues.length, 3);

    intro.cues.slice(0, 3).forEach((cue, index) => assert.ok(cue.durationMs >= [6500, 8500, 7000][index], `${stage.title} retains the watch/read/interface floor`));
    debrief.cues.forEach((cue, index) => assert.ok(cue.durationMs >= [6500, 7000, 8000][index], `${stage.title} retains the debrief floor`));
  }
});

test("phase-specific training reels expose only controls that exist in that phase", () => {
  const segmentedIds: string[] = [];
  for (const stage of TRAINING_STAGES) {
    const training = stage.training!;
    const opening = buildTrainingIntroduction(stage);
    segmentedIds.push(opening.id);
    assert.ok(opening.cues.length >= 3, `${stage.title} has an opening orientation reel`);
    assert.ok(opening.cues.every((cue) => !cue.id.includes("-step-")), `${stage.title} opening excludes operational steps`);
    assert.ok(opening.cues.every((cue) => !cue.id.endsWith("-hostile-demo") && !cue.id.endsWith("-report-demo")), `${stage.title} opening excludes post-impact review`);
    assert.ok(opening.cues.every((cue) => !["command-deck", "confirm-action", "damage-report"].includes(cue.focus)), `${stage.title} opening never points at an unavailable control`);
    assert.equal(opening.cues.some((cue) => cue.id.endsWith("-placement-watch")), Boolean(training.placementDrill));
    assert.equal(opening.cues.some((cue) => cue.id.endsWith("-placement-guided")), Boolean(training.placementDrill));

    training.steps.forEach((_step, index) => {
      const guided = buildTrainingStepBriefing(stage, index);
      segmentedIds.push(guided.id);
      assert.deepEqual(guided.cues.map((cue) => cue.id), [
        `lesson-${training.lesson}-step-${index + 1}-plot`,
        `lesson-${training.lesson}-step-${index + 1}-system`,
        `lesson-${training.lesson}-step-${index + 1}-commit`,
      ]);
      assert.deepEqual(guided.cues.map((cue) => cue.focus), ["hostile-plot", "command-deck", "confirm-action"]);
      assert.equal(new Set(guided.cues.map((cue) => cue.id)).size, guided.cues.length);
      assert.equal(guided.finishLabel, "操作へ戻る");
    });
    assert.throws(() => buildTrainingStepBriefing(stage, -1), /has no training step/);
    assert.throws(() => buildTrainingStepBriefing(stage, training.steps.length), /has no training step/);
  }
  assert.equal(new Set(segmentedIds).size, segmentedIds.length, "phase-specific sequence IDs are unique");

  const damageStage = TRAINING_STAGES.find((stage) => stage.training?.enemyDemonstration)!;
  const damageReview = buildTrainingDamageReview(damageStage);
  assert.deepEqual(damageReview.cues.map((cue) => cue.id), [
    `lesson-${damageStage.training!.lesson}-hostile-demo`,
    `lesson-${damageStage.training!.lesson}-report-demo`,
  ]);
  assert.deepEqual(damageReview.cues.map((cue) => cue.focus), ["own-plot", "damage-report"]);
  assert.equal(damageReview.finishLabel, damageStage.training!.enemyDemonstration!.acknowledgmentLabel);
  for (const stage of TRAINING_STAGES.filter((candidate) => !candidate.training?.enemyDemonstration)) {
    assert.throws(() => buildTrainingDamageReview(stage), /has no hostile demonstration/);
  }
});

test("sequence and cue IDs remain globally unique across the training library", () => {
  const sequences = TRAINING_STAGES.flatMap((stage) => [
    buildTrainingStoryboard(stage),
    buildTrainingDebrief(stage),
  ]);
  const sequenceIds = sequences.map((sequence) => sequence.id);
  const cueIds = sequences.flatMap((sequence) => sequence.cues.map((cue) => cue.id));

  assert.equal(new Set(sequenceIds).size, sequenceIds.length, "sequence IDs are unique");
  assert.equal(new Set(cueIds).size, cueIds.length, "cue IDs are unique");
  for (const id of [...sequenceIds, ...cueIds]) assertNonBlank(id, "briefing ID");
});

test("authored copy, visual marks, and deliberate reading time stay presentation-safe", () => {
  for (const stage of TRAINING_STAGES) {
    for (const sequence of [buildTrainingStoryboard(stage), buildTrainingDebrief(stage)]) {
      assertNonBlank(sequence.eyebrow, `${sequence.id} eyebrow`);
      assertNonBlank(sequence.title, `${sequence.id} title`);
      assertNonBlank(sequence.subtitle, `${sequence.id} subtitle`);
      assertNonBlank(sequence.finishLabel, `${sequence.id} finish label`);

      for (const cue of sequence.cues) {
        assertNonBlank(cue.kicker, `${cue.id} kicker`);
        assertNonBlank(cue.title, `${cue.id} title`);
        assertNonBlank(cue.narration, `${cue.id} narration`);
        assertNonBlank(cue.caption, `${cue.id} caption`);
        assert.ok(Number.isInteger(cue.durationMs), `${cue.id} duration is an integer`);
        assert.ok(cue.durationMs >= 6500, `${cue.id} leaves at least 6.5 seconds to read`);
        assert.ok(cue.durationMs <= 18000, `${cue.id} keeps autoplay within the deliberate upper bound`);
        const copyLength = `${cue.title}${cue.narration}${cue.caption}${cue.facts.join("")}`.replace(/\s/g, "").length;
        assert.ok(cue.durationMs >= Math.min(18000, 4500 + copyLength * 55), `${cue.id} leaves reading time for its copy density`);
        assert.ok(cue.facts.length > 0, `${cue.id} has supporting facts`);
        cue.facts.forEach((fact, index) => assertNonBlank(fact, `${cue.id} fact ${index + 1}`));

        for (const mark of cue.marks ?? []) {
          assert.ok(cue.plot, `${cue.id} declares a plot when it contains map marks`);
          assert.ok(Number.isInteger(mark.coord.x), `${cue.id} mark x is an integer`);
          assert.ok(Number.isInteger(mark.coord.y), `${cue.id} mark y is an integer`);
          assert.ok(mark.coord.x >= 0 && mark.coord.x < GRID_SIZE, `${cue.id} mark x is on the grid`);
          assert.ok(mark.coord.y >= 0 && mark.coord.y < GRID_SIZE, `${cue.id} mark y is on the grid`);
          assertNonBlank(mark.label, `${cue.id} mark label`);
          assert.ok(VALID_MARK_TONES.has(mark.tone), `${cue.id} mark tone is supported`);
        }
        for (const coord of [cue.visual?.from, cue.visual?.to, ...(cue.visual?.cells ?? [])].filter((item) => item !== undefined)) {
          assert.ok(Number.isInteger(coord.x) && Number.isInteger(coord.y), `${cue.id} visual coordinates are integers`);
          assert.ok(coord.x >= 0 && coord.x < GRID_SIZE, `${cue.id} visual x is on the grid`);
          assert.ok(coord.y >= 0 && coord.y < GRID_SIZE, `${cue.id} visual y is on the grid`);
        }
      }
    }
  }
});

test("every lesson preserves the novice safety copy and every order gets three guided beats", () => {
  for (const stage of TRAINING_STAGES) {
    const training = stage.training!;
    const sequence = buildTrainingStoryboard(stage);
    const orders = sequence.cues.find((cue) => cue.id === `lesson-${training.lesson}-orders`)!;
    const interfaceCue = sequence.cues.find((cue) => cue.id === `lesson-${training.lesson}-interface`)!;

    assert.match(orders.caption, /誤操作/);
    assert.match(orders.caption, /行動・弾薬・記録時間/);
    assert.match(interfaceCue.facts.join(" "), /自軍戦術図/);
    assert.match(interfaceCue.facts.join(" "), /敵情図/);
    assert.match(interfaceCue.facts.join(" "), /LOG/);

    training.steps.forEach((step, index) => {
      const cueIndex = briefingCueIndexForTrainingStep(sequence, index);
      const cues = sequence.cues.slice(cueIndex, cueIndex + 3);
      assert.deepEqual(cues.map((cue) => cue.id), [
        `lesson-${training.lesson}-step-${index + 1}-plot`,
        `lesson-${training.lesson}-step-${index + 1}-system`,
        `lesson-${training.lesson}-step-${index + 1}-commit`,
      ]);
      cues.forEach((cue, cueIndex) => assert.ok(cue.durationMs >= [8500, 7500, 8000][cueIndex]));
      assert.equal(cues[0].narration, step.instruction);
      assert.ok(cues[0].facts.includes(step.doctrine));
      assert.match(cues[2].facts.join(" "), /CANCEL/);
      assert.match(cues[2].facts.join(" "), /弾薬・行動は減りません/);
    });

    const transfer = buildTrainingDebrief(stage).cues.at(-1)!;
    assert.match(transfer.title, /本編では光る正解枠が消えます/);
    assert.match(`${transfer.narration} ${transfer.facts.join(" ")}`, /実戦/);
    assert.equal(transfer.focus, "result", "the transfer cue returns from battlefield review to the visible result report");
  }
});

test("directive counts include authored placement and hostile demonstrations", () => {
  for (const stage of TRAINING_STAGES) {
    const training = stage.training!;
    const expected = training.steps.length
      + (training.placementDrill ? 1 : 0)
      + (training.enemyDemonstration ? 1 : 0);
    assert.equal(trainingDirectiveCount(stage), expected, `${stage.title} directive count`);
  }

  assert.equal(trainingDirectiveCount(TRAINING_STAGES.find((stage) => stage.training?.lesson === 7)!), 2);
  assert.equal(trainingDirectiveCount(TRAINING_STAGES.find((stage) => stage.training?.lesson === 8)!), 2);
});

test("training step lookup lands on each plot cue and rejects unknown steps safely", () => {
  for (const stage of TRAINING_STAGES) {
    const sequence = buildTrainingStoryboard(stage);
    const training = stage.training!;
    const firstStepIndex = 3
      + (training.placementDrill ? 2 : 0)
      + (training.enemyDemonstration ? 2 : 0);

    training.steps.forEach((_step, index) => {
      const cueIndex = briefingCueIndexForTrainingStep(sequence, index);
      assert.equal(cueIndex, firstStepIndex + index * 3);
      assert.match(sequence.cues[cueIndex].id, new RegExp(`-step-${index + 1}-plot$`));
    });
    assert.equal(briefingCueIndexForTrainingStep(sequence, training.steps.length), 0);
    assert.equal(briefingCueIndexForTrainingStep(sequence, -1), 0);
  }
});

test("generic mode and operation sequences share the briefing player contract", () => {
  const mode = buildModeIntroductionSequence({
    id: "mode-tactics",
    title: "TACTICS",
    subtitle: "公開情報だけで敵艦隊を追跡します。",
    facts: ["敵耐久は秘匿", "重要区画で識別"],
  });
  const clear = buildOperationClearSequence({
    id: "operation-06-clear",
    title: "OPERATION COMPLETE",
    subtitle: "最終戦果を確認します。",
    facts: ["全敵艦撃沈"],
  });
  const emptyFacts = buildModeIntroductionSequence({ id: "mode-empty", title: "EMPTY", subtitle: "確認", facts: [] });

  assert.deepEqual(
    [mode.kind, mode.cues[0].chapter, mode.cues[0].focus, mode.finishLabel],
    ["mode-intro", "WATCH", "overview", "作戦配置へ"],
  );
  assert.deepEqual(
    [clear.kind, clear.cues[0].chapter, clear.cues[0].focus, clear.finishLabel],
    ["operation-clear", "DEBRIEF", "result", "作戦報告へ"],
  );
  for (const sequence of [mode, clear]) {
    assert.equal(sequence.allowSkip, true);
    assert.equal(sequence.cues.length, 1);
    assert.equal(sequence.cues[0].id, `${sequence.id}-overview`);
    assert.equal(sequence.cues[0].durationMs, 8000);
    assert.equal(sequence.cues[0].caption, sequence.cues[0].facts[0]);
  }
  assert.equal(emptyFacts.cues[0].caption, "表示内容を確認してください。");

  const multiScene = buildModeIntroductionSequence({
    id: "mode-multi",
    title: "SURVIVAL",
    subtitle: "残存戦力を引き継ぎます。",
    facts: [],
    finishLabel: "作戦群へ",
    allowSkip: false,
    cues: [mode.cues[0], { ...mode.cues[0], id: "mode-multi-second", focus: "own-plot", plot: "player", visual: { kind: "scan", cells: [{ x: 1, y: 1 }] } }],
  });
  assert.equal(multiScene.cues.length, 2);
  assert.equal(multiScene.finishLabel, "作戦群へ");
  assert.equal(multiScene.allowSkip, false);

  assert.throws(() => buildBriefingSequence({ ...multiScene, id: "empty", cues: [] }), /has no cues/);
  assert.throws(() => buildBriefingSequence({ ...multiScene, id: "duplicate", cues: [mode.cues[0], mode.cues[0]] }), /duplicate cue/);
});

test("briefing director opens, navigates, clamps, pauses, and closes deterministically", () => {
  const sequence = buildTrainingStoryboard(TRAINING_STAGES[0]);
  assert.equal(currentBriefingCue(CLOSED_BRIEFING), null);
  assert.equal(isLastBriefingCue(CLOSED_BRIEFING), false);
  assert.strictEqual(briefingDirector(CLOSED_BRIEFING, { type: "next" }), CLOSED_BRIEFING);

  let state = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence, cueIndex: 1.9, playing: true });
  assert.equal(state.cueIndex, 1);
  assert.equal(state.playing, true);
  assert.equal(state.lastDismissReason, null);
  assert.strictEqual(currentBriefingCue(state), sequence.cues[1]);

  state = briefingDirector(state, { type: "next" });
  assert.equal(state.cueIndex, 2);
  assert.equal(state.playing, true);
  state = briefingDirector(state, { type: "previous" });
  assert.equal(state.cueIndex, 1);
  assert.equal(state.playing, false);
  state = briefingDirector(state, { type: "play" });
  assert.equal(state.playing, true);
  state = briefingDirector(state, { type: "pause" });
  assert.equal(state.playing, false);

  state = briefingDirector(state, { type: "seek", cueIndex: -99 });
  assert.equal(state.cueIndex, 0);
  state = briefingDirector(state, { type: "seek", cueIndex: 999 });
  assert.equal(state.cueIndex, sequence.cues.length - 1);
  assert.equal(isLastBriefingCue(state), true);
  assert.strictEqual(currentBriefingCue(state), sequence.cues.at(-1));

  state = briefingDirector(state, { type: "play" });
  state = briefingDirector(state, { type: "next" });
  assert.equal(state.cueIndex, sequence.cues.length - 1);
  assert.equal(state.playing, false, "next on the last cue stops autoplay");
  assert.strictEqual(briefingDirector(state, { type: "close" }), CLOSED_BRIEFING);
});

test("briefing director safely handles invalid positions and rejects an empty reel", () => {
  const sequence = buildTrainingStoryboard(TRAINING_STAGES[0]);
  const below = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence, cueIndex: -10 });
  const above = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence, cueIndex: 10_000 });
  const notANumber = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence, cueIndex: Number.NaN, playing: true });
  assert.equal(below.cueIndex, 0);
  assert.equal(above.cueIndex, sequence.cues.length - 1);
  assert.equal(notANumber.cueIndex, 0);
  assert.equal(notANumber.playing, true);
  assert.strictEqual(currentBriefingCue(notANumber), sequence.cues[0]);

  const corrupted = { ...notANumber, cueIndex: Number.NaN };
  assert.strictEqual(currentBriefingCue(corrupted), sequence.cues[0]);
  assert.equal(briefingDirector(corrupted, { type: "next" }).cueIndex, 1);
  assert.equal(briefingDirector(corrupted, { type: "previous" }).cueIndex, 0);
  assert.equal(briefingDirector(corrupted, { type: "seek", cueIndex: Number.NaN }).cueIndex, 0);

  const empty: BriefingSequence = { ...sequence, id: "empty-reel", cues: [] };
  const emptyState = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence: empty, cueIndex: 5, playing: true });
  assert.strictEqual(emptyState, CLOSED_BRIEFING, "an empty reel never leaves an invisible modal lock");
  assert.equal(currentBriefingCue(emptyState), null);
  assert.equal(isLastBriefingCue(emptyState), false);
});

test("briefing director retains a user dismissal reason until the next valid reel opens", () => {
  const sequence = buildTrainingStoryboard(TRAINING_STAGES[0]);
  const opened = briefingDirector(CLOSED_BRIEFING, { type: "open", sequence });
  const skipped = briefingDirector(opened, { type: "close", reason: "skip" });
  assert.equal(skipped.sequence, null);
  assert.equal(skipped.lastDismissReason, "skip");
  assert.strictEqual(briefingDirector(skipped, { type: "next" }), skipped);

  const reopened = briefingDirector(skipped, { type: "open", sequence });
  assert.equal(reopened.lastDismissReason, null);
  const completed = briefingDirector(reopened, { type: "close", reason: "complete" });
  assert.equal(completed.lastDismissReason, "complete");
  assert.strictEqual(briefingDirector(completed, { type: "close" }), CLOSED_BRIEFING);
});

test("coach replay and accessibility contracts keep one scene readable and restartable", () => {
  assert.match(BRIEFING_COACH_SOURCE, /\[cue, dispatch, last, reducedMotion, replayKey, state\.playing\]/, "replay restarts the autoplay timer");
  assert.match(BRIEFING_COACH_SOURCE, /requestAnimationFrame\(\(\) => \{[\s\S]*?update\(true\)[\s\S]*?requestAnimationFrame\(\(\) => update\(true\)\)/, "the visible anchor is re-resolved after plot switching");
  assert.match(BRIEFING_COACH_SOURCE, /new ResizeObserver\(\(\) => update\(\)\)/, "the current visible anchor remains observed");
  assert.match(BRIEFING_COACH_SOURCE, /className="briefing-copy" role="status" aria-live="polite" aria-atomic="true"/, "the live-region container remains stable and atomic");
  assert.doesNotMatch(BRIEFING_COACH_SOURCE, /className="briefing-copy" key=/, "replaying does not replace the live-region root");
  assert.match(BRIEFING_COACH_SOURCE, /revealCompactAnchor\(anchor, cue, rootRef\.current\)/, "compact reels correct for the fixed briefing console");
  assert.match(BRIEFING_COACH_SOURCE, /const consoleAtTop[\s\S]*?availableTop[\s\S]*?availableBottom[\s\S]*?window\.scrollBy/, "compact correction preserves the unobscured visual viewport");
  assert.match(BRIEFING_COACH_SOURCE, /cue\.marks[\s\S]*?cue\.visual\?\.cells[\s\S]*?\.canvas-wrap/, "plot correction follows the authored marked cells rather than only the panel bounds");
  assert.match(BRIEFING_COACH_SOURCE, /BriefingMotionStage/, "training presents a central animated mini plot");
  assert.match(BRIEFING_COACH_SOURCE, /説明だけで修了/, "a novice can finish the lesson from one large action");
});

test("training briefing integration keeps result focus and the active-time clock coherent", () => {
  assert.match(DEEP_BLUE_GRID_SOURCE, /const resultDialogOpen = \(phase === "victory" \|\| phase === "defeat"\) && !resultReview && !briefingState\.sequence/, "briefing playback suppresses the competing result-dialog focus trap");
  assert.match(DEEP_BLUE_GRID_SOURCE, /setResultReview\(Boolean\(cue\?\.plot\)\)/, "debrief plot cues switch into battlefield review and result cues switch back");
  assert.match(DEEP_BLUE_GRID_SOURCE, /setVisibleBoard\(phase === "player" \? "enemy" : "player"\)/, "closing a reel restores the board required by the current phase");
  assert.match(DEEP_BLUE_GRID_SOURCE, /&& !briefingState\.sequence\) resumeMissionClock\(\)/, "returning from background cannot restart the active-time clock underneath a briefing");
  assert.match(DEEP_BLUE_GRID_SOURCE, /onQuickComplete=\{briefingState\.sequence\?\.kind === "training-intro" \? quickCompleteTraining : undefined\}/,
    "one-tap completion exists only on training introductions");
  assert.match(DEEP_BLUE_GRID_SOURCE, /updateStoredTrainingProgress\(training\.lesson\)/,
    "one-tap completion uses the same durable lesson progress store");
});

test("training debrief rejects an authored lesson without any operational step", () => {
  const source = TRAINING_STAGES[0];
  const noStepStage = { ...source, training: { ...source.training!, steps: [] } };
  assert.throws(() => buildTrainingDebrief(noStepStage), /training debrief requires at least one step/);
});
