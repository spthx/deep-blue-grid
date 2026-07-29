# Unity移植パッケージ検証記録

- 検証日: 2026-07-30
- 正本コミット: `69f5c566ebfde8cb0eca814fe0f5d8f04b291834`
- Node.js: `v24.14.0`
- npm: `11.9.0`

## 自動検証

| 検証 | 結果 |
|---|---|
| `node docs/unity-port/verify-handoff.mjs` | 合格。正本コード12ファイルの写しがリポジトリ内の原本とバイト単位で一致 |
| `npm test` | 合格。58件中58件成功、失敗0 |
| `npm run build` | 合格。`npm test`の前段でvinext本番ビルド完了 |
| `npm run build:pages` | 合格。GitHub Pages用静的ビルド完了 |
| `git diff --check` | 合格 |
| `canonical-gameplay.json` | Node.jsの`JSON.parse`で構文確認済み |
| `MANIFEST.sha256` | パッケージ本体54ファイルをSHA-256で記録 |

## 画像検証

- `cic-surface-damage-reference.png`: 3840×3920 px。CIC面の6層、9種のボタン状態、用途別テロップ、通常被弾／重要区画被弾／撃沈、盤面10段の描画順を目視確認。
- `images/ui-surfaces/`のPNG3点: 走査線＋ノイズ128×128、盤面材質1536×1536、ボタン状態2960×472。対応SVGのXML構文とPNG変換を確認。
- `web-procedural-visual-reference.png`: 1600×1480 px。目視で艦影、色、MISS、4方向ECHO、HIT、SUNK、VITAL、IDENTIFIED、潜水艦音紋、CONTACT、NO CONTACT、護衛支援範囲を確認。
- `android-portrait-layout-blueprint.png`: 1024×1080 px。412×915 logical px相当の配置・戦闘2状態、safe area、8×8単一盤面、4列×2行兵装、44dp最小操作領域、被害報告確認を確認。
- `images/effects/`の透明PNG5シート: ECHO 8、HIT/SUNK各8、音紋12、レーダーCONTACT/NO CONTACT各12、照準/VITAL/IDENTIFIED各8フレーム。すべて正本数式から生成し、セル寸法・周期・Unity Import条件を`effect-assets.json`で確認。
- `web-overlay-effect-storyboard.png`: 1600×2050 px。ターン切替、味方／敵レーダー、敵識別、自軍重要区画被弾、緊急潜航、被害確認の色・文言・レイヤー・保持条件を目視確認。
- 現在のランタイム画面を撮影したものではない資料は、すべて`IMAGE_MANIFEST.md`で明示的に区別。

## Unity側で完了後に必要な検証

この記録はWeb正本と移植資料の健全性を示すもので、Unity版の合格を示すものではない。Unity担当は`UNITY_CORRECTION_CHECKLIST.md`に従い、EditMode、PlayMode、Android縦持ち実機の各検証結果と修正後スクリーンショットを別途残すこと。
