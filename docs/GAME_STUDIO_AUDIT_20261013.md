# Game Studio: 演出・操作監査（2026-10-13）

最終更新: 再開後のブラウザ監査・修正・本番更新まで実施済み。初回記録にある操作ツールの未確認項目は、独立したChromium検証で下記の範囲を確認した。スマートフォンの実指操作と音の実聴は引き続き未確認。

対象: ブラウザ版。既存React/Canvas 2DとCIC意匠を維持。Unity・ADB・セーブ形式・戦闘ルールは変更しない。

## 改善と根拠

| 修正前 | 修正後 | 理由 |
| --- | --- | --- |
| 着弾更新後220/260ms待ってから命中音 | 命中・水しぶき・撃沈音を着弾更新と同時に呼び、400ms保持 | 一区画ずつ結果を読めるテンポと音の同期 |
| 攻撃・聴音後は自動で敵ターン | ACTION REPORTで停止。「敵の応射へ」で進む | 結果を読む時間をプレイヤーが決められる |
| 報告からの盤面切替・LOGは画面上部 | 確認ボタンのそばに自軍・敵情・LOG | 縦持ちでも横持ちでも指の移動を減らす |
| 敵攻撃結果を一般的な説明で上書き | 実際の損害・聴音結果を報告に残す | 何が起きたか消えない |
| ALREADYにも敵着弾FX/音 | 新規着弾だけを処理 | 偽の着弾を防止 |
| 右クリックが盤面移動にも入り、pointercancelが確定扱い | 左ボタン限定、中断時は確定禁止 | 誤操作・タッチ離脱対策 |
| 配置済艦を持ち上げる最初の指が二本指集合に入らない | 最初の接触も登録、回転中は確定排他 | 二本指回転の一貫性 |
| 敵応射確認が多重実行されうる | 同期refゲート | ダブルクリックでも敵は一行動 |
| 敵行動中にキーボード照準処理が走る | 敵行動・報告・ロック中はゲームショートカットを遮断 | UI状態と入力状態の一致 |
| reduced-motionで通知が終了フレームの透明状態へ | 通知は静止表示、保持時間はJS管理 | 動きを減らしても情報を失わない |
| 訓練艦影がleft/topを毎フレーム更新 | transform/opacityによる移動 | レイアウト更新を抑える |
| 訓練進捗がwidthアニメーション | scaleXへ変更 | 同上 |
| reduced-motionの艦影が開始位置で停止 | 到着位置・回転済みの形で表示 | 静止でも操作結果が分かる |
| 横持ち教程の本文と図が細い帯 | 図と本文の左右配置、操作は下端一列 | 844×390で実画面確認 |
| 小画面の兵装文字9/8px | 名前11px・残数10px | 極小文字を緩和 |
| 静粛移動のJS保持1.9秒とCSS1.75秒にずれ | 1.75秒へ統一 | 不可視時間を排除 |

## 演出棚卸し

- 盤面/艦影/MISS/ECHO/HIT/SUNK/VITAL/識別: Renderer描画順、色、秘匿条件をコード確認。CIC形状を維持。
- 音紋: 全マークが同じ描画時間を参照。既存マークと重ならない公開情報契約は回帰テスト対象。
- SONAR: 自軍CONTACT/NO CONTACT、敵FLEET DETECTEDのネガティブ色と文言を確認。NO CONTACT→手動確認→敵応射は実操作確認。
- ターン帯/識別/静粛移動: 保持時間をPresentationContractに維持。reduced-motionの通知消失を修正。
- 着弾shake: HIT/SUNK時だけ。MISSと照準では揺らさない既存契約を維持。
- BGM/効果音: visibilitychangeで停止・復帰する既存コード、ミュート、喪失tierを確認。音声の実聴品質・端末スピーカーは未確認。
- 訓練: 開始/次へ/修了/次教程解放を実操作確認。9教材の全storyboardは自動テスト対象。
- 勝敗/AAR/再挑戦/保存: 既存ルールを保持。全任務canonical routeと進行・保存の自動回帰を実行。全勝敗画面の今回の手動踏破は未完。

## 確認結果

- 全167テスト合格（最終はtest-concurrency=1）。SSRビルド、Cloudflare静的ビルド成功。
- 手動ブラウザ: 402×874 / 844×390。教程、配置→交戦開始、HARPOON照準/発射/結果停止、SONAR、LOG開閉、自軍切替、敵応射ダブルクリック、損害報告→次ターンを確認。
- コンソール確認時errorなし。
- 追加撮影中にブラウザ操作ツールがタイムアウト。最終の全画面目視は完了扱いにしない。
- PCのメモリ不足でSSRビルドが失敗したが、本作業の開発サーバーだけ停止し、512MB heap/逐次テストで成功。他タスクのプロセス・OS設定は変更していない。
- スマートフォン実機、多点タッチ実指、音の実聴、全稀少演出の実操作は未確認。
- Impeccable検出のCIC固有の格子/色枠は既存意匠として維持。layoutアニメーションは修正。

## 証跡

`outputs/20261013-browser-qa/` のtraining-landscape.jpg、training-portrait.jpg、sonar-report-portrait.jpg、damage-report-portrait.jpg。診断・途中検証を含み、実機画像ではない。

## 公開

既存Cloudflare Pages `deep-blue-grid` のproduction/masterへ、ユーザー指示により更新済み。

- Production: https://deep-blue-grid.pages.dev/
- Deployment: https://770d62ac.deep-blue-grid.pages.dev
- HTTP 200、production HTMLが新JS/CSSを参照。配信バイトのSHA-256とローカルビルドの一致を確認。
- JS `index-sCYrrTAA.js` / 468131 bytes / `1F999E80F677008FEE8CA8CD045DFF625DFCCB64ADB1524AC810C5AD94342F45`
- CSS `index-O4fnzfiv.css` / 130582 bytes / `1ADB97707F854601E96C8BB1904B70F55063AB2DCDD4918F16D6CDCE407EFA4D`
- 公開後のブラウザ追加操作は同じツールタイムアウトのため未確認。HTTP/配信一致と操作合格は区別する。
- Git pushは行っていない。作業ツリーにソース修正を保持。公開は既存Pagesプロジェクトへ直接配備。

## 再開後の修正と最終確認

- 縦持ち教程のNEXTが余分な行へ送られる問題を解消。戻る/再生/NEXTを一行にし、本文の領域を拡大。低い縦画面はSafe Area内までウィンドウを広げる。
- 説明図をパネルの残り高さへ合わせ、デスクトップで見出し・手順と重ならないようにした。
- 訓練の行動カウンターと表示中の指示番号を分離。CONTACT表示中はPHASE 01を維持し、結果の保持時間が終わってからPHASE 02へ進む。ルール上の行動消費・評価は変更していない。
- 素早く実行したときに前ターンのAWAITING ORDERSが重なる問題を解消。新しい指令が成立した時点でターン帯を閉じる。
- faviconを追加し、静的版とSSR版の双方へ設定。公開版のリソース404を解消。
- 全167テスト合格、SSR・Cloudflareビルド成功。
- 9教程×10 viewportの90条件をChromiumで検証。全操作44px以上、図は正方形、本文のスクロール領域120px以上、パネルと操作の画面外はみ出しなし。寸法は320×568、402×740、402×874、568×320、844×390、834×1112、1112×834、1366×768、1536×864、1920×900。
- 実操作: CONTACT、NO CONTACT、重要区画識別、HIT/SUNK、F-4二回出撃・勝利/AAR、敵の実被弾報告、LOG開閉、盤面切替、再挑戦を確認。再挑戦後も戦闘ログを保持。
- F-4四点攻撃をCanvasの表示画素から計測: 481/887/1287/1687ms、着弾間隔406/400/400ms。一斉表示ではない。
- 聴音通知は実測907msで可視。0.8秒取得＋通知フェードに整合。
- 二本指はChromiumの実タッチ入力経路で東→南へ一回だけ回転。タッチ中断は仮配置を保持。右クリックは原点を変えず回転。
- 敵応射ダブルクリック時の敵ターン開始は一回。結果確認で1200ms待ち、勝手に敵へ進まないことを確認。
- reduced-motion: 通知opacity=1を保持、Canvasを250ms比較して静止を確認、ターン帯との重なりなし。
- Dドライブ満杯によるENOSPCを確認。QA記録を一時的にCへ保存し、今回生成したSSR出力だけを退避した。後に空き容量が戻り、SSR出力を元へ復元。ソース・既存アセットの削除は行っていない。

最新の公開: https://deep-blue-grid.pages.dev/

Deployment: https://e6317a71.deep-blue-grid.pages.dev

公開後もChromiumで縦/横の教程、NEXT操作を確認。JavaScript例外なし、HTTPエラー応答なし。公開アセットのSHA-256とローカル成果物が一致。

最終証跡: `outputs/20261013-browser-completion/`。PNGは全チャンクCRCとIENDを検証済み。初回の診断画像も保持しているため、採用する画像は同フォルダREADME記載のfinal/public/lessonの最新画像を使う。

主な変更ファイル: `app/game/DeepBlueGrid.tsx`、`BriefingCoach.tsx`、`PresentationContract.ts`、`app/globals.css`、`app/layout.tsx`、`index.html`、`public/favicon.svg`、`tests/ui-quality.test.mjs`。Unity runtime handoffのJSONとチェックサムはPresentationContract変更へ追従済み。
