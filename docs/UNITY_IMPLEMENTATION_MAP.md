# DEEP BLUE GRID — Unity 実装データ対応表

対象は Web 実装を Unity 6 へ移植する作業である。この文書は、どの Web ファイルがゲームの正本データか、Unity 側で何をデータとして移送し、何を C# で再実装するかを定める。パスはすべてリポジトリルート（`deep-blue-grid-web/`）からの相対パスである。

UI の画面階層・安全領域・フォント・端末別レイアウトは既存の [docs/UNITY_UI_HANDOFF.md](UNITY_UI_HANDOFF.md) を優先する。本書はそのうち、ルールとコンテンツを機械可読に引き継ぐ境界を補う。

## 1. 監査結果と移植原則

### 正本の区分

| 区分 | Web の正本 | Unity 側の扱い |
| --- | --- | --- |
| 静的ゲームデータ | `app/game/constants.ts`, `app/game/Campaign.ts`, `app/game/ExtremeMissions.ts`, `app/game/Training.ts` | JSON または ScriptableObject に変換して移送する |
| ルール実行系 | `app/game/engine.ts`, `app/game/MissionRules.ts`, `app/game/TrainingRules.ts`, `app/game/SubmarineWake.ts` | 同じ入出力契約を C# で再実装する |
| 敵 AI | `app/game/EnemyAI.ts` | C# で再実装する。乱数消費順も互換にする |
| 画面状態・入力 | `app/game/DeepBlueGrid.tsx` | Unity の画面・状態コンポーネントへ分割して再実装する |
| 描画 | `app/game/Renderer.ts` | uGUI/UI Toolkit + Board View で再実装する |
| 保存・結果集計 | `app/game/MissionRecords.ts`, `app/game/TrainingProgress.ts`, `app/game/OperationRecord.ts`, `app/game/AfterAction.ts` | JSON 保存と C# の純粋ロジックとして再実装する |
| 音 | `app/game/AudioManager.ts` | Unity AudioMixer/AudioSource（または同等の合成）で再実装する |
| 画面サイズ適応 | `app/globals.css`, `app/game/DeepBlueGrid.tsx`, `docs/UNITY_UI_HANDOFF.md` | CSS はコピーせず、Safe Area とレイアウト・プロファイルとして再実装する |

### 機械可読性の結論

- コンテンツ本体は TypeScript のオブジェクト配列で、数値座標・ID・列挙値を持つため**変換可能**である。
- ただし現在は JSON/CSV ではない。型情報は TypeScript 専用で、`app/game/ExtremeMissions.ts` は `Set` とループで `leviathanNet` を生成する。このまま Unity が直接読む形式ではない。
- Unity 実装開始時は、Web の静的配列を `unity-content-v1.json`（または同じフィールド構造の ScriptableObject）へ一方向に出力する export 手順を作る。値を Unity Inspector で手入力して二重管理しない。
- `scripts/measure-missions.ts` の `CANONICAL_MISSION_ROUTES` は可解性テスト用の回答ベクトルであり、プレイ用コンテンツには入れない。Unity の Editor/PlayMode テスト専用データにする。

## 2. 共通スキーマ契約

Unity の DTO/ScriptableObject は次の名前・意味を保つ。C# のプロパティ名を PascalCase に変えても、JSON キーまたは変換表はこの意味を失わないこと。

| 概念 | Web 型・値 | Unity 契約 |
| --- | --- | --- |
| 盤面 | `GRID_SIZE = 8` | 常に 8×8。可変盤面として一般化しない |
| 座標 | `Coord { x, y }` | `Vector2Int(x, y)` 相当。`x` は左から 0–7、`y` は上から 0–7 |
| 表示座標 | `CELL_LABELS = "ABCDEFGH"` | `A-1 = (0,0)`、`D-4 = (3,3)`。Unity の World Y 上向きへ黙って反転しない |
| 向き | `east`, `south`, `west`, `north` | 同名 enum。回転順も `east → south → west → north` |
| マーク | `unknown`, `miss`, `echo`, `hit`, `lost`, `sunk` | 敵情図と AI 知識の双方で区別して保存する |
| 艦 ID | `ShipId` | `carrier`, `battleship`, `cruiser`, `destroyer`, `escort`, `escortBravo`, `submarine`, `silentSubmarine`, `leviathan` を変更しない |
| 兵装 ID | `WeaponId` | `fire`, `phantom`, `harpoon`, `sparrow`, `mk45`, `radar` を変更しない |
| 乱数 | `SeededRandom` | 32-bit xorshift の演算と API 呼出順を一致させる。Unity 標準の `Random` へ置換しない |

座標・向き・乱数はセーブ、ミッション、AI、描画すべてをまたぐ契約である。ここを Unity の見た目都合で変えると、固定ミッション、初手、音紋、可解性テストが同時に崩れる。

## 3. Web ソースから Unity コンポーネントへの対応

| 領域 | Web のデータ源／実装 | Unity コンポーネント案 | 移送・再実装の要点 |
| --- | --- | --- | --- |
| 座標・盤面基準 | `app/game/constants.ts` | `GridContract`, `CoordinateFormatter` | `GRID_SIZE`、`CELL_LABELS`、向き、ECHO モードを静的設定として移送する |
| 艦型・重要区画 | `app/game/constants.ts` の `SHIPS` | `ShipDefinition` ScriptableObject / JSON | `id`, 和名、コード、`size`, `width`, `height`, 兵装名、艦ローカルの `critical` を移送。`silentSubmarine` と `leviathan` は占有 1 マスだが撃沈に 2 命中を要する `size = 2` である |
| 通常キャンペーン | `app/game/constants.ts` の `STAGES`, `app/game/Campaign.ts` の `SURVIVAL_STAGES` | `CampaignCatalog` | ステージ ID、タイトル、艦隊、`aiSkill` をデータ化。`Campaign.ts` の選択ヘルパーは C# サービスへ再実装 |
| 兵装 | `app/game/constants.ts` の `WEAPON_MAX`, `HARPOON_PATTERN`; `app/game/engine.ts` | `WeaponDefinition`, `AttackPatternResolver`, `ArsenalState` | F-4 は任意 4 点、MK-45 は任意 2 点、HARPOON は X 字 5 点、STRADDLE は基準＋前方 3 点、SONAR は左上基準 2×2。護衛リンクで F-4/HARPOON の上限が増える |
| 配置・命中・撃沈 | `app/game/engine.ts` の `Board`, `criticalCoordFor`, `Board.attack` | `BoardState`, `FleetPlacementService`, `CombatResolver` | 配置可否、既射撃拒否、ECHO、重要区画、撃沈後の全マス `sunk` 化を同じ順番で実装する |
| 静粛移動・音紋 | `app/game/engine.ts` の `relocateShip`; `app/game/SubmarineWake.ts` | `SilentRelocationResolver`, `WakeService` | 移動先の unknown/レーダー/音紋/艦との排他、最終接触の `lost` 化、包囲時の撃沈、周囲 8 マスからの音紋選択を再実装する |
| 護衛連接 | `app/game/engine.ts` の `hasEscortLink`, `hasFireControlLink`, `Arsenal` | `FormationLinkService`, `ArsenalState` | 護衛艦の**全区画**が空母または戦艦のいずれかの区画へ上下左右で隣接することが条件。斜め接触や一部区画だけの隣接は不可 |
| AI | `app/game/EnemyAI.ts` | `EnemyAiController`, `AiKnowledgeState` | HUNT/TARGET/SEARCH、公開済みマークだけを使う配置スコア、SONAR、兵装選択、silent の「射撃→移動」交互サイクルを再実装する |
| ミッション型 | `app/game/Campaign.ts` の `MissionStageDefinition` と関連型 | `MissionDefinition`, `MissionObjective`, `MissionOrder` | `player/enemyFleet`, 配置、既存損傷、初期情報、公開情報、先攻、兵装、目的、初期弾数、固定 seed、リンク条件、結果文を移送する |
| 標準・記録解析ミッション | `app/game/Campaign.ts` の `MISSION_STAGES`, `ARCHIVE_MISSIONS` | `MissionCatalog` | `MISSION_LIBRARY` は標準→記録解析→極限の順。カテゴリ、`sortOrder`、`difficulty` を UI フィルタと記録キーに使う |
| 極限ミッション | `app/game/ExtremeMissions.ts` の `EXTREME_MISSIONS` | `MissionCatalog` | 6 件を移送。LEVIATHAN 用 `leviathanNet` は生成結果を平坦な `initialIntel[]` として export するか、同じ生成式を C# に実装する |
| 公開済み手掛かり | `MissionEnemyDisclosure.candidateCells` in `app/game/Campaign.ts`, `app/game/ExtremeMissions.ts`, `app/game/Training.ts`; 表示は `app/game/DeepBlueGrid.tsx` | `MissionBriefView`, `PublicIntelMarkerView` | `candidateCells` は座標とコードを必ず表示する。任務解が内部情報へ依存しないためのプレイ契約であり、データ export から落としてはならない |
| ミッション判定 | `app/game/MissionRules.ts` | `MissionEvaluator`, `ScenarioLoader`, `MissionDefinitionValidator` | 目標達成を先に評価し、その後に保護艦喪失、最後に行動上限を評価する優先順位を保つ。指定 SONAR 起点、撃沈順、識別、初期弾数も同じにする |
| 教程コンテンツ | `app/game/Training.ts` | `TrainingCatalog` | 6 教程（stage ID 101–106）の `plainBrief`, `doctrine`, `steps`, `expected`, `highlight`, `debrief` を移送する |
| 教程の誤操作処理 | `app/game/TrainingRules.ts`, `app/game/DeepBlueGrid.tsx` | `TrainingStepValidator`, `TrainingFlowController` | `fire/radar/harpoon/sparrow` は座標と向きの完全一致、F-4/MK-45 は順不同の集合一致。誤操作は弾数・行動を消費せず同じ手順を再提示する |
| ミッション記録 | `app/game/MissionRecords.ts` | `MissionRecordRepository`, `MissionRecordService` | JSON version 1、キー `deep-blue-grid.mission-records` の意味を維持。勝利だけを記録し、総合 best は指令数優先→活動時間、最少指令と最短時間は独立して更新する |
| 教程進行 | `app/game/TrainingProgress.ts` | `TrainingProgressRepository` | JSON version 1、キー `deep-blue-grid.training-progress`、修了 lesson 1–6 の重複排除・昇順・冪等更新を維持。stage ID 101–106 も入力として受け付ける |
| SURVIVAL 作戦記録 | `app/game/OperationRecord.ts` | `SurvivalOperationRecorder` | 実行中のみの aggregate。pause/resume、stage 別の engagement/retry/行動/被害/損失、完了スナップショットを再実装する |
| 戦果報告 | `app/game/AfterAction.ts` | `AfterActionFormatter`, `CommandAssessmentService` | 事実テーブル、非難しない所見、Zulu/JST 時刻、経過時間を再実装。端末ロケールではなく日本時間表示を明示する |
| 描画 | `app/game/Renderer.ts` | `BoardView`, `BoardCellView`, `TargetPreviewView` | 盤面の隠蔽、命中/反響/音紋/SONAR/重要区画/選択/攻撃範囲を View 専用にする。ルール状態を View に持たせない |
| UI 状態・入力 | `app/game/DeepBlueGrid.tsx` | `GameFlowController`, `BattlePresenter`, `MissionLibraryPresenter`, `InputRouter` | React state を一枚の MonoBehaviour に直訳しない。フェーズ（placement/player/enemy/review/victory/defeat）、選択、ロック、ログ、モーダルを明示的な状態機械として分離する |
| 音 | `app/game/AudioManager.ts` | `AudioDirector`, `AudioMixer` | WebAudio の SFX は合成音で、外部音声アセットはない。cursor/confirm/cancel/fire/splash/hit/sunk/sonar/turn/victory/defeat と損失 tier の pulse 間隔をイベント契約として再実装する |
| レスポンシブ UI | `app/globals.css`, `app/game/DeepBlueGrid.tsx`, `docs/UNITY_UI_HANDOFF.md` | `SafeAreaFitter`, `ResponsiveRootController`, 各 View | CSS の px/メディアクエリをコピーしない。Safe Area、縦持ち 1 盤面切替、横持ち 2 盤面＋右レール、下部コマンド帯を Unity レイアウトとして再実装する |

## 4. 直接コピーするデータと、再実装するロジック

### 4.1 コピー／export してよいもの

以下は、内容を変えない変換の対象である。

- `app/game/constants.ts` の艦定義、ID、盤面定数、兵装上限、HARPOON パターン、通常ステージ定義。
- `app/game/Campaign.ts`、`app/game/ExtremeMissions.ts`、`app/game/Training.ts` のミッション・教程定義、日誌、表示文、固定 seed、公開情報、既存損傷、配置。
- `app/game/TrainingProgress.ts` と `app/game/MissionRecords.ts` の保存スキーマ version とフィールド意味。
- `scripts/measure-missions.ts` の canonical route は、配布データではなく Unity のテスト fixture としてのみ export する。

推奨する export の最上位構造は次のとおりである。

```json
{
  "schemaVersion": 1,
  "gridSize": 8,
  "cellLabels": "ABCDEFGH",
  "shipDefinitions": [],
  "weaponMaximums": {},
  "campaignStages": [],
  "survivalStages": [],
  "missions": [],
  "trainingStages": []
}
```

`missions` には標準、archive、extreme を含め、`trainingStages` は別配列にする。これは Web の `MISSION_LIBRARY` と `TRAINING_STAGES` が別の選択・進行経路であることに対応する。

### 4.2 コピーしてはいけないもの

- `app/game/engine.ts`、`app/game/EnemyAI.ts`、`app/game/MissionRules.ts`、`app/game/TrainingRules.ts` を文字列または JavaScript 実行環境として APK に持ち込まない。C# のテスト可能なドメイン層へ再実装する。
- `app/game/DeepBlueGrid.tsx` の JSX、React Hook、DOM タイマー、`requestAnimationFrame`、ブラウザ focus trap を移植しない。画面遷移と入力状態の意味だけを採用する。
- `app/game/Renderer.ts` の Canvas 2D 描画命令、`app/globals.css` の CSS、`pointerToCoord` のブラウザ座標変換をコピーしない。Unity RectTransform/イベント系で作り直す。
- `app/game/AudioManager.ts` の WebAudio/Wake Lock/visibility API をコピーしない。Android lifecycle、Audio Focus、Unity pause/resume へ置き換える。
- Web の `localStorage` API をコピーしない。Unity 側はアプリ領域の JSON（暗号化が必要ならその上位層）へ保存し、破損時は Web と同じく空データに戻す。

## 5. 実装順と依存関係

```text
Content export (JSON / ScriptableObject)
        │
        ├── GridContract + ShipDefinition + WeaponDefinition
        │       │
        │       ├── BoardState / CombatResolver / ArsenalState
        │       │       ├── MissionEvaluator / TrainingStepValidator
        │       │       ├── SilentRelocationResolver / WakeService
        │       │       └── EnemyAiController
        │       │
        │       └── BoardView / MissionBriefView
        │
        └── GameFlowController / Save repositories / AudioDirector
```

1. export データと `GridContract` を固定する。
2. Board、武器、重要区画、護衛リンク、RNG、静粛移動をヘッドレス C# で完成させる。
3. Mission と Training の評価・保存を追加し、Web の canonical fixture と突き合わせる。
4. AI を追加して seed 互換を検証する。
5. View、レスポンシブ UI、音、アクセシビリティを最後に接続する。View の都合でドメインの公開情報を省略しない。

## 6. 検証コマンドと Unity 受入基準

### Web 側の基準コマンド

リポジトリルートで実行する。

```powershell
npm run export:unity
npm run build
npm test
npm run measure:missions -- 5000
npm run measure:survival
npm run lint
```

`npm run lint` は移植契約そのものではなく、Web側の既知のReact ref構造も検査する。
2026-08-08時点では `DeepBlueGrid.tsx` に既存の50 errors / 2 warningsが残るため、
Unity JSONの合否は `npm run export:unity` と `npm test`（export一致テストを含む）で判定する。

主な証拠ファイルは以下である。

- ルール・配置・兵装・AI: `tests/game-rules.test.ts`
- ミッションの固定勝利経路: `tests/mission-simulation.test.ts`, `scripts/measure-missions.ts`
- ミッション記録: `tests/mission-records.test.ts`
- 教程の手順照合と進行保存: `tests/training-rules.test.ts`, `tests/training-progress.test.ts`
- 表示・操作・レスポンシブ契約: `tests/rendered-html.test.mjs`

### Unity 側の必須受入基準

- [ ] 8×8、座標、向き、全 `ShipId`、全 `WeaponId`、重要区画、弾数、ECHO モードが Web と一致する。
- [ ] Web の固定データから、通常 12、archive 4、extreme 6、training 6 を漏れなく読める。stage ID、sort order、カテゴリ、難易度、文章、公開座標を保持する。
- [ ] `tests/game-rules.test.ts` の同等ケースを C# Unit Test に移し、Board/Arsenal/護衛リンク/静粛移動/RNG の結果が一致する。
- [ ] `scripts/measure-missions.ts` の全 canonical route を Unity PlayMode またはヘッドレステストで実行し、全 22 任務が勝利する。テストは配置・初期損傷・seed・敵先攻を固定する。
- [ ] 教程 101–106 は期待 order 以外を消費なしで拒否し、期待 order を順番に実行すると修了する。複数目標兵装は目標の選択順を問わない。
- [ ] `candidateCells`、SONAR zone、initialIntel、initialEnemyWakes を Unity UI に表示し、固定解がプレイヤーに非公開の座標へ依存しない。
- [ ] 保存 JSON の version 1 を読み書きし、破損 JSON、重複した教程、無効な記録で例外を出さず Web と同じ正規化結果になる。
- [ ] phone portrait、tablet portrait、compact landscape、wide landscape で、安全領域内に盤面・主操作・LOG・任務ブリーフが収まる。詳細な数値は `docs/UNITY_UI_HANDOFF.md` に従う。
- [ ] アプリ pause/resume、Audio Focus 喪失・復帰、ミュート時に、乱数・行動数・経過時間・戦況を変えない。
- [ ] Unity の見た目実装は、敵配置や `BoardState` の内部艦セルを通常プレイ中に漏らさない。通常/ARCHIVEの敗北reviewだけが明示的な全配置revealを許可し、EXTREME敗北では未観測の固定配置・損傷を秘匿する。

## 7. 移植前の変更管理

- Unity 用 export と Web コンテンツの commit SHA を同じ PR/変更記録へ残す。
- `MissionStageDefinition`、艦 ID、武器 ID、保存 schema、RNG、座標系を変更する場合は、Web テスト、Unity テスト、export schema version を同時に更新する。
- UI の文言だけを直す変更でも、`directive`、`condition`、`enemyDisclosure.summary`、`candidateCells`、`TrainingStep.instruction` のどれかに触れる場合は canonical route と公開情報の整合を再確認する。
