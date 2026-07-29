# DEEP BLUE GRID Unity / Android 移植パッケージ

このフォルダは、Web版を正本として Unity / Android 縦持ち版を修正するための引き継ぎ一式です。

- 正本リポジトリ: `https://github.com/spthx/deep-blue-grid`
- 正本コミット: `69f5c566ebfde8cb0eca814fe0f5d8f04b291834`
- 主対象: Androidスマートフォン縦持ち
- 方針: Unity独自の解釈を増やさず、ルール、情報公開、画面遷移、描画、演出、音を正本へ合わせる

## 最初に読む順番

Unity版の担当タスクは、実装に着手する前に次の順序で確認してください。

1. `canonical-source/game-rules.test.ts`
2. `canonical-gameplay.json`
3. `canonical-source/constants.ts`
4. `canonical-source/Campaign.ts`
5. `canonical-source/engine.ts`
6. `canonical-source/EnemyAI.ts`
7. `canonical-source/SubmarineWake.ts`
8. `canonical-source/DeepBlueGrid.tsx`
9. `canonical-source/Renderer.ts`
10. `canonical-source/AudioManager.ts`
11. `canonical-source/globals.css`
12. `DEEP_BLUE_GRID_Unity_Android移植仕様書.md`
13. `UNITY_CORRECTION_CHECKLIST.md`
14. `VALIDATION_REPORT.md`
15. `IMAGE_MANIFEST.md`
16. `images/web-procedural-visual-reference.png`
17. `images/android-portrait-layout-blueprint.png`

仕様が食い違う場合は、上にある項目を優先します。テストと正本コードが最優先であり、スクリーンショットや既存Unity実装を根拠にルールを変更してはいけません。

## パッケージ内容

- `canonical-gameplay.json`
  艦、ステージ、モード、AI、武装、支援、レーダー、ECHO、潜水艦波紋、時間、描画、音、ログを機械可読形式で整理した仕様です。
- `DEEP_BLUE_GRID_Unity_Android移植仕様書.md`
  Android縦持ちを前提に、正本の挙動とUnity側の実装条件をまとめた本文です。
- `UNITY_CORRECTION_CHECKLIST.md`
  Unity版の既知の相違点、修正優先度、合格条件です。
- `VALIDATION_REPORT.md`
  正本の回帰テスト、ビルド、JSON、画像資料の検証結果です。
- `canonical-source/`
  上記コミットから固定した正本コードと回帰テストの写しです。
- `images/`
  正本コードから起こした描画資料、旧Web画面、修正前Unity画面、OG画像です。用途と正本性は `IMAGE_MANIFEST.md` を参照してください。
- `verify-handoff.mjs`
  JSONの主要不変条件と、`canonical-source/`が正本コードとバイト単位で一致することを検証します。
- `MANIFEST.sha256`
  パッケージ内29ファイルのSHA-256一覧です。ZIP展開後の破損確認に使います。

## 現在の重要な確定事項

- 盤面は8×8、ECHOは命中しなかった地点の上下左右4方向だけを判定します。斜めは含みません。
- CASUALでも、未撃沈の敵艦位置や艦影は表示しません。
- TACTICSとSURVIVALでは敵艦の情報を秘匿し、重要区画命中時も艦名・艦種だけを識別します。方向、残耐久、未命中区画は開示しません。
- 護衛艦が空母へ隣接するとF-4が1回増え、戦艦へ隣接するとHARPOONが1回増えます。両方への同時支援は有効です。
- SURVIVALのステージ4は現在も存在します。
- SURVIVALのステージ6の敵編成には現在も護衛艦が含まれます。
- SURVIVALステージ5は通常潜水艦と特殊潜水艦SSX-00の専用戦です。SSX-00は最初の命中後に再配置されます。
- 潜水艦波紋は、潜水艦以外の生存艦がいない状態で、その潜水艦が行動した後に発生します。艦、着弾表示、レーダー表示、既存波紋には重ねません。
- `TacticalAdvisor`のような推奨攻撃地点の提示は正本にありません。Unity版へ残しません。
- Androidゲーム画面は縦持ち専用です。同時に2盤面を押し込まず、状態に応じて1盤面を切り替えます。

過去の相談案と現在の実装が違う場合、上記正本コミットの実装を採用します。未実装の案をUnity版だけへ先行導入しないでください。

## 検証手順

1. 正本コミットが `69f5c566ebfde8cb0eca814fe0f5d8f04b291834` であることを確認する。
2. リポジトリルートで `node docs/unity-port/verify-handoff.mjs` を実行し、JSONと正本コードの写しを検証する。
3. Web正本で `npm ci`、`npm test`、`npm run build`、`npm run build:pages` を実行する。
4. Unityのルールテストを、`canonical-source/game-rules.test.ts` と `canonical-gameplay.json` の各条件に対応させる。
5. Unity EditMode / PlayModeテストを実行し、CASUALの秘匿、支援リンク、ECHO、レーダー、波紋、SSX-00、SURVIVAL継続状態を重点確認する。
6. Android縦持ちビルドを作成し、少なくとも1080×2160相当と402×874 logical px相当で、主要操作に不要なスクロールが発生しないことを確認する。
7. 実機または同等のエミュレーターで、最小44dpのタッチ領域、画面下端の安全領域、被害確認、配置、武装選択、結果画面を確認する。
8. 見た目は `Renderer.ts`、`globals.css`、`web-procedural-visual-reference.*` と照合する。旧画面やUnity修正前画像へ合わせない。

検証結果には、実行したテスト、端末解像度、スクリーンショット、残る差分を記録してください。
