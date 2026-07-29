# 画像マニフェスト

この一覧は `docs/unity-port/images/` 以下に含まれる全画像の出自、正本性、用途を示します。画像は用途によって信頼度が異なります。見た目の実装判断では、正本コード `canonical-source/Renderer.ts` と `canonical-source/globals.css` が常に最優先です。

## 正本コード由来の描画資料

### `cic-surface-damage-reference.svg` / `.png`

- 出自: 正本コミットの `app/globals.css` と `app/game/Renderer.ts` から、CIC面の積層、全ボタン状態、用途別テロップ、被弾・重要区画・撃沈、盤面10段の描画順を1枚へ再構成。
- 状態: **正本コード由来の視覚契約**。SVGは1920×1960、PNGは3840×3920。実際のランタイム画面を撮影したスクリーンショットではありません。
- 用途: Unity版が「明るいSF HUD」へ逸れないよう、面全体の質感と被弾合成を同時に比較する最優先の閲覧資料。
- 禁止用途: 画像全体をランタイム画面へ貼ること。色、線幅、相対寸法、周期、レイヤー順をUnity UI／Graphic／Animationとして実装してください。

### `ui-surfaces/cic-scanline-noise-tile.svg` / `.png`

- 出自: Web正本の4px走査線と29×31／43×47の低密度ノイズを透明64×64タイルへ再構成。
- 状態: **正本コード由来の面材サンプル**。PNGは2倍密度の128×128。
- 用途: UnityでRepeatまたは同等の手続き描画を構成する際のアルファと密度の照合。

### `ui-surfaces/radar-board-surface-sample.svg` / `.png`

- 出自: Web正本の上部radial glow、切欠きパネル、多重内枠、暗い8×8水面、vignette、7秒radar sweepを一枚へ再構成。
- 状態: **正本コード由来の盤面材質サンプル**。SVGは768×768、PNGは1536×1536。
- 用途: 盤面の明度、steel格子、scanline/noise、枠の抑制、sweepの相対強度を目視比較する資料。
- 禁止用途: Unity盤面を固定背景画像へ置き換えること。

### `ui-surfaces/command-button-state-strip.svg` / `.png`

- 出自: Web正本の通常、選択、押下、無効、確認可能、交戦開始のボタン表面を積層構造ごと再構成。
- 状態: **正本コード由来のボタン材質サンプル**。SVGは1480×236、PNGは2960×472。
- 用途: Gradient、1px外縁、2px内縁、3px下辺、選択glow、押下時の2px移動をUnityの9-sliceまたはprocedural Graphicで再現する基準。
- 禁止用途: 各ボタンへ横長画像をそのまま貼ること。

### `web-procedural-visual-reference.svg`

- 出自: 正本コミット `69f5c566ebfde8cb0eca814fe0f5d8f04b291834` の `Renderer.ts` と `globals.css` にある形状、線、色、マーカー、発光表現を読み取り、資料用の1枚に再構成したSVG。
- 状態: **正本コード由来の基準資料**。実際のブラウザ画面を撮影したスクリーンショットではありません。
- 用途: Unity UI Graphicで艦影、命中、撃沈、ECHO、レーダー、波紋などを再実装するときの形状・色・線幅の照合。
- 注意: このSVG自体をゲームの盤面スプライトとして貼るのではなく、正本コードの描画規則をUnityで再現してください。

### `web-procedural-visual-reference.png`

- 出自: 上記SVGを1600×1480 pxへラスタライズしたもの。
- 状態: **正本コード由来の基準資料**。SVGと同じ内容で、実際のブラウザ画面のスクリーンショットではありません。
- 用途: Unity EditorやAndroid実機と並べて比較するための閲覧用画像。
- 注意: 実装根拠はSVGやPNGのピクセルではなく、`Renderer.ts` と `globals.css` の描画規則です。

## Android縦持ちレイアウト設計図

### `android-portrait-layout-blueprint.svg`

- 出自: 正本の縦持ちレスポンシブ条件とAndroidの安全領域・44dp最小操作領域を、412×915 logical px想定の配置／戦闘2画面へ整理したコード生成SVG。
- 状態: **実装用レイアウト設計図**。実際のWeb版・Unity版ランタイム画面を撮影したスクリーンショットではありません。
- 用途: 単一盤面切替、配置操作群、4列×2行の兵装、右手で押しやすい被害報告確認、上下safe areaをUnity UIへ落とす際の寸法・情報階層の基準。
- 注意: 端末の実safe areaと広告バナー実測値を優先して伸縮させ、設計図を固定座標画像として貼らないでください。

### `android-portrait-layout-blueprint.png`

- 出自: 上記SVGを1024×1080 pxへラスタライズした閲覧用画像。
- 状態: **実装用レイアウト設計図のPNG版**。ランタイム完成画面ではありません。
- 用途: Unity Editor、Android実機、レビュー画面での並列比較。

## 演出専用のコード派生画像

`images/effects/`は、`Renderer.ts`、`DeepBlueGrid.tsx`、`globals.css`の式を透明背景へサンプリングしたUnity向け追補です。AI生成画像ではありません。

### 透明PNGスプライトシート

- `effects/echo-8x1.png`: 4方向ECHOの8フレーム。
- `effects/hit-sunk-pulses-8x2.png`: HITとSUNKの各8フレーム。
- `effects/submarine-wake-shared-phase-12x1.png`: 2重音紋の共通位相12フレーム。
- `effects/radar-contact-no-contact-12x2.png`: CONTACTとNO CONTACTの各12サンプル。
- `effects/target-vital-identification-pulses-8x4.png`: 照準、未被弾重要区画、被弾重要区画、敵識別の各8フレーム。

状態: **正本コード由来の透明PNG**。各セルは256×256 px、Straight Alpha、sRGB。対応SVGも同じディレクトリに保存。

用途: UnityのSprite Mode `Multiple`で切り出すフォールバック、またはprocedural描画の目視照合。

注意:

- Web正本は手続き描画であり、Unityでも同じ数式を使う方法が第一選択です。
- 特にCONTACTレーダーは3種類の異なる周期を重ねるため、有限枚のPNGを単純ループしても完全な連続一致にはなりません。
- 潜水艦音紋は各マークに個別Animatorを持たせず、盤面全体で同じフレームを使います。
- 識別コード`CV/BB/CA/DD/DE/SS/SSX`はシートへ焼き込まず、動的文字として別レイヤーで表示します。
- 正確な行、周期、秒/フレーム、Unity Import設定は`effects/effect-assets.json`と`effects/README.md`を参照してください。

### `effects/web-overlay-effect-storyboard.svg` / `.png`

- 出自: ターン切替、味方／敵レーダー、識別、重要区画被弾、緊急潜航、被害確認を正本CSSと文言から再構成。
- 状態: **演出ストーリーボード**。ランタイムスクリーンショットでも、固定表示する1枚画像でもありません。
- 用途: Unity UIのレイヤー順、警戒色、文字階層、自動消去時間、確認まで保持する警告、右寄せ確認ボタンを照合。
- 禁止用途: この画像全体を画面へ貼ること。Unity UI、Text、Shader、Animationとして組み直してください。

## Web版の旧画面・履歴資料

以下は過去時点のスクリーンショットです。全体の密度、盤面サイズ、情報階層を理解する補助には使えますが、現在の文言、配置、ルール、表示条件の正本ではありません。

### `historical/web-mobile-390x844-pre-polish.png`

- 出自: UI仕上げ前のWeb版を390×844 pxの縦画面で表示した履歴スクリーンショット。
- 状態: **履歴資料のみ**。
- 用途: スマートフォン縦持ち時の情報密度と盤面優先度の参考。
- 禁止用途: 現在のボタン配置、文言、タッチ寸法、情報公開条件の正本扱い。

### `historical/web-1280x720-pre-polish.png`

- 出自: UI仕上げ前のWeb版を1280×720 pxで表示した履歴スクリーンショット。
- 状態: **履歴資料のみ**。
- 用途: 横長画面での盤面とサイド操作領域の関係を理解する補助。
- 禁止用途: Android縦持ちの完成レイアウトや現在のルールを決める根拠。

### `historical/web-1920x1080-pre-polish.png`

- 出自: UI仕上げ前のWeb版を1920×1080 pxで表示した履歴スクリーンショット。
- 状態: **履歴資料のみ**。
- 用途: フルHD時の全体構成、余白、操作群の分離の参考。
- 禁止用途: 現在のレスポンシブ寸法や文言をそのまま転用すること。

### `historical/web-mode-select-sites-snapshot-pre-v32.png`

- 出自: Sites上の旧スナップショットから取得したモード選択画面。
- 状態: **旧版スナップショット**。正本コミットより古い表示を含みます。
- 用途: モード選択画面の世界観、カード構成、色調を確認する補助。
- 注意: `IMPORTANT SECTION`など古い用語が残っています。現在の文言や仕様を決める根拠にしないでください。

## Unity版の修正前比較資料

### `unity-before/unity-pixel3-before-correction.png`

- 出自: 既存Unity版をPixel 3相当の縦持ち画面で表示した、修正着手前のスクリーンショット。
- 状態: **不一致を確認するための比較用ベースライン**。正しい完成見本ではありません。
- 用途: 修正前後の比較、過密な配置、ボタン寸法、艦影、用語、余白、画面下端の問題を追跡するため。
- 注意: 高密度SF艦スプライト、表示情報、独自演出など、Web正本と異なる要素を含みます。これへ見た目を合わせてはいけません。

## 世界観・共有カード専用

### `web-og-world-reference.png`

- 出自: 正本リポジトリの `public/og.png` の複製。
- 状態: **OG／ソーシャル共有画像**。ゲーム実行画面の正本素材ではありません。
- 用途: タイトルの世界観、配色、外部共有カードの参考。
- 禁止用途: 盤面背景、艦影、UI部品、エフェクトのランタイム素材としての使用。

## ランタイム素材について

このWeb正本には、ゲーム内で読み込む艦スプライト、エフェクト画像、音声ファイル、同梱フォントファイルは存在しません。

- 艦影、盤面マーカー、ECHO、レーダー、波紋などは `Renderer.ts` がCanvasへ手続き的に描画します。
- 枠、背景模様、色、文字サイズ、レイアウトは `globals.css` が生成します。
- 効果音と環境音は `AudioManager.ts` がWeb Audio APIの発振器とゲインから実行時に合成します。MP3、WAV、OGG等の音声素材はありません。
- フォントは `"Courier New", "Yu Gothic UI", monospace` のシステムフォールバックです。TTF、OTF、WOFF等の同梱フォントはありません。
- `public/og.png` はメタデータ用の共有画像であり、ゲーム画面内では使いません。

したがってUnity版では、既存の高密度艦艇アトラスや独自音源を「正本素材」とみなさず、可能な限り `Renderer.ts` と `AudioManager.ts` の手続き表現を移植してください。Android端末差を避けるためフォントを同梱する場合も、字形・幅・可読性を上記スタックへ近づけた上で、Unity側の配布ライセンスを別途確認してください。
