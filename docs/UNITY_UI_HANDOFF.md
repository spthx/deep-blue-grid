# DEEP BLUE GRID — Unity / Android UI・演出引き継ぎ仕様

更新日: 2026-08-01

対象: 将来の Unity 6 / Android 版。現時点では Unity 実装を開始せず、Web 版を攻略・調整した後に移植するための契約を定める。

この文書で `MUST` は移植時に守る要件、`SHOULD` は合理的な理由がない限り守る推奨を示す。Unity 側の都合で変更する場合は、変更理由と比較画像を残す。

## 1. 移植の基準と非目標

Unity 版の基準は「旧作らしさの再解釈」ではなく、**現在の DEEP BLUE GRID Web 版そのもの**である。盤面、艦影、マーク、色、情報公開量、操作の確認段階、ログ文体、演出の呼吸を一体として移植する。

- 最優先はスマートフォン縦持ち。片手でも盤面確認から発射・報告まで指の移動が短いこと。
- タブレット縦横、横持ちスマートフォン、PC 相当の横長画面も同じルールと情報量で操作できること。
- 画面回転、Android のカットアウト、ジェスチャーナビゲーション、マルチウィンドウで重要操作を隠さないこと。
- 解像度を理由に文字を極端に縮小しない。読めない情報は縮めるのではなく、畳む、スクロール領域へ移す、詳細パネルで開く。
- Unity のレイアウトやアニメーションがゲーム結果、乱数消費、AI 判断、指令数を変えてはならない。
- Web のスクリーンショットを一枚の背景画像として貼る実装は禁止する。拡縮に弱く、文字・安全領域・アクセシビリティを失うためである。

### 現行の正本

| 領域 | 正本 |
| --- | --- |
| 画面構造、表示文、操作 | `app/game/DeepBlueGrid.tsx` |
| 色、余白、レスポンシブ配置 | `app/globals.css` |
| 8×8盤面、艦影、ECHO、音紋、SONAR、重要区画 | `app/game/Renderer.ts` |
| ルール、艦、兵装、乱数 | `app/game/constants.ts`, `app/game/engine.ts` |
| AI | `app/game/EnemyAI.ts` |
| MISSION 定義・評価 | `app/game/Campaign.ts`, `app/game/MissionRules.ts` |
| MISSION 全22問（戦術12・記録解析4・極限6）の契約 | `docs/MISSION_LIBRARY_SPEC.md` |
| 用語と文体 | `docs/TEXT_STYLE_AUDIT.md` |
| 音とテンポ | `app/game/AudioManager.ts` |

移植開始時に上記ファイルの Git commit SHA を本書へ追記し、以後の比較基準を固定する。実装途中で Web が更新された場合は、差分を無条件で混ぜず、移植対象 SHA を更新する変更として扱う。

## 2. Unity UI の基盤

### 2.1 Canvas 構成

ランタイム戦闘画面は uGUI + TextMeshPro を基本とする。UI Toolkit へ置き換える場合も、以下の階層と状態分離を維持する。

```text
AppCanvas                         Screen Space - Overlay
├─ FullBleedBackground            画面端まで。操作・文字を置かない
├─ SafeAreaRoot                   Screen.safeArea に追従
│  ├─ HeaderRegion
│  ├─ StatusRegion
│  ├─ FieldSwitchRegion
│  ├─ WorkspaceRegion
│  │  ├─ PlotRegion
│  │  ├─ FleetCardsRegion
│  │  └─ CommandRailRegion        横画面のみ
│  └─ BottomCommandRegion         縦画面の固定操作帯
├─ TransientOverlayRoot           ターン字幕、SONAR、識別警告
├─ DrawerRoot                     LOG、日誌、詳細
└─ ModalRoot                      モード選択、任務一覧、戦果報告
```

- `AppCanvas.renderMode`: `ScreenSpaceOverlay`。
- `CanvasScaler.uiScaleMode`: `ScaleWithScreenSize`。
- `GraphicRaycaster` は一つを基本とし、装飾 Graphic は `raycastTarget = false`。
- `Pixel Perfect` は無効を基本とする。細線はスケール後の半端な座標へ依存せず、SDF またはシェーダーで最低1物理ピクセルを保証する。
- 背景だけは Safe Area の外まで描く。ボタン、タブ、盤面座標、LOG 閉じるボタンは必ず `SafeAreaRoot` 内に置く。
- 盤面は常に正方形。縦横どちらでも縦方向へ引き伸ばさない。

### 2.2 CanvasScaler とレイアウトプロファイル

一つの巨大な Canvas を倍率だけで合わせない。`ResponsiveRootController` が Safe Area の縦横比を見て、次のレイアウトを切り替える。

| プロファイル | 判定の目安（Safe Area） | 参照解像度 | Match | 基本構成 |
| --- | --- | --- | ---: | --- |
| `PhonePortrait` | aspect `< 0.68` | 402×874 | 0.0（幅優先） | 盤面1枚、下部操作帯 |
| `TabletPortrait` | `0.68 ≤ aspect < 1.0` | 768×1024 | 0.2 | 盤面1枚、余白へ補助情報 |
| `CompactLandscape` | aspect `≥ 1.0` かつ短辺が狭い | 1366×700 | 0.65 | 盤面1枚切替＋右指揮卓 |
| `WideLandscape` | aspect `≥ 1.55` かつ十分な短辺 | 1920×850 | 0.5 | 両軍盤面＋右指揮卓 |

`aspect = safeArea.width / safeArea.height` とする。物理 DPI は端末報告が不正確なため、プロファイル判定の唯一の根拠にしない。参照解像度は Web の基準 viewport と対応させるための論理解像度であり、テクスチャ解像度ではない。

回転時はレイアウトだけを再構成し、戦況、選択兵装、照準、残弾、ログ、経過時間を維持する。ドラッグ中に回転した場合だけ、そのドラッグをキャンセルして直前の確定配置へ戻す。回転を「配置決定」や「発射」として解釈してはならない。

### 2.3 Safe Area

`SafeAreaFitter` は `Screen.safeArea` を Canvas 座標へ変換し、次を満たす。

1. 初回フレームだけでなく、解像度、向き、Safe Area、Android ウィンドウサイズが変わるたびに再適用する。
2. `anchorMin = safeMin / screenSize`、`anchorMax = safeMax / screenSize` とし、offset はゼロにする。
3. Android のナビゲーションバーを常時同じ高さと仮定しない。3ボタンナビ、ジェスチャーナビ、没入表示、マルチウィンドウを実機で確認する。
4. 下部指揮卓は Safe Area の底から 7–10 論理単位離す。ホームインジケータ側へはみ出させない。
5. ターン字幕などの全画面演出は画面端まで暗転してよいが、字幕本文は Safe Area 内へ収める。

## 3. 画面ごとのアンカー契約

### 3.1 PhonePortrait（最優先）

基準は 402×874。1論理単位を基準 Web の約1 CSS px とみなし、次を目標にする。

- 外周余白: 7–10。
- ヘッダー: 44–54。ブランド名より局面表示を優先し、GMT/JST等の補助情報は1行に圧縮する。
- 状態帯: 40–48。現在行うことを1文だけ表示する。
- 自軍／敵情切替: 44以上。`LOG`、ミュート、リトライは同じ操作列へ置く。
- 盤面: `min(safeWidth - 16, availableHeight)` の正方形。原則として表示中の盤面は1枚だけ。
- 通常攻撃時の下部指揮卓: 約138を上限目安とし、固定2段。発射は右下、キャンセルはその左。
- 配置時の下部指揮卓: 最大 `min(220, safeHeight × 0.42)`。内部だけスクロール可能。盤面本文側には指揮卓高と同じ bottom padding を確保する。
- 戦況確認: `FILE DAMAGE REPORT` を右側の親指レーンへ固定し、押下するまで敵行動の結果表示を保持する。
- LOG: 下から開く drawer。最大72%高。閉じるボタンは44以上、右上固定。本文だけスクロールする。
- 戦果報告: モーダル本体をスクロール可能にし、主要操作を末尾または固定フッターへ置く。敗北時の `RETRY` と `WITHDRAW` を明確に分ける。

下部指揮卓は内容の長さで場所を変えない。通常砲撃、特殊兵装、MISSION の `LISTEN`、配置決定、戦況報告、リトライを同じ右下の主操作レーンへ揃える。これは見た目より重要な操作契約である。

### 3.2 TabletPortrait

- 基本は盤面1枚切替。2枚を無理に上下へ並べない。
- 盤面幅は Safe Area の85–94%を上限とし、余った横幅へ艦カードまたは説明を置ける。
- 下部指揮卓は phone と同じ意味順を保ち、必要なら横幅を使って1段増やす。ただし主操作は右下。
- 768×1024で盤面、切替、現在目標、主操作が小さな補正スクロールなしで到達できること。

### 3.3 CompactLandscape

- 短い横画面では盤面を1枚だけ表示し、自軍／敵情を左上の切替で入れ替える。
- 右側に 280–330 論理単位の指揮卓を置く。兵装、配置操作、報告、LOG を上下にまとめ、ブラウザ／OS 相当の上下占有があっても隠さない。
- 指揮卓だけ内部スクロールを許可する。主操作は指揮卓下端へ固定し、補助説明が長くても押し出されない。
- 1024×600、960×540相当を最低確認対象にする。

### 3.4 WideLandscape / PC相当

- 左側 Workspace に自軍盤面と敵情盤面を横並び、右側に指揮卓。
- 指揮卓幅は 286–326 を下限目安とする。兵装は2列、配置操作も同じ位置・同じ2列構造を使う。
- 1920×850でブラウザツールバー／タスクバー相当を差し引いた高さへ完全に収める。1920×1080だけで合格にしない。
- マウスを盤面下と画面端の間で往復させない。照準、兵装選択、キャンセル、発射、報告が右指揮卓内で完結する。
- ホバー、フォーカス、長押しで兵装説明を表示するが、選択と発射は別操作のままにする。

## 4. 文字・フォント資産

### 4.1 フォント方針

Web は現在 `--font-tactical` に `ui-monospace`、SFMono-Regular、Menlo、Monaco、Consolas、Roboto Mono、Noto Sans Mono CJK JP、Noto Sans JP、Hiragino Sans、Yu Gothic UI、Meiryo、`monospace` を順序付きで指定している。ただし、これは端末フォールバックでありAPKへ同梱できるフォント資産ではない。端末によって字形・文字幅・行高が変わるため、このCSS指定を Unity APK の基準として流用してはならない。

Unity 移植開始時の既定セットを次で固定する。これは「候補を列挙しただけ」ではなく、実機比較で重大な欠点が出ない限り採用する移植契約である。現時点ではフォントバイナリを取得・同梱しておらず、Web の表示も変更していない。

| Asset ID | 用途 | Family / weight | ライセンス | 正規取得元 |
| --- | --- | --- | --- | --- |
| `DBGrid_JP_Regular` | 日本語本文、説明、日誌、通常ボタン | BIZ UDPGothic Regular | SIL Open Font License 1.1 | [Google Fonts / bizudpgothic](https://github.com/google/fonts/tree/main/ofl/bizudpgothic) |
| `DBGrid_JP_Bold` | 日本語見出し、主要ボタン、警告 | BIZ UDPGothic Bold | SIL Open Font License 1.1 | [Google Fonts / bizudpgothic](https://github.com/google/fonts/tree/main/ofl/bizudpgothic) |
| `DBGrid_Code_Medium` | 英字コード、GMT、座標、残数、艦コード | IBM Plex Mono Medium | SIL Open Font License 1.1 | [IBM Plex releases](https://github.com/IBM/plex/releases) |
| `DBGrid_Code_SemiBold` | 英字フェーズ名、短い戦術テロップ | IBM Plex Mono SemiBold | SIL Open Font License 1.1 | [IBM Plex releases](https://github.com/IBM/plex/releases) |
| `DBGrid_JP_Extended_Regular` | BIZ UDPGothic Regularにない日本語・記号だけ | Noto Sans JP Regular | SIL Open Font License 1.1 | [Google Fonts / notosansjp](https://github.com/google/fonts/tree/main/ofl/notosansjp) |
| `DBGrid_JP_Extended_Bold` | BIZ UDPGothic Boldにない日本語・記号だけ | Noto Sans JP Bold | SIL Open Font License 1.1 | [Google Fonts / notosansjp](https://github.com/google/fonts/tree/main/ofl/notosansjp) |
| `DBGrid_Icon` | ミュート、回転、照準等 | 本作専用 TMP Sprite Asset | 本作資産 | Web の自作図形を基準に再制作 |

BIZ UDPGothic は日本語の可読性、IBM Plex Mono はCIC端末らしい桁揃えを担当する。二つを一つの TMP fallback chain へ置いただけでは、BIZ UDPGothic 自身が持つ英数字が先に選ばれる。そのため、GMT、座標、艦コード、兵装コードは別の `TMP_Text` または明示的な font style component にし、`DBGrid_Code_*` を直接割り当てる。日本語を含む文章全体へ無理に等幅フォントを適用しない。

⚔、↻、✓、スピーカーなどの操作記号をOS絵文字へフォールバックさせない。盤面上の `◆`、`◇`、`×`、英数字はフォントコーパスへ含め、操作アイコンは `DBGrid_Icon` へ分離する。これによりAndroid機種ごとのカラー絵文字化やベースラインずれを防ぐ。

#### ライセンスと取得記録

- Unity作業開始時に、上表の正規取得元から一度だけ取得し、同じリリースのoutlineを Web と Unity の正本にする。検索結果、OSフォントフォルダ、非公式ミラーからコピーしない。
- 各familyの配下へ、配布物に含まれる `OFL.txt` を改変せず保存する。`ThirdPartyNotices.md` にはfamily、copyright、license、取得URL、取得日、upstream version/commit、各font fileのSHA-256を記録する。
- TTF/OTFからWOFF2へ形式変換または文字subsetを作る場合は、使用toolとversion、入力hash、出力hash、文字集合を記録する。outlineを編集した派生物は、同梱OFLの Reserved Font Name 条項を確認し、必要ならfamily名を変更する。
- Noto Sans JPの正規配布物がvariable fontだけの場合、TMPへweight axisの切替を期待しない。Regular 400 / Bold 700のstatic instanceを生成し、生成tool/versionと入出力hashをmanifestへ残す。
- SFMono、Menlo、Consolas、Hiragino、Yu Gothic、Meiryoなど、現在CSSに書かれているOS付属fontをAPKやWeb配布物へコピーしない。現在のCSSは未同梱時のfallbackであって再配布許諾ではない。
- font fileを差し替える変更は画像調整と同列に扱わない。version/hash、TMP atlas、Web WOFF2、比較画像を同じcommitで更新する。

Unity側の配置は `Assets/ThirdParty/Fonts/<Family>/Source/`、licenseは同family直下、生成したTMP assetは `Assets/DeepBlueGrid/UI/Fonts/Generated/` とする。sourceとgeneratedを混在させない。採用時点のmanifest例は次を正本として埋める。

```text
asset_id, family, style, upstream_url, upstream_revision,
source_sha256, derived_file, derived_sha256, license_file,
corpus_sha256, atlas_settings, acquired_at
```

### 4.2 TextMeshPro atlas

- 開発中は Japanese asset を `Dynamic` + `Multi Atlas Textures` にして欠字を発見しやすくしてよい。ただしsource font fileをProjectへ保持する方式とし、端末OS fontへ依存しない。Dynamic assetは欠字調査用であってrelease設定ではない。
- リリースでは表示文字コーパスから `Static` atlas を再生成する。C#、Localization/String Table、MISSION日誌、艦・兵装名、座標、ログ定型文、評価文、アクセシビリティ名を抽出対象にする。ユーザー入力を将来追加する場合だけ、隔離したDynamic fallbackを検討する。
- `DBGrid_Code_Medium/SemiBold`: 1024×1024、Sampling Point Size 64–72、Padding 8以上、`SDFAA_HINTED`（使用中のTMP版で未提供なら `SDFAA`）。ASCII、全角・半角数字、`A–H`、`0–9`、`+ - / : . ! ?`、単位記号を含める。
- `DBGrid_JP_Regular/Bold`: 4096×4096を第一候補、Sampling Point Size 64–72、Padding 9以上、同じSDF render mode。1枚へ無理に詰めず、Multi Atlasを使う。RegularとBoldは別assetとし、fake boldに依存しない。
- `DBGrid_JP_Extended_Regular` / `DBGrid_JP_Extended_Bold`: コーパス中でBIZ UDPGothicが持たない文字だけを収録するStatic fallback。全文字の巨大Noto atlasを先に生成しない。
- SDF atlas はぼけと縁取りの破綻を避けるため、原則として非圧縮の単一チャンネルを使う。端末上のメモリ計測後にのみ圧縮を検討する。
- fallback順序は `JP Regular → JP Extended Regular`、`JP Bold → JP Extended Bold`、`Code Medium/SemiBold → JP Regular` とし、逆参照を作らない。`TMP Settings` のglobal fallbackへ端末依存fontを登録しない。
- Production build 前に全表示文字を走査し、欠字 `□`、replacement character、意図しないカラー絵文字を0件にする。
- Font Asset Creator の設定値、文字集合ファイル、抽出script、corpus hashを版管理する。Editor 上で手作業再生成しただけのatlasを正本にしない。CIまたはEditor validationで、文字集合にない表示文字とdefault TMP fontを使うPrefabをerrorにする。

### 4.3 Typography tokens

402×874論理解像度での基準値。値は `CanvasScaler` 適用後の論理サイズであり、CSS pxやAndroid spを機械的に1対1変換する値ではない。端末ごとの `Auto Size` で勝手に縮めず、レイアウトプロファイルと明示的tokenで調整する。

| Token | Size / line-height | 用途 |
| --- | --- | --- |
| `Display` | 30 / 36 | 勝敗、SONAR結果など短い主表示 |
| `Title` | 24 / 30 | モード・任務一覧の題名 |
| `Phase` | 15 / 20 | FIRE CONTROL、HOSTILE ACTION |
| `PanelTitle` | 14 / 19 | 盤面名、LOG、MISSION BRIEF |
| `ButtonPrimary` | 15 / 20 | 発射、配置決定、報告、開始 |
| `ButtonLabel` | 14 / 19 | 兵装名、通常ボタン |
| `Body` | 13 / 20 | 説明、日誌、戦果所見 |
| `Meta` | 12 / 16 | 残数、座標、英語副題 |
| `Micro` | 11 / 14 | 非必須の装飾情報のみ |

- 日本語本文の文字間隔は0–0.04em。英字見出しだけ0.08–0.18emを許可する。
- `Micro` 未満の文字を作らない。収まらない場合は省略表示と詳細表示を併用する。
- 日本語ボタンは最大2行を許可し、行高を1.3以上にする。主要ボタンの本文を `…` だけにしない。
- 数値、UTC時刻、座標は tabular / monospaced digits を使う。
- TextMeshPro の自動縮小は原則OFF。例外は短い英字コードのみで、最小サイズを token の85%未満にしない。
- TMPの `lineSpacing` 値を表のline-heightとして直接入力しない。使用fontの実測line metricsからtokenごとの最終block高を合わせ、複数行の日本語で上下が接触しないことを確認する。
- 大きな文字設定を100% / 115% / 130%で用意し、130%時は情報を畳むことで盤面と主操作を維持する。Unity UIはAndroidのsystem font scaleへ自動追従しないため、少なくともゲーム内設定を提供し、可能なら初回値だけOS accessibility設定から導く。
- 現行Web CSSには、短い横画面の装飾や補助文で6.5–10pxまで圧縮する例が残る。これらの数値はUnityへ転記せず、文字の役割と本表を正本にする。Unityで高さが不足した場合は、補助文を畳む、右railだけを内部scrollさせる、完全な説明を長押しで開く、の順で解決する。

### 4.4 TMP material

- 本文: Face 100%、Outline 0–0.04、Underlayなし。可読性を発光で補わない。
- Cyan/Amber 見出し: 弱い Underlay または外側グローを1種類だけ使用し、本文まで滲ませない。
- 危険表示: 色だけでなく `HOSTILE` / `DAMAGE` の語、左3px相当の線、警告アイコンを併用する。
- マテリアルを個々のPrefabで複製せず、`DBGrid_Text_Body`, `DBGrid_Text_Cyan`, `DBGrid_Text_Amber`, `DBGrid_Text_Danger` の共有 preset とする。

### 4.5 Web / Unity の字形一致

Unity移植開始後、Webにも同じupstream revisionから作ったWOFF2をself-hostし、次の二系統へ分ける。外部font CDNを実行時依存にしない。

```css
--font-ui: "DBG BIZ UDPGothic", "Noto Sans JP", sans-serif;
--font-code: "DBG IBM Plex Mono", "Noto Sans Mono CJK JP", monospace;
```

- 日本語本文、ボタン、日誌は `--font-ui`。GMT、JST、座標、艦コード、残数、英字phase labelは `--font-code`。
- Webの `@font-face` とUnity source fontは同じupstream revisionのoutlineを使う。WOFF2変換時にhintingやglyphを変更した場合はmanifestへ記録する。
- `font-display` による初回reflowを許容しても、比較captureと盤面寸法測定は必ず `document.fonts.ready` 後に行う。
- 日本語と英字コードを一つの文字列へ混在させる場合は、Webではspan、Unityでは別TMP componentまたはstyle tagで役割を分ける。fallback任せで見た目を偶然一致させない。
- Webへのfont同梱はUnity移植開始時に一緒に行う。現段階では端末fallbackを維持し、未取得binaryや仮versionをrepositoryへ入れない。

### 4.6 フォント受入試験

次を100% / 115% / 130%の各文字倍率、`PhonePortrait` / `CompactLandscape` / `WideLandscape` で確認する。主基準は402×874縦持ちである。

1. `戦況確認完了`、`重要区画被弾`、`敵に識別されました：航空母艦`、MISSION日誌、最長の指揮所見を実データで表示する。
2. `1243Z`、`21:43 JST`、`A–H / 1–8`、`BB-05`、`CV-08`、残数 `1 / 2` の数字幅とbaselineが揃うことを確認する。
3. `◆ ◇ × ↻ ＋ − ！ ：` と全盤面markerを表示し、欠字、豆腐、カラー絵文字、別familyへの意図しないfallbackを0件にする。
4. 発射、配置決定、戦闘記録へ記載、リトライ、撤退の主要buttonで枠外はみ出し、文字接触、重要語の省略を0件にする。
5. WebとUnityを同じ状態・Safe Areaでcaptureし、文字のline数、コード桁位置、主要buttonのblock高を比較する。rasterizer差による1pixelの輪郭差より、改行と情報密度の一致を優先する。
6. Pixel系実機を最低1台、異なるAndroid vendorを最低1台で確認する。端末fontを削除・変更した状態に依存せず、APKだけで同じ字形が出ることを合格条件とする。
7. APK/AAB検査で採用fontとOFLが含まれ、未使用weight、巨大Dynamic atlas、OSから複製したfontが含まれないことを確認する。

検証captureには `font family + upstream revision + source SHA-256 + corpus SHA-256 + TMP atlas setting + app commit SHA` を添える。フォント差し替え後にこの記録なしで「見た目だけ同じ」と判定してはならない。

## 5. 色・材質・盤面の再現

### 5.1 Theme tokens

色は `DBGridTheme` ScriptableObject に集約する。現行 Web の基準値は次のとおり。

| Token | sRGB |
| --- | --- |
| Abyss | `#06131D` |
| Navy | `#0A2635` |
| Teal | `#144B59` |
| Steel | `#71909B` |
| Cyan | `#7CE5DF` |
| Foam | `#E2FFF8` |
| Danger | `#FF8585` |
| Amber | `#E5D78A` |
| Clear / Green | `#60BE9D` |
| Mission Blue | `#9CB7FF` |

Unity Project が Linear color space でも、表の値は sRGB 入力として扱う。比較時に画面キャプチャの色を採取し、シェーダー側で二重ガンマ変換しない。

### 5.2 背景とパネル

- 背景: Abyss、上中央の淡い teal radial glow、4px周期相当のscanline、低コントラストnoise。
- scanline opacity は約0.16、noiseは約0.06。文字の上へ強くかけない。
- パネル: 1px steel border、内側に3px相当の濃色、左accent 3–4px。角丸を強くせず、CIC機器の切り欠き感を保つ。
- ボタン: 上下グラデーション、内側濃色枠、下側の押し込み影。押下時は2px相当下げる。
- `BATTLE START` は Danger 系、通常の主操作は Cyan、確認・戦況報告は Amber。選択不能は彩度を下げても文言を読める濃度を残す。
- 9-slice sprite を使う場合は元画像と border 値を版管理する。可能なら単色 Image + custom material で生成し、解像度依存を減らす。

### 5.3 盤面

盤面はビットマップではなく、`TacticalBoardGraphic : MaskableGraphic` または同等のコード描画を推奨する。Web Canvas と同じ8×8の論理座標から描き、表示解像度とゲーム座標を分離する。

- 海面背景: `#082630`。
- セル: `#0A303A` / `#0D3943` を共有時計の緩い波で交互にする。
- グリッド: Steel 27%程度、最低1物理ピクセル。
- A–H / 1–8 margin: 盤面辺の約7.5%。セル計算は Web の `m = size × .075`, `cell = (size - m × 1.18) / 8` を基準にする。
- 艦影はスクリーンショットから切り抜かず、Web `drawShip()` の幾何形状を移植する。艦種ごとの上部構造物、方向、沈没時alphaを保持する。
- board render と hit test は同じ `BoardViewportTransform` を使い、表示とタップ座標のずれを防ぐ。
- 高DPIでも線がぼけないよう、最低線幅を1物理pixelにクランプする。アンチエイリアスの有無を端末上で比較する。

盤面マークは色だけで区別しない。

| 状態 | 形 |
| --- | --- |
| MISS | 小円＋中心点、Steel |
| ECHO | 中心環＋上下左右の直線腕と矢羽根、Cyan |
| HIT | 8方向の小さな爆発形、Danger |
| SUNK | 同系列だが Amber。結果表示では `SUNK` も併記可能 |
| 重要区画 | 小菱形。被弾時は外側菱形を残す |
| 識別 | 大きい菱形輪郭＋CV/BB等の短いコード |
| CONTACT | 2×2 corner bracket＋破線円、Amber |
| NO CONTACT | 2×2 corner bracket＋走査線＋破線四角、Green |
| 音紋 | 塗りつぶさない同心円、Cyan |
| LKC | 破線菱形＋LKC |

### 5.4 資産所有と解像度

現行ランタイムの盤面、艦影、波、命中、ECHO、SONARは Canvas/CSS の自作コード描画であり、既存ゲームの画像・スプライトを収録していない。音も Web Audio の実行時合成である。`public/og.png` は告知用生成画像で、戦闘UIの部品として使わない。

- Unity 側でもコード描画、所有権を確認したSVG、または本作専用に新規制作した素材だけを使う。
- PNGしか使えない装飾は最大表示寸法の2倍以上を master とし、`@1x/@2x`を書き出す。細線パネルは9-slice化する。
- 盤面、艦影、命中マークを一枚の固定解像度PNGに焼き込まない。
- Import Settings、Pixels Per Unit、filter mode、compression、slice border を `ASSET_MANIFEST.md` に記録する。
- UI線画は Bilinear に頼ってぼかさず、SDF/Vector/高解像度9-sliceを選ぶ。写真系の告知素材とゲーム内UI素材を別フォルダ・別ライセンス記録にする。
- 外部フォント、Unity package、シェーダー、音素材を追加した場合は出典とライセンスを必ず残す。

## 6. 演出タイミングと「人間の呼吸」

演出は `Time.unscaledTime` を使う。ゲーム速度や一時停止の影響で不規則にならず、全音紋は同じ共有 operation clock から位相を得る。各マーク生成時に別々の Animator を開始して同期を失わない。

### 6.1 現行基準

| 演出 | 基準 |
| --- | ---: |
| ターン字幕 | 1.05秒。0–25% fade in、70%まで保持、終了時fade out |
| プレイヤー発射前照準保持 | 0.40秒 |
| プレイヤー多区画着弾間隔 | 0.22秒/区画 |
| プレイヤー攻撃結果保持 | 0.85秒後に次状態評価 |
| 敵照準字幕 | 1.05秒 |
| 敵発射前照準保持 | 0.75秒（SONAR 0.80秒） |
| 敵多区画着弾間隔 | 0.26秒/区画 |
| 敵結果保持 | 0.85秒、その後 Player Review |
| SONAR結果 | 1.45秒。12%で表示完了、78%まで保持 |
| 重要区画識別 | 1.65秒。敵による自軍識別は報告確定まで保持 |
| SEA BAT 潜航警告 | 1.75秒 |
| LOG drawer | 0.18秒、下から18px相当 |
| 被弾shake | 0.28秒、最大5px相当 |
| レーダー sweep | 7.0秒/周 |
| 音紋 | 0.8秒/周期、2本目は周期の42%ずらす |
| ECHO pulse | 約1.57秒/周期 |
| HIT/SUNK pulse | 約0.79秒/周期 |

多区画攻撃は「発射→照準表示→区画ごとの着弾→最終報告→次状態」の順を崩さない。一斉に内部解決して即敵ターンへ送らない。内部では全結果を先に決定してもよいが、Presenter が各 `CombatEvent` を上表の間隔で提示し、最後の報告を読める時間を保証する。

敵攻撃後は自動で自軍ターンへ戻らず `PlayerReview` へ入る。盤面とログを確認し、右下の `FILE DAMAGE REPORT` を押した時点で次の自軍行動へ進む。敵に識別された警告はこの操作まで消さない。

### 6.2 Reduce Motion

`Reduce Motion` が有効な場合も情報を省略しない。

- sweep、点滅、shake、scale bounceを停止。
- ターン字幕、SONAR、識別は静止表示にし、通常の60–70%程度の保持時間を確保。
- 多区画着弾は順序を維持し、間隔だけ0.10–0.14秒へ短縮可能。
- 点滅だけで状態を知らせず、必ず文字と形を残す。

## 7. 入力・タッチ契約

### 7.1 共通

- 主要タッチ領域は最低44×44、Androidでは48×48以上を目標にする。
- 見た目の枠が小さくても raycast hit area は48以上へ拡張する。ただし隣接ボタンの領域を重ねない。
- `EventSystem.pixelDragThreshold` は短辺の約2%を目安に10–18物理pixelへクランプする。
- 発射、配置確定、撤退は `PointerDown` で実行せず `PointerUp` で確定する。ドラッグアウトでキャンセルできること。
- Android Back: LOG/モーダルを閉じる → 照準解除/未確定配置を戻す → それ以外は撤退確認。即アプリ終了にしない。
- 画面回転、アプリ中断、フォーカス喪失時は active pointer を解除する。発射や配置を自動確定しない。

### 7.2 艦隊配置

配置開始時は使用可能な全艦をまずランダムで合法配置する。プレイヤーはその状態から調整する。

1. 盤面上の配置済み艦または艦カードをタップして選択する。
2. 最初のタップは艦を持ち上げてghost表示するだけで、同じタップの release では確定しない。
3. ghostをドラッグするとセル単位で移動する。指を離しても位置候補を保ち、即確定しない。
4. 有効なghostをもう一度軽くタップするか、右下の `配置決定` を押して確定する。
5. 無効位置は赤、確定ボタン無効。盤外へ移動した場合は最寄りの合法originへclampするが、他艦重複は勝手に別位置へ確定しない。
6. `元の位置に戻す` / Escape で持ち上げる前の位置と向きへ戻す。
7. 回転は East → South → West → North → East の90度刻み。重要区画の端も向きに応じて変わる。
8. タッチでは2本指が盤面に入った時に1回だけ回転し、両指が離れるまで再回転しない。200msの解除猶予を持たせる。
9. PCでは回転ボタン、R、右クリックを同じ命令へ割り当てる。

二本指回転は補助操作であり、常に見える回転ボタンを消す理由にしない。艦影だけでなく、選択艦カード、現在方向、重要区画、valid/invalidを同時に表示する。

### 7.3 照準・兵装

- 兵装選択と発射を分ける。兵装ボタンを押しただけでは消費しない。
- 通常砲撃: 未攻撃1区画を選択して、明示的に発射。
- MK-45 II: 2区画。選択済みを再タップで解除。上限後の新規選択は最古候補と入替。
- F-4: 4区画。同じく再タップ解除・明示発射。
- HARPOON: 中心1区画を選び、X型範囲をpreviewして発射。
- 8-INCH STRADDLE: anchor＋方向を選ぶ。同じanchor、兵装再タップ、R、回転ボタンで90度回転。4区画が盤外なら発射不可。
- PASSIVE SONAR: 左上originから2×2をpreview。右端・下端をoriginにできない。MISSIONの指定枠がある場合は合法originだけ受理する。
- `CANCEL` は選択を消すだけでターン・残弾を消費しない。
- 使用不能兵装も理由を確認できる表示を残す。搭載艦なし、搭載艦喪失、LINK不成立、残数0、任務外を区別する。
- mouse hover、keyboard focus、touch down/short hold で `SYSTEM STATUS` を表示する。説明は約2.6秒保持し、発射ボタンを覆わない。

### 7.4 任意の触覚フィードバック

Android hapticsは設定で無効化できる補助情報とする。軽い選択、合法配置確定、無効操作、被弾で別patternを使ってよいが、触覚がなくても全情報が視覚・音・ログで成立しなければならない。

## 8. アクセシビリティ

- 全ボタンに英語コードだけでなく日本語の accessible name を持たせる。
- focus order は上から下、左から右、最後に右下の主操作。表示上の並びと一致させる。
- キーボード/ゲームパッドで盤面カーソル移動、兵装1–6、Enter/Space、Escape、R、Mを操作可能にする。
- Cyan/Amber/Danger/Green の違いだけに依存しない。形、ラベル、左accent、点線/実線を併用する。
- 色覚補助モードでは HIT=`H`、SUNK=`S`、CONTACT=`C`、NO CONTACT=`0` の小ラベルを任意表示できるようにする。
- UI scale 100/115/130%、Reduce Motion、mute、haptics toggleを端末内へ保存する。
- TalkBack では盤面セルを `D-4、未攻撃、選択中` のように読み上げられる代替セマンティック層を用意する。Unityの採用バージョンでAndroid accessibility semanticsが不足する場合は、保守されている専用pluginを選び、未対応のまま完成扱いにしない。
- Canvas上の装飾、scanline、noise、radar sweepはfocus対象にしない。
- 点滅は3Hzを超える強い明滅にしない。現行pulseは低振幅を維持する。

## 9. ゲーム状態と表示の分離

Unity版では MonoBehaviour にルールを散らさず、次の層へ分ける。

```text
Domain (pure C#)
  GameState / BoardState / ArsenalState / MissionState / AIState / XorShift32
        ↓ Command
  Validate → Resolve atomically → CombatEvent[] → next GameState

Presentation
  ScreenPresenter → ViewModel → uGUI/TMP/TacticalBoardGraphic
        ↓
  AnimationQueue consumes CombatEvent[] with unscaled time

Persistence
  versioned SaveData / MissionRecords / Settings
```

- Domain assembly は `UnityEngine`、Canvas、Coroutine、AudioSourceを参照しない。
- `PlayerCommand` は `SelectWeapon` ではなく、確定操作の `Fire`, `Listen`, `CommitPlacement`, `FileDamageReport` 等を表す。hoverやdrawer操作はDomainへ渡さない。
- 1回の複数区画攻撃はDomainで原子的に解決し、その順序付き `CombatEvent[]` をPresentationへ返す。途中のアニメーションで勝敗判定しない。
- Presentationを高速化・skipしても最終GameStateとログは同一にする。
- AIは公開情報だけを入力とし、Viewや敵盤面Graphicを参照しない。
- Webと同じ seed、同じ呼出順で xorshift32 を使う。C#は `unchecked uint` で `x ^= x << 13; x ^= x >> 17; x ^= x << 5;` を実装し、乱数を演出へ流用しない。
- 座標は `{x:0..7,y:0..7}`、表示は `A-1..H-8`。向きは `east, south, west, north` の順序を固定する。
- 保存データはschema versionを持つ。MISSION記録はIDで保存し、配列順序で保存しない。
- 端末時刻はログのUTC（Zulu）表記にだけ使い、判定や乱数seedに暗黙利用しない。MISSION active time はアプリ非表示中に進めない。
- `OnApplicationPause` / `OnApplicationFocus` では状態を保存し、再開時に音・時計・共有animation clockを安全に復帰する。

### コメント規約

コードコメントは見たままの処理ではなく、移植で壊れやすい理由・不変条件を書く。

```csharp
// MISSION success is evaluated before the order-limit defeat.
// A correct final permitted order must remain a victory.

// All wake rings sample this shared operation clock so separate contacts
// never drift into different rhythms after pause/resume.
```

色、時間、文字サイズ、画面名、兵装範囲をmagic number/stringとしてPrefabやMonoBehaviourへ複製しない。`DBGridTheme`, `MotionTiming`, `LayoutProfile`, Localization table, Domain constantsを正本にする。

## 10. 文言・ローカライズ

- 表示文字をPrefabへ直書きせず、stable keyを持つ String Table へ移す。
- 英字は状態コード、日本語は意味・次の操作を伝える本文という現行の二層構造を保つ。
- 通常の自軍ターンを単に `COMMAND` と呼ばない。`FIRE CONTROL / 射撃指揮`、敵は `HOSTILE ACTION / 敵攻撃`、確認は `DAMAGE REPORT / 損害報告`。
- `CONTACT` / `NO CONTACT` は PASSIVE SONAR 専用、ECHOは着弾点の上下左右4方向の生存艦反応であり混同しない。
- Text QA用に「最長候補文字列」tableを作り、ボタン、status、log、mission card、AARへ流して確認する。
- 改行位置を翻訳文字列へ大量に埋め込まず、TMP wrapping と layout containerで制御する。艦コードや座標の途中は改行しない。

## 11. 音・視覚同期の移植メモ

現行音はMP3ではなく Web Audio oscillator 合成である。Unityでは次のどちらかに統一する。

1. 同等の波形・周波数・durationをAudioClipへ手続き生成して再生する。
2. 本作専用に生成して所有権を記録した短いWAVへ焼き、AudioMixerから再生する。

音を端末ごとのビープへ置き換えない。fire/hit/sunk/sonar/turn/victory/defeatの区別を保つ。SURVIVALの脈動間隔は累積喪失0–5艦で260, 240, 220, 200, 185, 170ms。音を鳴らせない場合も、演出待ち時間やゲーム結果を変えない。

## 12. Browser → Unity 比較検証

### 12.1 参照キャプチャ

移植開始直前に固定SHAのWeb版を、ブラウザのdevice scaleを記録して次のviewportで撮影する。

- Phone portrait: 375×667, 390×844, 402×874, 412×915。
- Tablet: 768×1024, 1024×768。
- Compact landscape: 960×540, 1024×600, 1280×720。
- Desktop: 1366×700, 1920×850, 1920×1080。

Unity側は同じSafe Area縦横比でGame Viewと実機を撮影する。ファイル名は次に統一する。

```text
<sha>_<platform>_<width>x<height>_<screen>_<state>.png
例: a1b2c3d_web_402x874_battle_player_aim.png
例: a1b2c3d_unity_402x874_battle_player_aim.png
```

### 12.2 必須状態

1. モード選択（CASUAL / TACTICS / SURVIVAL / MISSION / INITIAL TRAININGの5モード）。
2. MISSION一覧のTACTICAL / ARCHIVE / EXTREME各タブ、およびINITIAL TRAININGへの導線。
3. 艦隊配置の未選択、持ち上げ、valid、invalid、全艦確定。
4. 通常砲撃の未選択、照準、発射可能。
5. MK-45/F-4複数選択、HARPOON、STRADDLE各方向、SONAR 2×2。
6. 自軍／敵情切替とLOG drawer。
7. FRIENDLY ACTION、HOSTILE ACTION、Player Review。
8. CONTACT / NO CONTACT、自軍が敵を識別、敵に識別された状態。
9. MISS、ECHO、HIT、SUNK、重要区画、音紋、LKC、SEA BAT移動。
10. 勝利、敗北、戦後解析、敵配置確認、リトライ、撤退確認。
11. ARCHIVE任務の交戦前日誌照合。
12. 端末回転、アプリ中断→復帰、Safe Area変化、130%文字。

### 12.3 合格基準

- 文字の枠外はみ出し、重なり、欠字、意図しない省略が0件。
- 主要文字は `Micro` 未満へ縮小されていない。
- すべての主要タッチ領域が48×48相当以上、隣接領域が重ならない。
- 盤面は1:1、セル中心のタップ誤差はセル幅の5%以内、端セルも選択可能。
- 主操作はSafe Area内の右下にあり、Androidナビゲーション・カットアウトへ重ならない。
- Phone portraitでは局面進行に不要な微小補正スクロールを要求しない。長文は明示した内部scroll/drawerだけで読む。
- 1920×850と1366×700で盤面と指揮卓が上下へ切れない。
- 色は基準sRGBから大きく逸脱せず、Cyan/Amber/Dangerの意味が維持される。
- 動画比較で、発射から着弾、報告、次局面の順と保持時間が一致する。
- Reduce Motionでも結果情報と操作待ちが消えない。
- 同一seed・同一入力列でWebとUnityの盤面、攻撃結果、AI行動、残弾、勝敗、ログevent種別が一致する。
- 22 MISSIONのcanonical vectorがUnity Domain testsでも全件成功する。

pixel-perfect差分だけを合否にしない。フォントrasterizer差は許容する一方、要素境界は基準画像の±4論理単位、盤面中心・ボタン位置は±2%を目標とし、perceptual diffと目視を併用する。

## 13. Android実機チェックリスト

- [ ] Pixel系の縦持ち・横持ち、gesture navigation、3-button navigation。
- [ ] 360×800級の細い端末と412×915級の長い端末。
- [ ] カメラ穴／notch、丸い画面角、表示カットアウト。
- [ ] タブレット縦横、freeform/multi-window。
- [ ] OS display size標準・大、font size標準・大。
- [ ] 60Hz / 90Hz / 120Hzでanimation速度が同じ。
- [ ] 30fpsまで落ちてもDomain結果とイベント順が変わらない。
- [ ] 一時停止、画面消灯、着信相当、アプリ切替から復帰。
- [ ] Bluetooth/無音/音量0でも進行が停止しない。
- [ ] TalkBackのfocus順と主要操作名。
- [ ] 低電力時にscanline/noiseを落としても文字と盤面が鮮明。
- [ ] APK内fontとlicense、欠字検査、不要な巨大atlasの有無。

## 14. 移植開始時の順序

1. Web版をスマートフォン縦持ちで22 MISSIONと6 INITIAL TRAININGを含め実際に攻略し、未解決UIをWebで先に直す。
2. 基準commitと全参照スクリーンショット／動画を固定する。
3. Domain parity testsを先に移植し、UIなしで同じ入力・結果を確認する。
4. Theme、font atlas、SafeAreaRoot、4つのLayoutProfileを作る。
5. 盤面Graphicと入力座標を移植する。
6. 配置、射撃、Player Review、結果の順にViewModelへ接続する。
7. 演出queueと音を接続する。演出からDomainを呼ばない。
8. Browser/Unity比較表を埋め、実機の縦持ちで文字・指移動・Safe Areaを最終調整する。

この順序なら、見た目を直すたびにルールが変わること、Unityの端末差で文字が崩れること、演出短縮で戦況確認が飛ばされることを避けられる。
