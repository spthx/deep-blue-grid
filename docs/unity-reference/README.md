# Unity visual reference captures

Unity版の画面構造、密度、色、余白、操作位置、演出を比較するためのWeb版基準画像。
すべて公開中のGitHub PagesをCodex In-app Browserで撮影した。ゲーム本体の基準commitは
`97028522406d621a55678439e9e2bc15c04325c0`。この後のhandoff文書追加では画面コードを
変更していない。

| ファイル | viewport | 基準状態 |
| --- | ---: | --- |
| `01-phone-mode-select-402x874.png` | 402×874 | モード選択、色分け、説明密度 |
| `02-phone-mission-index-402x874.png` | 402×874 | 任務区分、達成状態、難易度、内部スクロール |
| `03-phone-training-index-402x874.png` | 402×874 | 6教程、平易な説明とCIC表記の併用 |
| `04-phone-training-brief-402x874.png` | 402×874 | 固定配置、教程brief、開始操作 |
| `05-phone-battle-command-402x874.png` | 402×874 | 縦持ちの盤面切替と下部指揮卓 |
| `06-desktop-battle-command-1366x768.png` | 1366×768 | 2盤面＋右指揮卓＋ログの横画面構成 |
| `07-desktop-impact-1366x768.png` | 1366×768 | 発射直後の着弾・識別演出 |
| `08-desktop-sonar-wake-1366x768.png` | 1366×768 | PASSIVE SONAR選択時の音紋と指令表示 |
| `09-desktop-sonar-contact-1366x768.png` | 1366×768 | CONTACT聴音演出 |
| `10-phone-fleet-placement-402x874.png` | 402×874 | 自動配置済み艦隊と配置操作の親指導線 |

画像は外観の回帰基準であり、画像をUnity画面の背景として貼り付けない。盤面、艦影、
scanline、音紋、着弾、SONARは `app/game/Renderer.ts` と `app/globals.css` を参照して
ネイティブ描画する。端末のブラウザchromeや物理Safe Areaは画像に含まれないため、
実機では `docs/UNITY_UI_HANDOFF.md` のSafe Area契約を別途満たすこと。
