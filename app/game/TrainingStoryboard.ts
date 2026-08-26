import { CELL_LABELS, SHIPS, type Coord, type Orientation, type WeaponId } from "./constants.ts";
import type { MissionOrder, MissionPlacement, MissionStageDefinition, TrainingStep } from "./Campaign.ts";
import { Board, harpoonCells, radarCells, straddleCells } from "./engine.ts";
import type { BriefingCue, BriefingFocus, BriefingPlot, BriefingPlotMark, BriefingSequence, BriefingVisual } from "./BriefingSequence.ts";
import { buildBriefingSequence } from "./BriefingSequence.ts";
export { buildBriefingSequence, buildModeIntroductionSequence, buildOperationClearSequence } from "./BriefingSequence.ts";
export type {
  BriefingCue,
  BriefingDismissReason,
  BriefingFocus,
  BriefingKind,
  BriefingMarkTone,
  BriefingPlot,
  BriefingPlotMark,
  BriefingSequence,
  BriefingSequenceDefinition,
  BriefingVisual,
  BriefingVisualKind,
} from "./BriefingSequence.ts";

type StoryNote = Readonly<{
  conceptTitle: string;
  concept: string;
  visual: string;
  focus: BriefingFocus;
  plot?: BriefingPlot;
  marks?: ReadonlyArray<BriefingPlotMark>;
  facts: ReadonlyArray<string>;
}>;

const coordName = (coord: Coord) => `${CELL_LABELS[coord.y]}-${coord.x + 1}`;

const STORY_NOTES: Readonly<Record<number, StoryNote>> = {
  7: {
    conceptTitle: "艦影は位置・向き・占有区画で決まります",
    concept: "今は駆逐艦だけを見ます。艦影をE-2へ動かし、艦首を南へ向けるとE-2からG-2までの3区画を使います。",
    visual: "盤面上のE-2、F-2、G-2が一つの艦として収まることを確認します。",
    focus: "own-plot",
    plot: "player",
    marks: [
      { coord: { x: 1, y: 4 }, label: "START", tone: "target" },
      { coord: { x: 1, y: 5 }, label: "HULL", tone: "observe" },
      { coord: { x: 1, y: 6 }, label: "BOW", tone: "observe" },
    ],
    facts: ["ドラッグは仮置きです。LOCKで配置を確定します。", "ROTATEは押すたび東→南→西→北と90度ずつ回ります。", "赤い艦影は盤外または重複で、確定できません。"],
  },
  1: {
    conceptTitle: "座標は英字の行と数字の列の交点です",
    concept: "左端のA～Hが横の行、上端の1～8が縦の列です。D行と4列が交わる区画をD-4と読みます。",
    visual: "D行を横に、4列を縦にたどり、交点D-4だけを照準として残します。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [{ coord: { x: 3, y: 3 }, label: "D-4", tone: "target" }],
    facts: ["攻撃は敵情図で指定します。", "区画を選んだだけでは発射されません。", "照準内容を見てから発射ボタンで確定します。"],
  },
  2: {
    conceptTitle: "ECHOが示すのは上下左右の4方向だけです",
    concept: "ECHOの着弾区画そのものは空です。ただし上下左右のどこかに生存艦区画があります。斜めは候補に入りません。",
    visual: "C-4とD-3のECHOに共通するのはC-3とD-4です。C-3には既にMISSがあるため除外し、D-4を確定します。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [
      { coord: { x: 3, y: 2 }, label: "A", tone: "observe" },
      { coord: { x: 2, y: 3 }, label: "B", tone: "observe" },
      { coord: { x: 2, y: 2 }, label: "OUT", tone: "exclude" },
      { coord: { x: 3, y: 3 }, label: "FIX", tone: "target" },
    ],
    facts: ["ECHOは命中ではありません。", "艦種・向き・長さは分かりません。", "複数の反響とMISSを重ねると候補を絞れます。"],
  },
  3: {
    conceptTitle: "既知の損傷と反響から残存方向を復元します",
    concept: "HIT、MISS、ECHOを別々に見ず、一枚の戦術図として重ねます。残る船影へ8-INCH STRADDLEの射撃扇を合わせます。",
    visual: "E-5を基準区画にして北へ向けると、D行の残存区画へ4区画のT字散布界が通ります。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [
      { coord: { x: 4, y: 4 }, label: "BASE", tone: "observe" },
      { coord: { x: 3, y: 3 }, label: "1", tone: "target" },
      { coord: { x: 4, y: 3 }, label: "2", tone: "target" },
      { coord: { x: 5, y: 3 }, label: "3", tone: "target" },
    ],
    facts: ["基準区画と方位の両方を指定します。", "同じ照準を再度押すと90度回転します。", "4区画すべてが盤内に入る方位だけ発射できます。"],
  },
  4: {
    conceptTitle: "護衛連接はF-4の第二波を成立させます",
    concept: "護衛艦の全区画が空母へ上下左右で接するとESCORT SUPPORTが成立します。F-4は通常1回に加え、もう1回出撃できます。",
    visual: "自軍戦術図で空母と護衛艦の接触を確認し、敵情図では第一波と第二波を別々の4区画へ割り当てます。",
    focus: "own-plot",
    plot: "player",
    marks: placementMarks([
      { id: "carrier", start: { x: 1, y: 5 }, orientation: "east" },
      { id: "escort", start: { x: 1, y: 4 }, orientation: "east" },
    ]),
    facts: ["斜め接触は護衛リンクになりません。", "空母を失うとF-4は全て使用不能です。護衛艦の喪失またはリンク解除では追加の1回を失います。", "密集陣形は範囲攻撃を同時に受ける危険があります。"],
  },
  5: {
    conceptTitle: "HARPOONは中心と斜め4区画のX字です",
    concept: "横向きの戦艦へX字攻撃を行うと、中心弾だけが船影へ通ります。三つの残存区画には三つの中心照準が必要です。",
    visual: "戦艦と護衛艦の射撃管制リンクにより、通常2回のHARPOONへ第三射が追加されています。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [
      { coord: { x: 1, y: 2 }, label: "1", tone: "target" },
      { coord: { x: 3, y: 2 }, label: "2", tone: "target" },
      { coord: { x: 5, y: 2 }, label: "3", tone: "target" },
    ],
    facts: ["中心から斜めへ広がる5区画攻撃です。", "盤端では一部の弾頭が盤外へ落ちます。", "戦艦を失うとHARPOONは全て使用不能です。護衛艦の喪失またはリンク解除では追加の1回を失います。"],
  },
  6: {
    conceptTitle: "音紋は潜水艦の位置ではなく周辺の手掛かりです",
    concept: "潜水艦だけが残ると、行動した後に周囲8区画の未表示地点へ音紋が一つ残ります。音紋の区画そのものを撃つのではありません。",
    visual: "E-5のCONTACTで候補をE-6・F-6まで絞り、D-6のNO CONTACTでE-6を除外します。残るF-6へ射撃します。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [
      { coord: { x: 4, y: 4 }, label: "A", tone: "observe" },
      { coord: { x: 5, y: 3 }, label: "B", tone: "exclude" },
      { coord: { x: 5, y: 5 }, label: "FIX", tone: "target" },
    ],
    facts: ["CONTACTは4区画内に未破壊区画があるという意味です。", "反応数・艦種・正確な位置は分かりません。", "NO CONTACTはその4区画を候補から外せます。"],
  },
  8: {
    conceptTitle: "敵攻撃後は損傷報告を読むまで戦況が止まります",
    concept: "敵弾着は自軍戦術図で見届けます。攻撃が終わると損傷報告を保持するので、着弾・残存区画・失った能力を確認します。",
    visual: "F-2への被弾を確認し、戦闘記録へ記載してから敵情図へ戻り、通常砲撃で反撃します。",
    focus: "damage-report",
    plot: "player",
    marks: [{ coord: { x: 1, y: 5 }, label: "HIT", tone: "exclude" }],
    facts: ["確認ボタンを押すまで報告は消えません。", "復帰時は通常砲撃が選択されます。", "LOGでは着弾座標と敵兵装を後から確認できます。"],
  },
  9: {
    conceptTitle: "重要区画命中は艦種だけを識別します",
    concept: "敵艦の重要区画は命中するまで見えません。命中すると艦種とコードを識別しますが、追加ダメージはありません。",
    visual: "C-5の重要区画とC-4の残存区画をMK-45 IIで同時指定し、識別と撃沈を一つの射撃で確認します。",
    focus: "hostile-plot",
    plot: "enemy",
    marks: [
      { coord: { x: 4, y: 2 }, label: "◆", tone: "observe" },
      { coord: { x: 3, y: 2 }, label: "2", tone: "target" },
    ],
    facts: ["◆はTRAINING X-RAYによる教材表示です。実戦では命中するまで見えません。", "識別後も向き・残り耐久・未命中区画は秘匿されます。", "MK-45 IIは離れた2区画を一度に指定します。"],
  },
};

export function buildTrainingStoryboard(stage: MissionStageDefinition): BriefingSequence {
  const training = stage.training;
  if (!training) throw new Error(`${stage.title} has no training plan`);
  const note = STORY_NOTES[training.lesson];
  if (!note) throw new Error(`training lesson ${training.lesson} has no storyboard note`);
  const cues: BriefingCue[] = [
    {
      id: `lesson-${training.lesson}-orders`,
      chapter: "WATCH",
      kicker: "TRAINING CONTROL / 訓練管制",
      title: "この教程で覚えること",
      narration: stage.subtitle,
      caption: "まず全体像を確認します。ここでは誤操作しても行動・弾薬・記録時間を消費しません。",
      focus: "overview",
      facts: [stage.directive, stage.condition, "説明は戻る・一時停止・再生・再表示ができます。"],
      durationMs: 6500,
    },
    {
      id: `lesson-${training.lesson}-orientation`,
      chapter: "READ",
      kicker: training.doctrine,
      title: note.conceptTitle,
      narration: note.concept,
      caption: note.visual,
      focus: note.focus,
      plot: note.plot,
      marks: note.marks,
      visual: lessonVisual(training.lesson, note),
      facts: note.facts,
      durationMs: 8500,
    },
    {
      id: `lesson-${training.lesson}-interface`,
      chapter: "READ",
      kicker: "TACTICAL DISPLAY / 画面の見方",
      title: "今見る場所を一つずつ切り替えます",
      narration: training.placementDrill
        ? "自軍戦術図で艦影を動かし、配置卓で回転と確定を行います。戦闘開始後は同じ位置の敵情図へ切り替えます。"
        : training.enemyDemonstration
          ? "敵の攻撃中は自軍戦術図、反撃時は敵情図を表示します。画面上部の切替欄は同じ位置に留まります。"
          : "自軍戦術図は配置と損傷、敵情図は索敵と攻撃に使います。盤面を切り替えても座標の読み方は同じです。",
      caption: "字幕の指示に合わせて、自軍戦術図・敵情図・指揮卓へ順番に視線を移します。",
      focus: "plot-switch",
      facts: ["自軍戦術図：艦隊配置と損傷を確認", "敵情図：索敵情報と攻撃目標を指定", "LOG：行動・着弾・損失能力を後から確認"],
      durationMs: 7000,
    },
  ];

  if (training.placementDrill) cues.push(...placementCues(training.lesson, training.placementDrill.placements, training.placementDrill.instruction));
  if (training.enemyDemonstration) {
    cues.push({
      id: `lesson-${training.lesson}-hostile-demo`,
      chapter: "WATCH",
      kicker: training.enemyDemonstration.title,
      title: "敵弾着を自軍戦術図で見届けます",
      narration: training.enemyDemonstration.instruction,
      caption: "着弾後も画面は止まります。損傷報告を読んでから反撃へ進みます。",
      focus: "own-plot",
      plot: "player",
      marks: [{ coord: training.enemyDemonstration.target, label: "IMPACT", tone: "exclude" }],
      visual: { kind: "impact", cells: [training.enemyDemonstration.target] },
      facts: training.enemyDemonstration.damageReport,
      durationMs: 8000,
    });
    cues.push({
      id: `lesson-${training.lesson}-report-demo`,
      chapter: "GUIDED",
      kicker: "DAMAGE REPORT / 損傷報告",
      title: "内容を確認してから記録へ記載します",
      narration: "敵弾着の直後も、CICは損傷情報を整理し、残存区画と継戦能力を判定します。",
      caption: `表示された「${training.enemyDemonstration.acknowledgmentLabel}」を押すまで、反撃へは進みません。`,
      focus: "damage-report",
      plot: "player",
      visual: { kind: "impact", cells: [training.enemyDemonstration.target] },
      facts: ["着弾座標を確認", "残存区画と継戦能力を確認", "搭載艦喪失時は使用不能兵装も確認"],
      durationMs: 7500,
    });
  }

  training.steps.forEach((step, index) => cues.push(...stepCues(training.lesson, step, index, training.steps.length)));
  return buildBriefingSequence({
    id: `training-${stage.id}-intro-v2`,
    kind: "training-intro",
    eyebrow: `CIC TRAINING REEL / LESSON ${String(Math.floor(stage.sortOrder / 10) + 1).padStart(2, "0")}`,
    title: stage.title,
    subtitle: "実際の戦術図と操作卓を使う映像教練。人物説明は行わず、見る場所と判断理由を順に示します。",
    cues: cues.map(withReadingTime),
    finishLabel: training.placementDrill ? "配置実習へ" : "訓練を開始",
    allowSkip: true,
    presentation: "center-stage",
    quickComplete: true,
  });
}

/**
 * Opening reel shown while the lesson is still in the placement phase.
 * Operational controls do not exist yet, so this deliberately contains only
 * the common orientation material and, when authored, the placement drill.
 */
export function buildTrainingIntroduction(stage: MissionStageDefinition): BriefingSequence {
  const training = stage.training;
  if (!training) throw new Error(`${stage.title} has no training plan`);
  const storyboard = buildTrainingStoryboard(stage);
  const cues = storyboard.cues
    .filter((cue) => !cue.id.includes("-step-") && !cue.id.endsWith("-hostile-demo") && !cue.id.endsWith("-report-demo"))
    .map((cue) => cue.focus === "damage-report"
      ? { ...cue, focus: "own-plot" as const }
      : cue);
  return buildBriefingSequence({
    ...storyboard,
    id: `training-${stage.id}-opening-v2`,
    subtitle: "戦闘前に、戦術図の読み方とこの教程で使う判断基準を確認します。操作説明は該当する指揮卓が表示されてから再開します。",
    cues,
    finishLabel: training.placementDrill ? "配置実習へ" : "戦闘開始準備へ",
  });
}

/** Guided three-beat reel opened only after the player command deck exists. */
export function buildTrainingStepBriefing(stage: MissionStageDefinition, stepIndex: number): BriefingSequence {
  const training = stage.training;
  if (!training) throw new Error(`${stage.title} has no training plan`);
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= training.steps.length) {
    throw new Error(`${stage.title} has no training step ${stepIndex}`);
  }
  const storyboard = buildTrainingStoryboard(stage);
  const prefix = `lesson-${training.lesson}-step-${stepIndex + 1}-`;
  const cues = storyboard.cues.filter((cue) => cue.id.startsWith(prefix));
  if (cues.length !== 3) throw new Error(`${stage.title} training step ${stepIndex + 1} requires exactly three cues`);
  return buildBriefingSequence({
    ...storyboard,
    id: `training-${stage.id}-step-${stepIndex + 1}-guided-v2`,
    subtitle: `第${stepIndex + 1}指令。戦術図の根拠、兵装選択、実行確認の順に操作します。`,
    cues,
    finishLabel: "操作へ戻る",
  });
}

/** Damage-report reel opened after the scripted hostile action reaches review. */
export function buildTrainingDamageReview(stage: MissionStageDefinition): BriefingSequence {
  const training = stage.training;
  if (!training) throw new Error(`${stage.title} has no training plan`);
  const demonstration = training.enemyDemonstration;
  if (!demonstration) throw new Error(`${stage.title} has no hostile demonstration`);
  const storyboard = buildTrainingStoryboard(stage);
  const cues = storyboard.cues.filter((cue) => cue.id.endsWith("-hostile-demo") || cue.id.endsWith("-report-demo"));
  if (cues.length !== 2) throw new Error(`${stage.title} hostile demonstration requires exactly two cues`);
  return buildBriefingSequence({
    ...storyboard,
    id: `training-${stage.id}-damage-review-v2`,
    subtitle: "敵弾着を自軍戦術図で確認し、損傷報告を読んでから反撃へ移ります。",
    cues,
    finishLabel: demonstration.acknowledgmentLabel,
  });
}

export function buildTrainingDebrief(stage: MissionStageDefinition): BriefingSequence {
  const training = stage.training;
  if (!training) throw new Error(`${stage.title} has no training plan`);
  if (!training.steps.length) throw new Error(`${stage.title} training debrief requires at least one step`);
  const lastStep = training.steps[training.steps.length - 1];
  return buildBriefingSequence({
    id: `training-${stage.id}-debrief-v2`,
    kind: "training-debrief",
    eyebrow: "LESSON DEBRIEF / 視覚復習",
    title: `${stage.title} // COMPLETE`,
    subtitle: "正解した操作と、実戦へ持ち込む判断基準を短く固定します。",
    allowSkip: true,
    presentation: "center-stage",
    quickComplete: false,
    finishLabel: "修了報告へ",
    cues: [
      {
        id: `lesson-${training.lesson}-debrief-result`, chapter: "DEBRIEF", kicker: "TRAINING COMPLETE", title: "操作は正しく完了しました",
        narration: stage.completion.success, caption: "結果だけでなく、なぜ正しかったかを確認します。", focus: "result",
        facts: training.debrief, durationMs: 6500,
      },
      {
        id: `lesson-${training.lesson}-debrief-plot`, chapter: "DEBRIEF", kicker: lastStep.doctrine, title: "最終射撃解",
        narration: lastStep.instruction, caption: `使用兵装と指定位置：${orderLabel(lastStep.expected)}`, focus: "hostile-plot", plot: "enemy",
        marks: marksForOrder(lastStep.expected, lastStep.highlight), visual: visualForOrder(lastStep.expected), facts: ["正しい公開情報だけで判断しました。", "教程内の誤操作は戦闘記録へ残りません。"], durationMs: 7000,
      },
      {
        id: `lesson-${training.lesson}-debrief-transfer`, chapter: "CHECK", kicker: "TRANSFER TO OPERATIONS / 実戦適用", title: "本編では光る正解枠が消えます",
        narration: "実戦では同じ盤面記号と兵装規則を使います。ただし、訓練用の正解表示はありません。LOG、着弾、損傷報告を自分で重ねて判断してください。",
        caption: "分からなくなった教程だけ、一覧からいつでも再受講できます。", focus: "result",
        facts: ["CASUAL：敵情報を確認しながら基本を反復", "TACTICS：敵情報を秘匿した識別戦", "MISSION / SURVIVAL：限られた情報と戦力で判断"], durationMs: 8000,
      },
    ].map(withReadingTime),
  });
}

function withReadingTime(cue: BriefingCue): BriefingCue {
  const copyLength = `${cue.title}${cue.narration}${cue.caption}${cue.facts.join("")}`.replace(/\s/g, "").length;
  const readableDuration = Math.min(18000, 4500 + copyLength * 55);
  return { ...cue, durationMs: Math.max(cue.durationMs, readableDuration) };
}

export function briefingCueIndexForTrainingStep(sequence: BriefingSequence, stepIndex: number) {
  const prefix = `-step-${stepIndex + 1}-`;
  const found = sequence.cues.findIndex((cue) => cue.id.includes(prefix));
  return found < 0 ? 0 : found;
}

export function trainingDirectiveCount(stage: MissionStageDefinition) {
  const training = stage.training;
  if (!training) return stage.objective.maxFriendlyActions;
  return training.steps.length + (training.placementDrill ? 1 : 0) + (training.enemyDemonstration ? 1 : 0);
}

function placementCues(lesson: number, placements: ReadonlyArray<MissionPlacement>, instruction: string): BriefingCue[] {
  const marks = placementMarks(placements);
  return [
    {
      id: `lesson-${lesson}-placement-watch`, chapter: "WATCH", kicker: "FLEET DEPLOYMENT / 配置見本", title: "艦影を指定座標へ移動します",
      narration: instruction, caption: "艦カードまたは盤面の艦影を選び、指を離さず目的地まで動かせます。", focus: "own-plot", plot: "player", marks, visual: { kind: "scan", cells: marks.map((mark) => mark.coord) },
      facts: ["艦影を選ぶと配置用シルエットになります。", "シアンは配置可能、赤は盤外または重複です。", "一度選んだ艦は元の位置へ戻すこともできます。"], durationMs: 8000,
    },
    {
      id: `lesson-${lesson}-placement-guided`, chapter: "GUIDED", kicker: "ROTATE / LOCK", title: "向きを合わせて配置を確定します",
      narration: "ROTATEを押すたび艦影と重要区画が90度ずつ回ります。目的の向きになったらLOCKを押します。", caption: "移動しただけでは未確定です。LOCKの完了表示を確認してください。",
      focus: "placement-tools", plot: "player", marks, visual: { kind: "rotate", cells: marks.map((mark) => mark.coord) }, facts: ["ROTATE：90度回転", "LOCK：現在位置へ確定", "全艦の確定後にCOMMENCEが表示"], durationMs: 8000,
    },
  ];
}

function stepCues(lesson: number, step: TrainingStep, index: number, count: number): BriefingCue[] {
  const order = index + 1;
  const marks = marksForOrder(step.expected, step.highlight);
  const system = weaponPlainName(step.expected.weapon);
  const target = orderLabel(step.expected);
  return [
    {
      id: `lesson-${lesson}-step-${order}-plot`, chapter: "WATCH", kicker: `${step.title} / ${order} OF ${count}`, title: "先に戦術図から根拠を読みます",
      narration: step.instruction, caption: `光っている区画は訓練用の注釈です。実戦では公開情報から同じ${target}を導きます。`,
      focus: "hostile-plot", plot: "enemy", marks, visual: visualForOrder(step.expected),
      facts: [step.doctrine, `指定：${target}`, "まだ攻撃は確定していません。"], durationMs: 8500,
    },
    {
      id: `lesson-${lesson}-step-${order}-system`, chapter: "GUIDED", kicker: "SELECT SYSTEM / 兵装選択", title: `「${system}」を選びます`,
      narration: weaponGuidance(step.expected.weapon), caption: `兵装を選択したら、敵情図で${target}を指定します。`, focus: "command-deck", plot: "enemy", marks, visual: visualForOrder(step.expected),
      facts: weaponFacts(step.expected.weapon), durationMs: 7500,
    },
    {
      id: `lesson-${lesson}-step-${order}-commit`, chapter: "CHECK", kicker: "AUTHORIZE ORDER / 指令確定", title: "プレビューを確認して実行します",
      narration: `選択表示が「${selectionCountLabel(step.expected)}」になり、盤面の攻撃範囲が指示どおりなら発射・実行ボタンを押します。`,
      caption: "照準だけでは行動は終わりません。確定ボタンを押した時点で1行動として記録されます。", focus: "confirm-action", plot: "enemy", marks, visual: { kind: "impact", cells: orderCells(step.expected) },
      facts: ["間違っていればCANCELで照準だけを解除できます。", "訓練で違う指令を確定しても弾薬・行動は減りません。", "正しい指令だけが次の場面へ進みます。"], durationMs: 8000,
    },
  ];
}

function lessonVisual(lesson: number, note: StoryNote): BriefingVisual | undefined {
  const cells = note.marks?.map((mark) => mark.coord) ?? [];
  if (lesson === 7) return { kind: "path", from: { x: 1, y: 1 }, to: { x: 1, y: 4 }, cells };
  if (lesson === 1) return { kind: "scan", cells };
  if (lesson === 2) return { kind: "echo-cross", cells: [{ x: 3, y: 2 }, { x: 2, y: 3 }] };
  if (lesson === 3) return { kind: "weapon-pattern", cells };
  if (lesson === 4) return { kind: "link", cells: [{ x: 1, y: 5 }, { x: 1, y: 4 }] };
  if (lesson === 5) return { kind: "weapon-pattern", cells: harpoonCells({ x: 3, y: 2 }) };
  if (lesson === 6) return { kind: "scan", cells: [...radarCells({ x: 4, y: 4 }), ...radarCells({ x: 5, y: 3 })] };
  if (lesson === 8 || lesson === 9) return { kind: "impact", cells };
  return undefined;
}

function orderCells(order: MissionOrder): Coord[] {
  if (order.weapon === "fire") return [order.target];
  if (order.weapon === "radar") return radarCells(order.origin);
  if (order.weapon === "harpoon") return harpoonCells(order.center);
  if (order.weapon === "sparrow") return straddleCells(order.anchor, order.orientation);
  return [...order.targets];
}

function visualForOrder(order: MissionOrder): BriefingVisual {
  const cells = orderCells(order);
  if (order.weapon === "radar") return { kind: "scan", cells };
  if (order.weapon === "fire") return { kind: "impact", cells };
  return { kind: "weapon-pattern", cells };
}

function marksForOrder(order: MissionOrder, highlight: ReadonlyArray<Coord> = []): BriefingPlotMark[] {
  const targets = orderCells(order);
  const targetKeys = new Set(targets.map((coord) => `${coord.x},${coord.y}`));
  const evidence = new Map<string, Coord>();
  for (const coord of highlight) if (!targetKeys.has(`${coord.x},${coord.y}`)) evidence.set(`${coord.x},${coord.y}`, coord);
  return [
    ...[...evidence.values()].map((coord, index) => ({ coord, label: `E${index + 1}`, tone: "observe" as const })),
    ...targets.map((coord, index) => ({ coord, label: String(index + 1), tone: "target" as const })),
  ];
}

function placementMarks(placements: ReadonlyArray<MissionPlacement>): BriefingPlotMark[] {
  return placements.flatMap((placement, placementIndex) => placementCells(placement).map((coord, index) => ({
    coord,
    label: index === 0 ? SHIPS.find((ship) => ship.id === placement.id)?.code ?? String(placementIndex + 1) : String(index + 1),
    tone: placement.id === "escort" ? "link" : "observe",
  })));
}

function placementCells(placement: MissionPlacement) {
  const definition = SHIPS.find((ship) => ship.id === placement.id);
  if (!definition) return [];
  return new Board().cellsFor(placement.start, definition.size, placement.orientation, placement.id);
}

function orderLabel(order: MissionOrder) {
  if (order.weapon === "fire") return coordName(order.target);
  if (order.weapon === "radar") return `${coordName(order.origin)}を左上とする2×2`;
  if (order.weapon === "harpoon") return `${coordName(order.center)}中心`;
  if (order.weapon === "sparrow") return `${coordName(order.anchor)} / ${orientationName(order.orientation)}向き`;
  return order.targets.map(coordName).join("・");
}

function orientationName(orientation: Orientation) {
  return { north: "北", east: "東", south: "南", west: "西" }[orientation];
}

function weaponPlainName(weapon: WeaponId) {
  return { fire: "通常砲撃", phantom: "F-4 PHANTOM", harpoon: "HARPOON", sparrow: "8-INCH STRADDLE", mk45: "MK-45 II", radar: "PASSIVE SONAR" }[weapon];
}

function weaponGuidance(weapon: WeaponId) {
  return {
    fire: "通常砲撃は敵情図の1区画を攻撃します。使用回数に制限はありません。",
    phantom: "F-4は離れた4区画を順番に選択します。空母が沈むと残数があっても使用できません。",
    harpoon: "HARPOONは選んだ中心と斜め4方向へ攻撃します。戦艦が発射母体です。",
    sparrow: "8-INCH STRADDLEは基準区画と方位を指定し、基準と前方3区画へ斉射します。",
    mk45: "MK-45 IIは離れた2区画を一度に指定します。駆逐艦が射撃母体です。",
    radar: "PASSIVE SONARは左上に指定した区画から2×2を聴音します。損害は与えません。",
  }[weapon];
}

function weaponFacts(weapon: WeaponId): string[] {
  return {
    fire: ["1区画攻撃", "使用回数：無制限", "攻撃済み区画は再指定不可"],
    phantom: ["離れた4区画", "基本1回", "空母＋護衛リンクで＋1回"],
    harpoon: ["X字5区画", "基本2回", "戦艦＋護衛リンクで＋1回"],
    sparrow: ["基準＋前方3区画", "方位指定が必要", "巡洋艦搭載・1回"],
    mk45: ["離れた2区画", "駆逐艦搭載・1回", "選択順は自由"],
    radar: ["2×2聴音", "潜水艦搭載・2回", "CONTACTでも反応数と位置は非公開"],
  }[weapon];
}

function selectionCountLabel(order: MissionOrder) {
  if (order.weapon === "phantom") return "4 / 4 SELECTED";
  if (order.weapon === "mk45") return "2 / 2 SELECTED";
  return "1 / 1 SELECTED";
}
