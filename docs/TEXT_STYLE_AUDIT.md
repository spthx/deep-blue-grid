# DEEP BLUE GRID — TEXT STYLE AUDIT

最終監査日: 2026-08-01
対象: Web版の実行時にプレイヤーへ表示されるタイトル、操作文、戦術表示、警告、交戦経過記録、戦果報告、Canvas内文字、アクセシビリティ名。

## 1. 世界観と文体の正本

表示は「戦闘情報中枢（CIC）が、観測事実と実行可能な命令を簡潔に提示する」文体へ統一する。

- 英語大文字は、計器の状態名、作戦コード、操作コードとして使う。
- 日本語は、その状態の意味、操作結果、次に必要な行動を伝える。
- プレイヤーを責めず、確認できた事実、失われた能力、残る選択肢を記録する。
- 通常画面では短文、交戦経過記録では電文調、指揮所見では客観的な報告文を使う。
- 一つの表示内で `英語コード / 日本語` または `英語コード：日本語本文` の順序を基本とする。
- グリッドの単位は、操作説明を含めて「区画」。内部実装名や一般向けREADMEを除き「マス」は使わない。

## 2. 用語辞書

### 進行単位

| 正本 | 日本語 | 用途 |
|---|---|---|
| `OPERATION MODE` | 作戦モード | 四つの遊び方を選ぶ最上位画面 |
| `CAMPAIGN` | キャンペーン | CASUAL / TACTICSの全6海域を通した進行 |
| `SECTOR` | 海域 | CASUAL / TACTICSの各1面 |
| `SURVIVAL` | サバイバル | 累積損耗を伴う全4作戦の進行 |
| `OPERATION` | 作戦 | SURVIVALの各1面 |
| `SPECIAL MISSIONS` | 限定任務群 | MISSIONの全28任務（戦術16・記録解析5・極限7） |
| `MISSION` | 限定任務 | 固定編成・固定状況・個別勝利条件を持つ各1面 |
| `ENGAGEMENT` | 交戦 | 一つの海域・作戦・限定任務に対する1回の出撃。リトライで別交戦になる |
| `FRIENDLY ACTION` | 自軍行動 | プレイヤーが兵装または聴音を1回実行する単位 |
| `ORDER` | 指令 | MISSIONで消費上限を示す自軍行動枠 |

`STAGE` は型名やテストなどの内部語に限定し、実行時には表示しない。

### 指揮・画面

| 正本 | 日本語 | 用途 |
|---|---|---|
| `COMBAT INFORMATION CENTER / CIC` | 戦闘情報中枢 | 画面全体の話者 |
| `OWN FORCE PLOT` | 自軍戦術図 | 自軍艦、重要区画、着弾、損傷を表示 |
| `HOSTILE CONTACT PLOT` | 敵情図 | 未確定情報を含む敵接触情報を表示 |
| `FLEET DEPLOYMENT` | 艦隊配置 | 通常モードの自由配置 |
| `MISSION BRIEF` | 配備確認 | MISSIONの固定編成・状況・命令確認。自由配置とは呼ばない |
| `FIRE CONTROL` | 射撃指揮 | 射撃兵装を使う自軍行動フェーズ |
| `SONAR CONTROL` | 聴音指揮 | PASSIVE SONARだけを使うMISSION 02の自軍行動フェーズ |
| `HOSTILE ACTION` | 敵攻撃 | 敵指揮系統の行動中 |
| `DAMAGE REPORT` | 損害報告 | 敵攻撃後に自軍戦術図を確認する段階 |
| `FILE DAMAGE REPORT` | 戦闘記録へ記載 | 損害報告を確定して適切な指揮へ戻る操作 |
| `CIC EVENT LOG` | CIC交戦経過記録 | Zulu時刻付きの全交戦記録 |
| `AFTER ACTION REPORT` | 交戦後報告 | 結果、戦果、損耗、経過時間の表示 |
| `COMMAND ASSESSMENT` | 指揮所見 | 敗因断定ではなく、確認事実に基づく指揮上の分析 |

`COMMAND` 単独は通常の自軍ターン名に使わない。`COMMAND ASSESSMENT` は、指揮所による分析という別の意味なので維持する。

### 接触・損傷・識別

| 表示 | 意味 |
|---|---|
| `MISS` | 命中も上下左右のECHO条件も成立しない着弾 |
| `ECHO` | 着弾区画の上下左右に未破壊艦区画が存在する反応。PASSIVE SONARのCONTACTとは別 |
| `HIT` | 艦区画への命中 |
| `SUNK` / 撃沈 | 戦術図・即時戦果で使う確定状態 |
| 戦闘能力喪失 | 報告書で、艦または部隊が任務を継続できない事実を表す |
| `UNKNOWN CONTACT` | 艦種未識別の敵影 |
| `IDENTIFIED` | 重要区画命中により艦種・コードだけが判明した状態 |
| `IMPORTANT SECTION` / 重要区画 | 各艦1区画の識別用区画。追加ダメージなし |
| `HULL DATA MASKED` | 耐久情報秘匿 |
| `CONTACT` | PASSIVE SONARの指定4区画内に有効音響反応あり |
| `NO CONTACT` | PASSIVE SONARの指定4区画内に有効音響反応なし |
| 音紋 | 最後の潜水艦が行動後に周辺へ残す位置推定情報 |
| `LAST KNOWN CONTACT / LKC` | 特殊潜航艦移動後の最終接触位置 |

### 艦・兵装表記

艦名とコードの正本は `app/game/constants.ts` の `SHIPS`、兵装名と操作表示、艦種解説の正本は `app/game/PresentationContract.ts` の `WEAPON_PRESENTATION` / `ACTION_LABEL` / `SHIP_DOSSIER`。

- 艦コード: `CV`, `BB`, `CA`, `DD`, `DE-01`, `DE-02`, `SS`, `SSX`
- 兵装: `通常砲撃`, `F-4 PHANTOM`, `HARPOON`, `8-INCH STRADDLE`, `MK-45 II`, `PASSIVE SONAR`
- `radar`、`sparrow`、`stage` などは互換性を保つ内部IDであり、プレイヤー表示へ出さない。

## 3. 画面別テキスト所在

| 画面・出力 | 正本となるコード |
|---|---|
| ブラウザタイトル、説明、OG代替文 | `app/layout.tsx` |
| 艦名、コード、搭載兵装、通常6海域の名称・副題 | `app/game/constants.ts` の `SHIPS`, `STAGES` |
| SURVIVAL 4作戦、MISSION 28任務、INITIAL TRAINING 9教程、任務命令・制約・終了電文 | `app/game/Campaign.ts` の `SURVIVAL_STAGES`, `MISSION_LIBRARY`, `TRAINING_STAGES`, `routeUnit` と `app/game/AdditionalMissions.ts` の追加6任務 |
| MISSIONの汎用失敗報告、開始時損傷文 | `app/game/MissionRules.ts` |
| モード選択、上部状態、操作案内、艦カード、配置、兵装、警告、LOG、AAR、ボタン、aria-label | `app/game/DeepBlueGrid.tsx` |
| 敗北時の事実欄と指揮所見 | `app/game/AfterAction.ts` |
| A-H / 1-8、支援リンク略号、艦種識別略号、LKC、MISSION聴音区画名 | `app/game/Renderer.ts` |
| 開閉記号、MISSION情報マーカー `◇` | `app/globals.css` の疑似要素 |
| 音声 | `app/game/AudioManager.ts`。発話テキストはなく、Web Audioによる合成音のみ |

### 原型4 MISSIONの表示契約

| 任務 | 表示上の主題 | 指揮表示 | 主要条件 |
|---|---|---|---|
| NARROW GATE | 既知損傷と音紋から対象2隻だけを阻止 | `FIRE CONTROL / 射撃指揮` | 3指令、DD・SS撃沈、敵主力残存可 |
| SILENT WATCH | 相反する二つの聴音報告を収集 | `SONAR CONTROL / 聴音指揮` | PASSIVE SONARのみ、2指令、潜水艦生存 |
| LAST FLIGHT | 二つの配置仮説を最終航空隊で切り分け | `FIRE CONTROL / 射撃指揮` | 2指令、BB撃沈、空母生存 |
| BROKEN SPEAR | 残存二艦の射撃管制リンクによる最終斉射 | `FIRE CONTROL / 射撃指揮` | HARPOONのみ、3指令、BB・DE生存 |

## 4. 今回修正した不統一

- MISSION 02の開始後、損害報告後、上部タグ、確認ボタンが `FIRE CONTROL / 射撃指揮` になる問題を、目的種別から `SONAR CONTROL / 聴音指揮` を導出する方式へ修正。
- `routeUnit()` のMISSION日本語を「特別任務」から、画面全体で使われる「限定任務」へ統一。
- 全任務終了時の `MISSION SELECT` / `NEW CAMPAIGN` / `NEW SURVIVAL RUN` は、実際には全モード選択へ戻るため `MODE SELECT / 作戦モード選択へ戻る` へ修正。
- MISSION固定配置を `FLEET DEPLOYMENT / 艦隊配置` と呼ばず、`MISSION BRIEF / 配備確認` と表示。
- 操作面の「敵海域」「海図」「盤面外」を「敵情図」「自軍戦術図」「自軍戦術図外」へ統一。
- 操作単位の「マス」を「区画」へ統一。
- 「攻撃指揮へ復帰」を、任務に応じた「射撃指揮へ復帰」または「聴音指揮へ復帰」へ修正。
- ライブ表示の敵側英語を `HOSTILE` に統一し、`ENEMY PASSIVE SONAR` を `HOSTILE PASSIVE SONAR` へ修正。
- AARのプレイヤー行動数を `FRIENDLY ACTIONS`、無力化艦数を `HOSTILE SHIPS NEUTRALIZED` と明記。
- `CIC戦闘経過記録` / 「バトルログ」を、表示名とアクセシビリティ名で `CIC交戦経過記録` へ統一。
- 艦データ未確定時の曖昧な `UNKNOWN` を `CONTACT DATA PENDING` へ変更。
- SURVIVAL補給後の「次海域進入戦力」を、進行単位に合う「次作戦投入戦力」へ修正。
- ブラウザ説明を、海域攻略だけでなく累積損耗と限定任務も含む内容へ更新。

## 5. 意図的に残した英日混在

- `FIRE CONTROL：兵装を選択…` のように、CICの機器・状態コードを英語、意味を日本語で表示する。
- `SUNK / 撃沈` は即時の戦術判定、`戦闘能力喪失` はAAR・終了電文の公的表現として使い分ける。
- `CONTACT`, `NO CONTACT`, `ECHO`, `HIT`, `MISS` は戦術図の短い符号なので翻訳せず、近接する説明で意味を示す。
- 実在・架空を含む兵装固有名と艦コードは大文字表記を維持する。
- `LOG` は狭いスマホ操作枠のボタン略号として維持し、aria-labelで「CIC交戦経過記録」を補う。
- 内部の `stage`, `radar`, `sparrow`, `player`, `enemy` は保存互換性と実装上の識別子であり、表示語彙の監査対象外。

## 6. 機械テスト対象

`tests/rendered-html.test.mjs` が以下を固定する。

- 5モード名（INITIAL TRAININGを含む）、重要区画説明、AIの情報取得条件。
- モード選択の旧見出し `DIFFICULTY` と旧モード名 `NORMAL` / `HARD`、ならびに `VITAL COMPARTMENT`, `NO TRACK`, `REPORT LOGGED`, `FULL OPERATION LOG`, `FIRE ACCURACY` が復活しないこと。MISSIONカードの課題評価 `DIFFICULTY n / 6` は現行の正式表記として許可する。
- MISSIONの状況・目標・制約、指令残数、任務開始、任務リトライ。
- 損害報告の記載操作、交戦経過記録、戦術図レビュー。
- CONTACT / NO CONTACT、重要区画命中、支援リンク、配置回転の主要文言。

`tests/game-rules.test.ts` が、表示文の前提となる5モードの編成、任務条件、指令上限、固定配置、AI強度、終了判定を固定する。

今後、モード単位名、兵装名、重要区画名、CONTACTの意味を変更するときは、コードだけでなく本書と上記二つのテストを同時に更新する。
