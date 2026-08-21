# DEEP BLUE GRID — Unity 実装引き継ぎ入口

Unity / Android 版は、現在の Web 版を別ゲームとして再解釈するのではなく、
同一のルール、情報公開、操作確認、演出テンポをネイティブ UI で再現する。
この文書を着手順と参照先の入口にし、詳細な数値・契約はリンク先を正本とする。

## まず固定する対象

移植対象の Web commit SHA、比較に使う画面録画・スクリーンショット、テスト結果を
最初に記録する。移植途中の Web 更新は自動追従しない。採用する差分ごとに parity
確認を行う。

Unityへ渡す静的データは、手入力ではなく `npm run export:unity` で
[unity-content-v2.json](unity-handoff/unity-content-v2.json) を再生成する。完全解答を含む
[unity-validation-v1.json](unity-handoff/unity-validation-v1.json) は Editor / Test 専用で、
`Resources`、Addressables、StreamingAssets、製品ビルドへ入れない。固定参照タグは
`unity-handoff-2026-08-21-progression-v2` とする。配布物一覧は
[handoff manifest](unity-handoff/manifest.json)、JSONの正本対応とC#側の
分割方針は [Unity implementation map](UNITY_IMPLEMENTATION_MAP.md)、画面比較資料は
[Unity reference captures](unity-reference/README.md) を参照する。

| 領域 | Web の正本 | Unity の責務 |
| --- | --- | --- |
| 画面・操作・文言 | `app/game/DeepBlueGrid.tsx` | Presenter/View と入力・アクセシビリティを再実装 |
| 8×8盤面・艦影・マーク | `app/game/Renderer.ts` | 同じ座標、識別、重ね順、公開情報を描画 |
| 基本ルール・乱数・兵装 | `app/game/constants.ts`, `app/game/engine.ts` | Unity 非依存 Domain として同じ入力→結果を再現 |
| AI | `app/game/EnemyAI.ts` | 隠しセルを読まない同じ決定規則と seed |
| MISSION | `app/game/Campaign.ts`, `app/game/ExtremeMissions.ts`, `app/game/AdditionalMissions.ts`, `app/game/MissionRules.ts` | 固定状況・目的・制約・評価の再現 |
| INITIAL TRAINING | `app/game/Training.ts`, `app/game/TrainingRules.ts`, `app/game/TrainingProgress.ts` | 教材順序と進捗保存の再現 |
| 表現・レイアウト | `app/game/PresentationContract.ts`, `app/globals.css` | 表示名・時間・材質契約を保った Safe Area 対応の uGUI + TextMeshPro |
| 音 | `app/game/AudioManager.ts` | 同じイベント種別・待ち時間・脈動を再現 |

## 現行ゲーム契約

- 盤面は `A-1`〜`H-8` の 8×8。プレイヤーと敵は交互に1行動する。
- CASUAL / TACTICS は各6海域。TACTICS は敵先攻、敵損傷と艦種を秘匿する。
- SURVIVAL は4作戦（DOUBLE SCREEN / RANGING FIRE / **SEA BAT** / DEEP BLUE GRID）。
  撃沈艦は以後の作戦で失われ、勝利した作戦の生存艦と兵装だけが回復する。
- MISSION は自由選択の28任務：戦術16、ARCHIVE 5、EXTREME 7。任務間で艦損耗・
  兵装残数を継承しない。難易度表示は `1 / 6`〜`6 / 6`。
- EXTREME 21 は **OPERATION MOBY-DICK**、目標は SSX-02 **LEVIATHAN**。SURVIVAL
  第3作戦の SSX-01 **SEA BAT** と艦、行動規則、表示名を混同しない。
- INITIAL TRAINING は9教程を順次解放する固定教材。修了済みは再受講でき、誤操作は
  行動、弾薬、計時、敵手を消費しない。全9教程の完了IDでCASUALを解放する。旧1–6
  全修了記録は既存CASUAL権限を維持する。
- 解放順は TRAINING→CASUAL→TACTICS→MISSION→SURVIVAL。MISSIONは難易度1–5
  各1件とARCHIVE 1件の認定印、EXTREMEはSURVIVAL全4作戦完遂を要する。
- 旧実績は現行の空・破損進行記録より優先して単調復旧する。保存に失敗した場合は
  `LOCAL RECORD NOT SAVED` を即時表示し、再読込で権限が戻る可能性を明示する。
- MISSION/TRAINING の候補座標は隠しヒントではない。`PLOTTED CONTACTS / 公開座標`
  として必ず表示する。目標達成は撃沈だけでなく、順序付き SONAR 報告、兵装順序・
  使用数、撃沈順、重要区画の識別、保護艦生存を含む。

兵装の形状、ECHO（MISSの上下左右のみ）、重要区画、護衛連接、PASSIVE SONAR、
SEA BAT の無音潜航は [README](../README.md) と
[SURVIVAL 4-operation directive](SURVIVAL_4_OPERATION_SPEC.md) を確認する。

## UI / レスポンシブ / アクセシビリティ

- 最優先はスマートフォン縦持ち。盤面は正方形、背景だけを Safe Area 外へ描画し、
  盤面・座標・操作は Safe Area 内に置く。
- Phone Portrait は盤面1枚と固定の下部指揮卓。Wide Landscape は両軍盤面と右側
  指揮卓。操作の主ボタンは全局面で右下の親指レーンに保つ。
- MISSION INDEX は TACTICAL / ARCHIVE / EXTREME、INITIAL TRAINING への導線、
  `ALL` / `UNCLEARED` / `CLEARED` フィルタを持つ。教程の完了表示は `COMPLETE`。
- 重要な目標・制約・残数・結果は切り詰めない。狭い画面では補助説明だけを畳み、
  再度開けるようにする。LOG、任務一覧、結果だけが明確なスクロール所有者になる。
- キーボード、タッチ、スクリーンリーダーで同じ確認手順を提供する。ダイアログの
  focus、44dp以上の操作対象、Reduce Motion、100/115/130%の文字拡大を確認する。

実装上の Canvas 階層、4つの Layout Profile、Safe Area、文字トークン、Unity の
アクセシビリティ要件は [Unity UI handoff](UNITY_UI_HANDOFF.md) と
[responsive UI contract](RESPONSIVE_UI_SPEC.md) を正本とする。実測基準と既知の
Web 確認結果は [responsive UI QA](RESPONSIVE_UI_QA.md) を使う。

## 演出・音・フォント・アセット

- CIC の低彩度ネイビー、cyan/amber/danger、scanline/noise、低振幅の ECHO・HIT・
  SUNK pulse を再現する。ボタン材質は各部品のローカル階層で完結させ、親パネルの
  z-orderや透過率でnoiseの有無が変わらないようにする。点滅を強くしたり、Reduce Motion
  で情報を消したりしない。
- 音は fire / hit / sunk / sonar / turn / victory / defeat を区別する。SURVIVAL の
  脈動は累積喪失0〜5隻で **260 / 240 / 220 / 200 / 185 / 170 ms**。非表示・pause中に
  音、時計、キューを進めない。
- Web の盤面、艦影、波、マーク、音は Canvas/CSS と Web Audio による自作・実行時生成。
  既存ゲームのスプライト、音源、スクリーンショットは移植資産として存在しない。
  `public/og.png` は告知画像であり、ゲームUIへ転用しない。
- Web の `--font-tactical` はOSフォールバックである。Unity は BIZ UDPGothic
  Regular/Bold、IBM Plex Mono Medium/SemiBold、Noto Sans JP fallback、専用 TMP
  Sprite Asset を用いる。フォント取得元、OFL、revision、SHA-256、atlas設定を記録し、
  OS同梱フォントをAPKへコピーしない。

フォント資産、TMP atlas、アセットmanifest、モーション値、音の実装選択（手続き生成
AudioClip または本作専用 WAV）の詳細は [Unity UI handoff](UNITY_UI_HANDOFF.md) を
参照する。

## 既存文書の読み順

1. [Unity UI handoff](UNITY_UI_HANDOFF.md) — Canvas、Safe Area、フォント、資産、
   演出、保存、Android QA、移植順。
2. [Unity implementation map](UNITY_IMPLEMENTATION_MAP.md) — Web正本からUnityのDomain、
   View、保存、音へ移すデータ境界と受入基準。
3. [MISSION library spec](MISSION_LIBRARY_SPEC.md) — 28任務のカテゴリ、公開情報、
   制約、EXTREME一覧、静的検証。
4. [MISSION mode spec](MISSION_MODE_SPEC.md) — 初期4任務の詳細、評価順、リトライ、
   AAR、canonical vector。
5. [INITIAL TRAINING spec](TRAINING_MODE_SPEC.md) — 9教程、実配置、損傷報告、誤指令、進捗、全教程修了。
6. [SURVIVAL directive](SURVIVAL_4_OPERATION_SPEC.md) — 4作戦、SEA BAT、永続損耗、
   脈動。
7. [Responsive UI contract](RESPONSIVE_UI_SPEC.md) と
   [Responsive UI QA](RESPONSIVE_UI_QA.md) — サイズ、操作、アクセシビリティ、実測。
8. [Text style audit](TEXT_STYLE_AUDIT.md) — 用語、英日表記、文字列の正本。
9. [Mission clearability report](MISSION_CLEARABILITY_REPORT.md) — 28本の release-screen
   sample と canonical route、歴史的16任務ベンチマーク。

## Web ↔ Unity parity チェックリスト

- [ ] 同じ seed・初期状態・入力列で、盤面、着弾、ECHO、識別、SONAR、wake、残弾、
  敵手、勝敗、ログevent種別が一致する。
- [ ] CASUAL / TACTICS 6海域、SURVIVAL 4作戦、28 MISSION、9教程を開始・リトライ・
  終了まで通す。28 canonical route はすべて成功する。
- [ ] 28任務の `PLOTTED CONTACTS`、ARCHIVE日誌、順序付き報告、兵装順・使用数、
  撃沈順、保護艦敗北を同じ条件で評価する。
- [ ] SEA BAT の攻撃/無音潜航交互行動と、LEVIATHAN の公開済み離脱候補・2手兵装順を
  別テストにする。
- [ ] 誤った教程指令が無消費であること、再受講が重複保存されないこと、全9教程以外で
  `TRAINING COMPLETE` を出さないことを確認する。
- [ ] `UNCLEARED` / `CLEARED` / `COMPLETE`、カテゴリ切替時の `ALL` reset、候補座標、
  難易度 `n / 6`、LOGと結果の文言・aria labelを照合する。
- [ ] 402×874、568×320、844×390、834×1112、1366×768以上で、Safe Area、主操作、
  スクロール、dialog focus、文字拡大、Reduce Motionを確認する。
- [ ] 各効果の開始/終了順、音イベント、SURVIVAL pulse、mute、pause/resume、
  60/90/120Hzでゲーム結果と待ち時間が変わらないことを確認する。
- [ ] APK/AABにフォントとOFL、必要なTMP atlasだけが含まれ、端末OS fontや既存作品の
  assetを含まないことを確認する。

## 意図的な差異（許容範囲）

- WebはReact/DOM、Canvas/CSS、Web Audio、localStorageを使う。UnityはuGUI/TMP、
  Unityの保存機構、AudioClip/AudioMixerを使ってよい。ただしDomain判定、情報公開、
  計時、乱数、音イベント、文言の意味は変えない。
- WebのOSフォントでの字形一致は要求しない。Unityはライセンス済み同梱フォントを
  基準にし、行長・改行・タップ領域・情報の可視性を一致させる。
- WebのWeb Audio oscillatorをそのまま移植する必要はない。波形を手続き生成するか、
  本作専用WAVを使用できるが、イベント区別・テンポ・pause中の無音は固定契約である。
- pixel-perfectなラスタ差は許容する。盤面中心、操作位置、情報の欠落、状態遷移、
  入力→結果の差は許容しない。

## 実装開始順

1. この文書と `UNITY_UI_HANDOFF.md` を読み、移植対象 Web SHA・テスト結果・比較captureを固定する。
2. Unity 非依存 Domain を先に作り、`constants` / `engine` / `EnemyAI` / `MissionRules` /
   Training進捗を移植して canonical route と保存データのテストを通す。
3. SafeAreaRoot、4 Layout Profile、テーマ、フォントと TMP Sprite Asset を作る。未取得の
   font binaryや仮版assetを正式資産にしない。
4. 盤面、艦カード、兵装、配置、戦況報告、LOG、AARを一つの通常交戦ループとして実装する。
5. TACTICS と SURVIVAL（永続損耗、SEA BAT、pulse）を追加する。
6. MISSION 28任務、ARCHIVE日誌、EXTREME制約、INITIAL TRAINING 9教程と進捗・モード解放を追加する。
7. 音、モーション、Reduce Motion、haptics、アクセシビリティ、Android実機QAを追加し、
   parity checklist と `npm test` 相当のUnity Domain/UIテストを完了する。
