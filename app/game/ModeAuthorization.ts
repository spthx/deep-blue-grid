import { buildOperationClearSequence, type BriefingCue, type BriefingSequence } from "./BriefingSequence.ts";
import type { ProgressionMode } from "./Progression.ts";

export type AuthorizationTarget = ProgressionMode | "extreme";

export type ModeAuthorizationPresentation = Readonly<{
  completed: ProgressionMode;
  completedLabel: string;
  authorized: AuthorizationTarget;
  authorizedLabel: string;
  summary: string;
  features: readonly string[];
  access: string;
}>;

/**
 * Canonical player-facing explanation for every authorization transition.
 * Unity export consumes this same table; do not duplicate these features in a
 * platform-specific result screen.
 */
export const MODE_AUTHORIZATION_PRESENTATIONS: Readonly<Record<ProgressionMode, ModeAuthorizationPresentation>> = {
  training: {
    completed: "training",
    completedLabel: "INITIAL TRAINING",
    authorized: "casual",
    authorizedLabel: "CASUAL",
    summary: "敵艦情報を確認できる実戦課程です。配置・索敵・火力集中を、自軍先攻で身につけます。",
    features: ["全6海域の連続作戦", "自軍先攻", "敵艦種・損傷状況を表示"],
    access: "MODE SELECTのCASUALから出撃できます。",
  },
  casual: {
    completed: "casual",
    completedLabel: "CASUAL",
    authorized: "tactics",
    authorizedLabel: "TACTICS",
    summary: "敵情報を秘匿した実戦規則へ移行します。重要区画を捉え、限られた情報から追撃してください。",
    features: ["敵側先制", "敵耐久・向き・未命中区画を秘匿", "重要区画命中で艦種を識別"],
    access: "MODE SELECTのTACTICSから出撃できます。",
  },
  tactics: {
    completed: "tactics",
    completedLabel: "TACTICS",
    authorized: "mission",
    authorizedLabel: "MISSION",
    summary: "固定戦況、兵装制限、手数制限を読み解く独立任務群です。好きな任務を選んで記録を更新できます。",
    features: ["状況別の固定シナリオ", "公開情報だけで解ける勝利条件", "最少指令・最短活動時間を端末内に記録"],
    access: "MODE SELECTのMISSION INDEXから任務を選択できます。",
  },
  mission: {
    completed: "mission",
    completedLabel: "MISSION QUALIFICATION",
    authorized: "survival",
    authorizedLabel: "SURVIVAL",
    summary: "撃沈艦が戦列へ戻らない全4作戦です。各作戦後に生存艦を修復・再補給し、残存戦力を引き継ぎます。",
    features: ["全艦・全兵装で作戦開始", "損傷と兵装は作戦間で回復", "撃沈艦は以後の作戦で使用不能"],
    access: "MODE SELECTのSURVIVALから連続作戦を開始できます。",
  },
  survival: {
    completed: "survival",
    completedLabel: "SURVIVAL",
    authorized: "extreme",
    authorizedLabel: "EXTREME OPERATIONS",
    summary: "公開情報だけで射撃解を組み立てる最高機密任務群です。余剰指令のない状況も含まれます。",
    features: ["作戦日誌と公開情報だけで射撃解を構成", "敗北後も未確認配置を秘匿", "余剰指令のない最高難度D6"],
    access: "MISSION INDEX内のEXTREME区分から、いつでも選択できます。",
  },
};

export function modeAuthorizationFor(mode: ProgressionMode): ModeAuthorizationPresentation {
  return MODE_AUTHORIZATION_PRESENTATIONS[mode];
}

/** Result-screen sequence shared by browser and the Unity handoff contract. */
export function buildModeAuthorizationSequence(mode: ProgressionMode, persisted = true): BriefingSequence {
  const authorization = modeAuthorizationFor(mode);
  const recordFact = persisted ? "達成記録を端末内へ保存済み" : "保存未完了・今回の達成は画面上のみ";
  const cues: BriefingCue[] = [
    {
      id: `authorization-${mode}-complete`,
      chapter: "DEBRIEF",
      kicker: "OPERATIONAL MILESTONE / 課程完了",
      title: `${authorization.completedLabel} COMPLETE`,
      narration: persisted
        ? "作戦記録を照合し、完了を端末内へ記録しました。全モードは最初から利用できます。"
        : "作戦の完了を確認しましたが、端末内への記録は保存できていません。全モードは引き続き利用できます。",
      caption: persisted ? "戦果報告と端末内記録へ達成を追記しました。" : "画面上部の保存警告を確認してください。",
      focus: "result",
      facts: ["課程完了を確定", recordFact, `${authorization.authorizedLabel}もいつでも選択可能`],
      durationMs: 8200,
    },
    {
      id: `authorization-${mode}-features`,
      chapter: "READ",
      kicker: "OPERATION GUIDE / 作戦案内",
      title: `${authorization.authorizedLabel} AVAILABLE`,
      narration: authorization.summary,
      caption: authorization.access,
      focus: "result",
      facts: authorization.features,
      durationMs: Math.max(9000, 5600 + authorization.summary.length * 54),
    },
  ];

  return buildOperationClearSequence({
    id: `mode-authorization-${mode}`,
    title: `${authorization.authorizedLabel} AVAILABLE`,
    subtitle: authorization.summary,
    facts: authorization.features,
    cues,
    finishLabel: "戦果報告を確認",
    allowSkip: true,
  });
}
