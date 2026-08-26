# DEEP BLUE GRID — Unity Briefing / Authorization Handoff

この文書は Web 版の映像教練、モード解放報告、作戦完了演出を Unity / Android 版へ
移すための実装契約である。シナリオと表示文は
`docs/unity-handoff/unity-content-v2.json` の `presentation.briefings` を正本とし、
Unity Inspector へ手入力で複製しない。

## 1. Web 正本と Unity の受け口

| 責務 | Web 正本 | Unity 実装候補 |
| --- | --- | --- |
| 汎用シーケンス DTO | `app/game/BriefingSequence.ts` | `BriefingSequenceDto`, `BriefingCueDto` |
| 再生状態機械 | `app/game/BriefingDirector.ts` | Unity非依存 `BriefingDirector` |
| 教程シーン生成 | `app/game/TrainingStoryboard.ts` | JSONを読む。C#で文章を再生成しない |
| 解放内容と演出 | `app/game/ModeAuthorization.ts` | `ModeAuthorizationDto`, 作戦結果Presenter |
| スポット表示 | `app/game/BriefingCoach.tsx` | Safe Area内 modal + focus frame |
| 盤面注釈・動的図解 | `app/game/Renderer.ts` | `GridBoardBriefingOverlayGraphic` |
| レスポンシブ位置・材質 | `app/globals.css` | `ResponsiveLayoutProfile` + CIC material |
| 解放判定・保存 | `app/game/Progression.ts` | `ProgressionRules`, `AtomicSaveRepository` |

Web 側の briefing はゲームの攻撃処理から独立した表示層である。Unity でもキューから
Domain を呼ばない。再生、一時停止、前後移動は見た目と音だけを変え、盤面、弾薬、手番、
計時、AI の状態を変更しない。

## 2. JSON 契約

`presentation.briefings` は次を含む。

- `contract`: スキーマversion、sequence kind、chapter、focus anchor、visual kind、dismiss reason、
  タイマーと Reduce Motion の契約。
- `training`: 9教程それぞれの `opening`、指令単位の `steps`、対象教程の
  `damageReview`、`debrief`、監査用の `storyboard`。
- `authorizations`: TRAINING→CASUAL、CASUAL→TACTICS、TACTICS→MISSION、
  MISSION→SURVIVAL、SURVIVAL→EXTREME の説明と再生シーケンス。各要素の
  `sequences.persisted` は保存成功時、`sequences.saveFailed` は書込失敗または将来version
  保護時に使う。

### 初心者向け中央教材（2026-08-26）

TRAININGの全sequenceは `presentation: "center-stage"` を持つ。中央教材は画面端の小型consoleではなく、
Safe Area中央の大きな不透明CICウィンドウを使う。

- 左／上側：8×8の動くミニ盤面。`visual.kind`と`marks`を同じ座標で再生する。
- 右／下側：`いまやること`、大見出し、短い説明、強調caption、`HINT / ここだけ覚える`。
- 操作：`ひとつ戻る`、`動きをもう一度`、`次へ`。全て44px以上。
- `quickComplete: true`のtraining-introでは、62px以上の`説明だけで修了 / ONE TAP CLEAR`を常設する。
- one-tap修了も通常と同じtraining progress保存を使い、debug時は書き込まない。保存失敗は画面内警告を維持する。
- `prefers-reduced-motion`ではミニ盤面の手カーソルとpulseを停止し、静止した注釈を残す。

Unityは `presentationStyles` と `trainingQuickComplete` をcontractから読み、Webと同じ中央配置、
動的8×8ヒント、plain Japanese、ワンタップ修了を再現する。validation fixtureはPlayerへ含めない。

Unity DTO は次の名前と意味を保つ。JSON の未知fieldは無視してもよいが、未知enum値は無音で
default値に変換せずvalidation errorにする。

```text
BriefingSequence
  id, kind, eyebrow, title, subtitle, finishLabel, allowSkip,
  presentation(center-stage|edge-console), quickComplete, cues[]

BriefingCue
  id, chapter, kicker, title, narration, caption, focus, plot?, marks[], visual?, facts[], durationMs

BriefingPlotMark
  coord{x,y}, label, tone(observe|target|exclude|link)

BriefingVisual
  kind(scan|path|rotate|echo-cross|weapon-pattern|impact|link)
  cells[]?, from?, to?
```

`Coord` は他の移植dataと同じく左上原点、`x=0..7`、`y=0..7`である。マークとvisualは
実戦情報ではなく教練用注釈であり、sequenceを閉じたら全て破棄する。

## 3. 再生状態機械

Unity非依存の reducer / service に次のcommandを実装する。

- `Open(sequence, cueIndex=0, playing=false)`
- `Next`, `Previous`, `Seek(index)`
- `Play`, `Pause`
- `Close(complete|skip)`

indexは常に `0..cues.Length-1` へclampし、NaN相当、空sequence、無効indexでクラッシュさせない。
最終cueの `Next` は勝手にゲームを進めず、再生停止にとどまる。主buttonで閉じた時だけ
`complete`、明示的な閉じる/Backは `skip` とする。

自動再生は `durationMs` のunscaled timeを使う。中断、バックグラウンド、modal重複、
Reduce Motion で必ず停止する。Reduce Motion は自動再生のみ止め、文章、図解、次へbuttonは消さない。

## 4. 表示と入力

- briefing開始前のfocusを保存し、閉じた後に復元する。
- modal中は背面の盤面入力、ショートカット、攻撃確定を受理しない。
- focus anchorは実際に可視な1件だけを選ぶ。スマートフォンでは対象プロットへ切り替えてから
  2frame後に矩形を再取得する。
- Phone Portraitは上または下の最大43dvh相当のconsoleとし、マーク対象が隠れない側に逃がす。
- Compact Landscapeは全高サイドconsole、Wide Landscapeは右側command rail相当へ置く。
- 主要buttonは48dp以上。Back、Next、Play/Pause、Replay、Restartはタッチとキーボード/ゲームパッドの
  両方で到達可能にする。
- cue copyは1回だけ読み上げ通知し、sceneアニメーションのframeごとに読み上げ直さない。

## 5. 盤面overlayの重ね順

Unityの `GridBoardGraphic` 本体を書き換えず、入力を持たない専用 `MaskableGraphic` を前景に追加する。
推奨順は次の通り。

```text
water/grid → ship → operational marks → wake/selection/preview
           → briefing visual → briefing labels → focus frame
```

overlayは `raycastTarget=false`。色は Web と同じ意味に限定する。

- observe: cyan
- target: amber/cyanの強調
- exclude: danger redの取消し
- link: green-cyan

`scan`は局所走査、`path`は始点から終点への移動、`rotate`は90度回転、`echo-cross`は上下左右のみ、
`weapon-pattern`は実ルールで得た区画群、`impact`は着弾、`link`は隣接関係を示す。図解から本番攻撃を
発生させない。

## 6. 教練の開始・終了点

- 教程を開始したら `opening` を表示。配置実習は説明を閉じてから入力可能にする。
- 交戦開始後の各指令前に該当 `steps[n]` を表示。誤指令は弾薬、手番、計時、AI手を消費しない。
- 敵弾実演のある教程は着弾後に `damageReview` を開き、記載buttonまで敵手と時計を止める。
- 教程達成後に修了を記録し、原子的保存の成否を確定してから `debrief` を開く。
- `storyboard` は一覧再生とvalidation用。実際の局面では該当phaseのsequenceのみを使う。

## 7. モード解放と保存transaction

モード完遂時は必ず次の順番にする。

1. 作戦結果と解放条件をDomainで一度だけ評価する。
2. 完了前後の `ProgressionState` を比較し、新規解放の時だけauthorizationを作る。
3. 教程、任務記録、キャンペーン到達度、progressionを1つの `DeepBlueGridSaveData` として
   `AtomicSaveRepository` へ1回だけ保存する。
4. save結果を確定してから解放sequenceを開く。成功時は「端末内記録へ反映」、失敗時は
   `LOCAL RECORD NOT SAVED` を常設警告とし、再読込で戻る可能性を明記する。
5. プレイヤーが `complete`または`skip`で閉じた後に通常のAAR操作を再開する。

同じresult callbackの再入、同じモードの再完遂は保存も解放演出も重複させない。
debug-allは全権限をruntime上だけ許可し、教程、任務、progression、解放演出済みflagを永続化しない。
未知の将来save versionは上書きせず、runtime解放を表示する場合もwrite-protected警告を残す。

## 8. 解放演出の正しい対応

| 完遂 | 新規権限 | 説明の主眼 |
| --- | --- | --- |
| INITIAL TRAINING | CASUAL | 自軍先攻で配置・索敵・火力集中を反復 |
| CASUAL 6海域 | TACTICS | 敵先攻、耐久/船影秘匿、重要区画識別 |
| TACTICS 6海域 | MISSION | 固定戦況、兵装/手数/勝利条件、端末内記録 |
| MISSION認定6印 | SURVIVAL | 4連戦、修復・再補給、撃沈艦の永続喪失 |
| SURVIVAL 4作戦 | EXTREME | D6任務、公開情報のみ、MISSION INDEXから個別挑戦 |

SURVIVAL完遂後はprogressionの次modeが存在しないが、新規権限は `EXTREME OPERATIONS`である。
Unity側で「ALL OPERATIONS AUTHORIZED」の一文だけへ短縮しない。

## 9. Unity 受入テスト

- [ ] JSON中に9教程のopening/debrief、全指令のstep sequence、対象教程のdamageReviewがある。
- [ ] cue ID、sequence IDは空でなく、同一sequence内で重複しない。
- [ ] 全coordは0..7、durationは正、factsは空文字を含まない。
- [ ] opening→placement、step→攻撃入力、damageReview→記載、debrief→AARの局面へ正しく復帰する。
- [ ] Webと同じcueで同じプロット、区画、ラベル、visual kind、文章、表示尺を使う。
- [ ] skip/completeのどちらでもゲームは同じ局面へ戻り、skipで進行権限は失われない。
- [ ] モード完遂前と完遂後のstateが同じなら、解放sequenceを再度開かない。
- [ ] 新規解放はsave開始後ではなくsave結果確定後に表示する。書込失敗時は警告が消えない。
- [ ] `OnApplicationPause(true)` / quitで確定済み進行を保存する。未確定の攻撃previewは保存しない。
- [ ] 360×800、402×874、568×320、834×1112、1366×768でSafe Area、48dp、文字溢れ、盤面遮蔽を検査する。
- [ ] 100/115/130%文字、日英混在、TalkBack、キーボード/ゲームパッド、Reduce Motionを確認する。
- [ ] briefing中に攻撃、AI、計時、弾薬、広告transitionが進まない。

## 10. 現行 Unity projectに必要な差分

現行 `D:/Desktop/UnityProject/DeepBlueGrid` には `ProgressionRules`、`AtomicSaveRepository`、
9教程の操作判定、戦果報告はあるが、briefing DTO、再生Director、盤面注釈overlay、
新規解放の特徴説明は未実装である。受け口は次の順で追加する。

1. 再生成後の `docs/unity-handoff/unity-content-v2.json` と `manifest.json` を
   `Assets/Resources/Canonical/` へコピーし、checksumを照合する。Editor専用fixtureは従来どおり
   `Assets/Editor/ValidationFixtures/` 以外へ置かない。
2. `Assets/Scripts/Content/CanonicalContent.cs` に briefing DTO とvalidationを追加する。
   `CanonicalContent.RuntimeDocument` の JObject にその場しのぎで依存せず、typed DTOをruntime入口にする。
3. `Assets/Scripts/Presentation/BriefingDirector.cs` をUnity非依存で追加し、
   `Assets/Tests/EditMode/BriefingDirectorTests.cs` でopen/seek/next/previous/play/pause/closeを固定する。
4. `Assets/Scripts/UI/BriefingPresenter.cs` と `GridBoardBriefingOverlayGraphic.cs` を追加。
   `GridBoardGraphic` の運用markやpointer sessionへbriefing状態を混ぜない。
5. `DeepBlueGridApp.CanonicalPortal.cs` で教程のopening/step/damageReview/debriefを局面に接続する。
   `DeepBlueGridApp.cs` でbriefing中の作戦時計、盤面入力、広告transitionを停止する。
6. 現在voidの `PersistCanonicalSession()` を `SaveWriteResult` 返却にし、完遂前後の
   `ProgressionState` から解放差分を1回だけ作る。`Saved` なら `persisted`、
   `Failed` / `FutureVersionProtected` なら `saveFailed` をAARの前に開く。
   `DebugRuntimeOnly` は演出用実績にも保存しない。
7. `Assets/Tests/EditMode/ProgressionPersistenceTests.cs` へ「初回のみ書込」、「完遂済み再プレイは
   演出なし」、「future version非上書き」、「失敗時警告」を追加する。
8. `Assets/Tests/PlayMode/PortraitFlowTests.cs` と `ResponsiveViewportAcceptanceTests.cs` で
   360×800 / 402×874 / 568×320 / 834×1112 / 1366×768のcue表示、Safe Area、48dp、文字溢れを確認する。

移植完了時は `ContentValidator` に `presentation.briefings` の件数、enum、座標、cue ID、保存結果別
sequenceの検査を追加する。現行 Unity の `sourceRef` / schema version固定は今回のadditive dataを読めるが、
briefingを必須rootとする時点でWebとUnityを同じversionへ同時更新する。
