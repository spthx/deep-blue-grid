# DEEP BLUE GRID Unity / Android縦持ち移植仕様書

## 0. 文書情報

- 対象: Unity Android版 `D:\Desktop\UnityProject\DeepBlueGrid`
- 正本: Web版 `https://github.com/spthx/deep-blue-grid`
- 正本コミット: `69f5c566ebfde8cb0eca814fe0f5d8f04b291834`
- 作成日: 2026-07-29
- 主対象: Androidスマートフォン縦持ち
- 基準端末:
  - 実機確認端末: Pixel 3、1080×2160
  - CSS比較基準: 402×874 logical px
- 目的: Unity独自の解釈を増やさず、Web正本のルール、情報量、画面遷移、CIC表現、演出、音を可能な限り一致させる。

本パッケージでは、次の順番で仕様を優先する。

1. `canonical-source/game-rules.test.ts`
2. `canonical-gameplay.json`
3. `canonical-source/constants.ts`, `Campaign.ts`, `engine.ts`, `EnemyAI.ts`, `SubmarineWake.ts`
4. `canonical-source/DeepBlueGrid.tsx`, `Renderer.ts`, `AudioManager.ts`, `globals.css`
5. 本文書
6. `images/web-procedural-visual-reference.png`
7. `images/android-portrait-layout-blueprint.png`
8. `images/effects/web-overlay-effect-storyboard.png`
9. `images/effects/README.md`
10. `images/historical/` 以下の旧画面

ビジュアル資料の正本性と用途は`IMAGE_MANIFEST.md`に従う。`images/historical/`は世界観の補助資料であり、現在の文言・配置の正本ではない。

---

## 1. 移植方針

### 1.1 必須

- Androidのゲーム画面は縦持ち専用とする。
- 8×8盤面、艦隊編成、兵装、AI、情報秘匿、ターン、ログ、結果判定をWeb版と一致させる。
- 盤面の艦影と全マーカーは、`Renderer.ts` の簡潔な上面CIC記号をUnity UI Graphicへ移植する。
- 画像生成された高密度SF艦艇を、盤面上の正本艦影として使用しない。
- 味方盤と敵盤はスマートフォン縦画面で同時表示せず、状態に応じて1枚だけ表示する。
- 主要操作を行うための微小スクロールを要求しない。
- タップ領域は最低44dp、主要確認ボタンは最低56dpを確保する。

### 1.2 非目標

次はWeb正本にないため、正確な移植では追加しない。

- 3D艦船
- 写真調・高密度の艦艇スプライト
- 砲弾・ミサイルの飛翔軌跡
- 爆発・煙・水柱の画像パーティクル
- 全面赤フラッシュ、カメラズーム
- 照準推薦、終盤ヒント、最適セル表示
- 隠し配置を読むAI
- AudioClipを使った独自BGMや環境音
- 独自のCOMMAND RATING / SECTOR SECURED

---

## 2. 画面構成と状態遷移

## 2.1 画面一覧

1. OPERATION MODE
2. FLEET DEPLOYMENT
3. AWAITING ORDERS
4. TARGET DESIGNATION
5. READY TO ENGAGE
6. ENGAGING
7. HOSTILE ACTION
8. DAMAGE ASSESSMENT
9. MISSION ACCOMPLISHED
10. MISSION ABORTED
11. OPERATION COMPLETE
12. CIC戦闘経過記録
13. TACTICAL PLOT REVIEW

状態名は固定の`COMMAND`を使わず、現在の行動段階を表示する。

| 状態 | 英語 | 日本語 |
|---|---|---|
| 配置 | FLEET DEPLOYMENT | 艦隊配置 |
| 味方待機 | AWAITING ORDERS | 指令待機 |
| 目標選択 | TARGET DESIGNATION | 目標指示 |
| 発射可能 | READY TO ENGAGE | 攻撃準備完了 |
| 攻撃処理 | ENGAGING | 攻撃実行中 |
| 敵行動 | HOSTILE ACTION | 敵攻撃 |
| 被害確認 | DAMAGE ASSESSMENT | 被害確認 |
| 海域勝利 | MISSION ACCOMPLISHED | 作戦目標達成 |
| 敗北 | MISSION ABORTED | 作戦中止 |
| 全海域完了 | OPERATION COMPLETE | 全作戦完了 |

## 2.2 OPERATION MODE

- CASUAL、TACTICS、SURVIVALの3カードを縦1列で表示する。
- 402×874相当で3カードとVITAL COMPARTMENT説明の見出しまで収める。
- 詳細説明は折り畳み可能。
- ボタン選択後はFLEET DEPLOYMENTへ移る。

モード:

- CASUAL: 自軍先攻、敵艦種と損傷カードを公開
- TACTICS: 敵先攻、重要区画識別、敵艦種・損傷を秘匿
- SURVIVAL: TACTICSルール＋艦隊損耗を全6海域へ持ち越し

## 2.3 FLEET DEPLOYMENT

- ステージ開始時点で、使用可能な全艦をランダム合法配置済みにする。
- 盤面艦または艦カードをタップすると、その艦を配置編集状態へする。
- ドラッグで移動。
- 回転ボタン、右クリック、R、二本指タッチで90度回転。
- 回転順は EAST → SOUTH → WEST → NORTH → EAST。
- 編集中:
  - 回転
  - 配置決定
  - 元位置へ戻す
- 通常:
  - CLEAR
  - RANDOM
  - 交戦開始 / COMMENCE ENGAGEMENT
- 盤面上の艦を初めて拾うタップでは確定しない。選択後、移動していない艦影を再タップして離した場合だけ配置確定する。
- 全艦配置済みのときだけ交戦開始を有効化する。
- 交戦開始は赤系の主要CTAとする。

## 2.4 戦闘中

縦画面では以下だけを同時表示する。

1. 最小ヘッダー
2. ステージ進行
3. 現在状態の短い指示
4. 自軍戦術図 / 敵情図の切替
5. 現在必要な1枚の8×8盤
6. 艦隊カード
7. 選択兵装の短い説明
8. 4列×2行の武装・CANCEL・FIRE

武装は次の8枠。

| 位置 | 内容 |
|---:|---|
| 1 | 通常砲撃 |
| 2 | F-4 PHANTOM |
| 3 | HARPOON |
| 4 | SEA SPARROW |
| 5 | MK-45 II |
| 6 | SPS-10 RADAR |
| 7 | CANCEL |
| 8 | FIRE / SCAN |

存在しない艦の搭載兵装は「押せるように見せてから拒否」せず、明確な使用不能状態にする。

## 2.5 DAMAGE ASSESSMENT

- 敵攻撃の全着弾後、自軍戦術図へ切り替えて停止する。
- 自軍重要区画への命中警告は、確認完了まで消さない。
- 敵兵装、被弾艦名、コード、座標、撃沈、喪失能力を表示する。
- 確認完了ボタンは画面右側寄せ、最低56dp。
- 確認後:
  - 敵情図へ切り替える
  - 選択兵装を通常砲撃へ戻す
  - 選択座標を全消去
  - AWAITING ORDERSへ移る

## 2.6 CIC戦闘経過記録

- 自軍戦術図 / 敵情図の切替欄にLOGボタンを置く。
- 常時の短いログ欄は内部スクロール。
- LOG画面は全履歴を表示し、ステージ・リトライで消去しない。
- 最新行を上に表示。
- 各行は端末時刻をUTC変換した`HHMMZ`、秒なし。
- 区切り行は太字・色変更。

## 2.7 結果

勝利:

- MISSION ACCOMPLISHED
- 次海域
- 戦果、損傷、命中率、特殊兵装使用数
- 全作戦ログ

敗北:

- MISSION ABORTED
- RETRY STAGE
- WITHDRAW
- COMMAND ASSESSMENT / 指揮所見
- POST-ENGAGEMENT INTELLIGENCE
- TACTICAL PLOT REVIEWで敵全配置確認

SURVIVALのリトライは、その海域へ入った時点の生存艦隊で再開する。

---

## 3. 盤面と座標

- 8×8。
- 内部原点は左上`(0,0)`。
- 上辺に1～8、左辺にA～H。
- 表示座標は`A-1`。
- 攻撃済みセルへの再攻撃は`ALREADY`で無効。
- 艦は盤外、重複、同一艦二重配置不可。
- 通常艦は占有区画数と耐久が同じ。
- 全区画へ1回ずつ命中すると撃沈。
- 撃沈時は構成区画すべてをSUNK表示へ変更する。

---

## 4. 艦艇

| 艦 | コード | 耐久 | 東西時占有 | 兵装 | 重要区画 |
|---|---|---:|---|---|---|
| 空母 | CV-08 | 8 | 4×2 | F-4 PHANTOM | `(2,0)` |
| 戦艦 | BB-05 | 5 | 5×1 | HARPOON | `(2,0)` |
| 巡洋艦 | CA-04 | 4 | 4×1 | SEA SPARROW | `(2,0)` |
| 駆逐艦 | DD-03 | 3 | 3×1 | MK-45 II | `(1,0)` |
| 護衛艦 | DE-02 | 2 | 2×1 | なし | `(1,0)` |
| 潜水艦 | SS-01 | 1 | 1×1 | SPS-10 RADAR | `(0,0)` |
| 特殊潜航艦 | SSX-00 | 2 | 1×1 | なし | `(0,0)` |

SSX-00は占有1区画、耐久2の例外である。

- 1回目の命中: HIT。未攻撃かつ非重複の別1区画へ緊急潜航。
- 旧命中座標に最終接触位置を残す。
- 識別マークを新しい秘密位置へ移動してはいけない。
- 2回目の命中: SUNK。

重要区画の回転は`engine.ts / criticalCoordFor()`を移植する。

---

## 5. ステージ

| Stage | 名称 | 編成 | 基礎AI |
|---:|---|---|---:|
| 1 | FIRST CONTACT | BB, DD, SS | 0.82 |
| 2 | ESCORT LINE | BB, DD, DE, SS | 0.92 |
| 3 | CRUISER GAP | BB, CA, DD, DE, SS | 1.00 |
| 4 | CROSS FIRE | BB, CA, DD, DE, SS | 1.05 |
| 5 | CARRIER SCREEN | CV, BB, CA, DD, DE, SS | 1.10 |
| 6 | DEEP BLUE GRID | CV, BB, CA, DD, DE, SS | 1.16 |

現在の正本では:

- Stage 4は存在する。
- SURVIVAL Stage 6の敵に護衛艦は存在する。
- これらを変更する相談はあったが、Web正本へ未実装のためUnityだけで先行変更しない。

## 5.1 実効AI

| Stage | CASUAL | TACTICS | SURVIVAL |
|---:|---:|---:|---:|
| 1 | 1.1316 | 1.394 | 1.394 |
| 2 | 1.2696 | 1.564 | 1.564 |
| 3 | 1.38 | 1.70 | 1.70 |
| 4 | 1.449 | 1.785 | 1.785 |
| 5 | 1.518 | 1.819 | 1.819 |
| 6 | 1.6008 | 1.972 | 1.785 |

SURVIVAL Stage 6は評価上位3点から乱択。他は通常、最上位1点。

---

## 6. 情報公開

## 6.1 CASUAL

- 自軍先攻。
- 敵艦カードに艦種、コード、正確な耐久、被弾数を表示。
- 未撃沈の敵艦影、位置、向きは盤面へ表示しない。
- 撃沈後だけ全艦影を公開。
- 重要区画・識別処理は無効。

「情報公開」は敵配置の公開ではない。

## 6.2 TACTICS / SURVIVAL

- 敵先攻。
- 敵カード順を各ステージ開始時にシャッフル。
- 未識別: `UNKNOWN CONTACT / nn`。
- 耐久欄は実サイズと無関係な5本固定ダミー表示。
- 重要区画命中で艦名とコードだけ識別。
- 識別後も向き、残耐久、未命中区画を隠す。
- 撃沈後に艦種と全艦影を公開。
- 自軍重要区画は常時表示。
- 敵AIも同じ公開情報だけで判断する。

---

## 7. 兵装

| 兵装 | 搭載艦 | 効果 | 基本 | 最大 |
|---|---|---|---:|---:|
| 通常砲撃 | 共通 | 未攻撃1区画 | ∞ | ∞ |
| F-4 PHANTOM | 空母 | 異なる任意4区画 | 1 | 2 |
| HARPOON | 戦艦 | 中心＋3×3四隅、X字5区画 | 2 | 3 |
| SEA SPARROW | 巡洋艦 | 左上指定の2×2 | 1 | 1 |
| MK-45 II | 駆逐艦 | 異なる任意2区画 | 1 | 1 |
| SPS-10 RADAR | 潜水艦 | 左上指定の2×2索敵、無損害 | 2 | 2 |

- 搭載艦が沈めば残数があっても使用不能。
- 敵も自軍と同じ残数。
- F-4 / MK-45は異なる未攻撃セルのみ選択。
- HARPOON / SEA SPARROWは盤外を切り捨てる。
- 既攻撃セルは実攻撃対象から除く。
- プレイヤーのレーダー左上指定は常に2×2が盤内へ収まるセルだけ。
- レーダーは行動数と特殊兵装使用数へ数えるが、射撃数・命中率へ数えない。

## 7.1 護衛リンク

成立条件:

- 生存護衛艦の2区画すべてが、
- 生存対象艦のいずれかの区画へ、
- 上下左右、マンハッタン距離1で接する。

斜めは無効。単一の護衛艦区画だけ接しても無効。

効果:

- 空母: F-4 1→2
- 戦艦: HARPOON 2→3
- 1隻の護衛艦で両方へ同時リンク可能。

リンク中に追加分を使った後でリンクが切れた場合、使用済み数を低い上限へ再適用する。追加弾が復活してはいけない。

---

## 8. ECHO

- 空セルへの攻撃だけで判定。
- 着弾点の上下左右4区画に生存艦がいればECHO。
- 斜めは無効。
- 艦種、方向、距離を開示しない。
- AIも同じ4方向を使用。
- 表示は中央環＋上下左右4本の直線＋矢羽根。

---

## 9. レーダー

- 2×2。
- 既攻撃セルは走査候補から除外。
- 候補内に生存艦の未命中区画が1つ以上: CONTACT。
- その他: NO CONTACT。
- 反応数、正確なセル、艦種を開示しない。
- ダメージなし。

CONTACT:

- amberの4隅L字ブラケット。
- 中央に黄色い破線円と薄い外円。
- 候補セルが後からHIT/SUNKになると表示を解消。

NO CONTACT:

- green/cyanの4隅L字ブラケット。
- 破線矩形と水平走査線。
- 永続表示。

敵CONTACT:

- `HOSTILE RADAR CONTACT`
- `FLEET DETECTED`
- danger表示

敵NO CONTACT:

- `ENEMY SPS-10 SCAN`
- `NO TRACK`

---

## 10. 潜水艦音紋

通常:

- その陣営の生存艦が潜水艦1隻だけになった後、
- その潜水艦側が1行動するたび、
- 周囲8区画の合法候補から1区画へ音紋を追加。

除外:

- 潜水艦本体
- すべての艦影占有セル
- MISS / ECHO / HIT / SUNK
- 未解消レーダー表示
- 既存音紋

候補がなければ音紋なし。

- 古い音紋は消さない。
- 全音紋は同じグローバル位相で動かす。
- 2本のリング。
- `p=(timeSeconds×1.25)%1`。
- 2本目の位相差`.42`。
- 半径`.13cell→.47cell`。
- alpha`.65×(1-q)`。

SURVIVAL Stage 5:

- SS-01が生存中はSS-01が毎回通常砲撃。
- SS-01撃沈後、SSX-00はHOLD→FIRE→HOLD→FIRE。
- HOLDは発砲なし、音紋なし。
- FIRE後だけSSX-00周囲へ音紋。

---

## 11. AI

状態:

- HUNT
- TARGET
- SEARCH

判断順:

1. レーダー
2. F-4
3. SEA SPARROW
4. HARPOON
5. MK-45 II
6. 通常砲撃

AIが使用できる情報:

- 自身の搭載艦・残兵装
- 自身が得たMISS / ECHO / HIT / SUNK
- レーダーCONTACT / NO CONTACT
- 公開音紋
- 重要区画識別
- 撃沈公開情報
- シナリオ上の相手艦隊編成

AIへプレイヤーBoardの隠し艦位置を渡してはいけない。

TACTICSでだけ重要区画識別を配置推論へ使用する。CASUALは識別処理を使用しない。

禁止:

- 盤面の実艦位置を直接読む
- 残り耐久を直接読む
- 未公開の重要区画を直接読む
- 独自TacticalAdvisorでプレイヤーへ推奨セルを表示

---

## 12. 描画

正本は`canonical-source/Renderer.ts`。

### 12.1 共通

- Canvas相当の正方形。
- `imageSmoothing=false`相当の硬い記号表現。
- 詳細塗装、立体影、パースを付けない。
- 通常船体`#71909b`, alpha `.88`。
- 上部構造`#b0ced0`。
- 沈没船体`#584e51`, alpha `.55`。
- 有効配置ゴースト`#7ce5df`。
- 無効配置ゴースト`#ff8585`。
- 被弾点は`#ff8585`、半径`.12cell`。

艦影の形状は`images/web-procedural-visual-reference.png`を参照し、数値は`Renderer.ts / drawShip()`を移植する。

### 12.2 マーカー

MISS:

- steelの外円、中央小正方形。

ECHO:

- cyan。
- 中央環、上下左右4腕、矢羽根。
- alpha `.55+.3sin(t×4)`。

HIT / SUNK:

- 8頂点星形。
- HIT danger、SUNK amber。
- alpha `.7+.25sin(t×8)`。

VITAL:

- 45度回転正方形。
- 未被弾cyan塗り。
- 被弾後は大きいdanger輪郭。

IDENTIFIED:

- amber菱形。
- 上にCV / BB / CA / DD / DE / SS / SSX。

### 12.3 画面質感

- 背景`#06131d`。
- パネル`#0a2635`。
- 水平scanline、低いノイズ、淡いradar sweep。
- フォント指定:
  - Web: `Courier New`, `Yu Gothic UI`, `monospace`
  - Unity: ライセンス確認済みの等幅欧文＋日本語ゴシックを同等比率で用意
- カットコーナー風パネル。
- 過剰なグローを避け、文字可読性を優先。

---

## 13. 演出時間

Unity向けの透明連番画像と画面演出構成は`images/effects/`に収録する。`effect-assets.json`を切り出し・再生速度の機械可読正本、`web-overlay-effect-storyboard.png`をレイヤー・色・文言・保持条件の参照とする。ただし、有限枚で完全な連続性を表せないレーダーなどは、以下の数式をUnity側で再現する。

| 演出 | 時間 |
|---|---:|
| ターン全面表示 | 1050ms |
| 敵照準 | 750ms |
| 敵レーダー照準 | 800ms |
| 敵1着弾 | 260ms |
| プレイヤー発射前 | 400ms |
| プレイヤー1着弾 | 220ms |
| レーダー結果 | 1450ms |
| 行動後 | 850ms |
| 敵識別テロップ | 1650ms |
| 緊急潜航 | 1750ms |
| 画面揺れ | 280ms |
| 武装タッチ説明保持 | 2600ms |

画面揺れは毎回基準座標から計算し、終了時に必ず元位置へ戻す。`anchoredPosition +=`の累積で盤面をドリフトさせない。

撃沈時:

1. HIT音
2. SUNK音を重ねる
3. 全構成区画をSUNK表示

---

## 14. 音

正本は`canonical-source/AudioManager.ts`。

- 音声ファイルなし。
- Oscillator相当で実行時合成。
- attackなし。
- 指定gainから`.0001`へ指数減衰。
- reverb、filter、compressor、panなし。

主なキュー:

| 音 | 波形 | 周波数 | 長さ | gain |
|---|---|---|---:|---:|
| カーソル | square | 720→640 | 25ms | .018 |
| 決定 | square | 520→700 | 60ms | .035 |
| キャンセル | saw | 220→140 | 80ms | .025 |
| 発射 | saw | 110→530 | 240ms | .06 |
| HIT低音 | square | 80→40 | 340ms | .07 |
| HIT高音 | saw | 520→220 | 100ms | .035 |

完全値は`canonical-gameplay.json / audio`を使用する。

BGM:

- square。
- `[55,55,73,55,82,73,55,49] Hz`。
- 260ms間隔。
- 各120ms。
- gain`.012`。

Unity独自の8秒ambientへ置き換えない。

---

## 15. ログ

- 40行制限なし。
- ステージ移行、リトライで消去しない。
- モード開始だけ新しい作戦ログ。
- 最新行を上に表示。
- `HHMMZ`、秒なし。

必須区切り:

- `＝ MODE / 作戦行動開始 ＝`
- `＝ STAGE n / 交戦開始 ＝`
- `＝ STAGE n / 作戦目標達成 ＝`
- `＝ STAGE n / 交戦終了・作戦中止 ＝`
- `＝ REARM & REPAIR / 修復・再補給 ＝`

自軍被害:

- 敵兵装
- 艦名
- コード
- 座標
- 重要区画
- 撃沈
- 失った能力

---

## 16. 縦持ちレイアウト

配置と戦闘の情報階層・safe area・最小タップ領域は`images/android-portrait-layout-blueprint.png`を併せて参照する。この画像は完成画面のスクリーンショットではなく、端末差へ対応するための伸縮可能な設計図である。

Unity Canvas基準:

- Reference Resolution: 1080×2160
- Screen Match Mode: Match Width Or Height
- Match: 0.5を起点に実機検証
- Safe Area対応
- Auto Rotation:
  - Portrait: ON
  - Portrait Upside Down: 任意
  - Landscape Left: OFF
  - Landscape Right: OFF

画面高さの配分は固定pxではなく、次の優先順位で可変にする。

1. Safe Area
2. 盤面を最大正方形
3. 現在操作に必要な指揮卓
4. 艦隊カード
5. 状態説明
6. 装飾情報

不足時に先に縮めるもの:

- 重複説明
- mission subtitle
- decorative kicker
- 常時ログの表示行数

縮めてはいけないもの:

- 盤面セルのタップ精度
- FIRE / SCAN / 確認完了
- 艦配置回転・決定
- 海域切替

広告を使う場合:

- 固定11.5%空白を予約しない。
- 実バナー高さを取得してsafe-areaへ加算。
- 広告未ロード時は空白を解放。
- 主要操作を広告直上へ密着させない。

---

## 17. 現行Unity版からの必須修正

P0:

1. CASUAL敵盤の未撃沈艦影を隠す。
2. `TacticalAdvisor.Recommend()`と推奨セル描画を削除。
3. 戦艦・護衛艦のFIRE CONTROL LINK、HARPOON 2→3を敵味方双方へ実装。
4. SSXの識別座標を旧接触点へ保持し、新位置を漏らさない。
5. TACTICS/SURVIVALのCONTACT番号順をステージ開始時にシャッフル。
6. 自軍VITAL被弾警告をDAMAGE ASSESSMENT確認まで保持。
7. Androidを縦持ち専用へ変更。

P1:

1. ImageGen艦艇アトラスを盤面正本から外し、procedural艦影へ置換。
2. 通常砲撃のgeneric craftバッジを砲弾・照準記号へ置換。
3. 配置5ボタン横1列を廃止し、回転/決定、CLEAR/RANDOMを2列化。
4. DAMAGE ASSESSMENTの確認ボタンを幅広右寄せ。
5. 結果画面をScrollRect化。
6. Web最新用語へ統一。
7. BoardShakeの累積ドリフトを修正。
8. ECHO/HIT/SUNKをWebと同じpulseへ。
9. Wake速度を`1.25`へ一致。
10. AudioManagerの周波数・長さを移植。

詳細は`UNITY_CORRECTION_CHECKLIST.md`。

---

## 18. 受け入れ条件

### ルール

- Webの58テストと同等のUnity EditModeテストを用意。
- 同一seedで合法配置。
- 4方向ECHO。
- 1セル耐久2のSSX。
- 音紋の重なり除外。
- HARPOONリンク。
- TACTICS識別後も残耐久非公開。
- 敵AIへ隠しBoardを渡さない。

### UI

- Pixel 3縦でモード選択、配置、戦闘、被害確認、ログ、結果を確認。
- 主要操作のための1～40px程度の微小スクロールが発生しない。
- 44dp未満の主要タップ対象なし。
- 文字の縦1文字折返しなし。
- 広告の有無で操作ボタンが欠けない。

### 見た目

- 艦影が`web-procedural-visual-reference.png`と同じ記号的輪郭。
- MISS/ECHO/HIT/SUNK/VITAL/IDENTIFIED/WAKE/RADARを個別確認。
- 全音紋が同位相。
- 画面揺れ後に盤面位置が完全復帰。

### 状態

- TACTICS/SURVIVAL敵先攻。
- 敵攻撃後DAMAGE ASSESSMENTで停止。
- 確認後、通常砲撃選択・敵情図へ復帰。
- 敗北時リトライとWITHDRAW。
- SURVIVALリトライが進入艦隊を復元。

---

## 19. Unity実装への推奨マッピング

| Web正本 | Unity |
|---|---|
| `constants.ts` | `NavalData` immutable definitions |
| `Campaign.ts` | campaign/mode service |
| `engine.ts / Board` | `NavalBoard` |
| `engine.ts / Arsenal` | `Arsenal` |
| `EnemyAI.ts` | `EnemyCommander` |
| `SubmarineWake.ts` | `SubmarineWake` |
| `Renderer.ts` | `GridBoardGraphic` procedural vertices |
| `DeepBlueGrid.tsx` | explicit battle state machine |
| `AudioManager.ts` | runtime oscillator synth |
| `globals.css` | theme ScriptableObject + UI layout prefabs |
| Web tests | Unity EditMode rule tests + PlayMode UI tests |

WebロジックをC#へ写す際は、見た目を合わせる前に回帰テストを移植する。既存Unity実装の挙動を基準にWebルールを変えてはならない。
