# 全モード公開・チュートリアル任意化（2026-10-13）

ユーザー指示により、受講・クリア実績をゲーム開始の条件から外した正式版。

- CASUAL / TACTICS / SURVIVAL / MISSIONを最初から開始可能。
- MISSIONの戦術16・記録5・極限7、全28任務が自由選択。
- INITIAL TRAININGは任意教材。9教程をどれからでも受講可能。
- 初回メニューの最初のゲームはCASUAL。受講を促す強制説明と順次解放の案内を変更。
- v2達成記録は各モードの実際の完遂を独立して保存。未受講や未クリアを達成済みに偽装しない。
- v1保存の既存完遂記録は移行。新しい版の保存は上書きしない。単一任務の記録から他モードの完遂を推測しない。
- 初回完遂後に新モード権限の説明動画を自動再生しない。全モードがすでに利用可能なため。
- Unity向けruntime JSONにもアクセス方針と保存versionを反映。Unityアプリ自体のビルド・配備はこの作業では行っていない。

確認: 168テスト合格、SSRとCloudflareのビルド成功。新しいブラウザでデバッグ指定なし・教程未受講のまま、CASUAL/TACTICS/SURVIVALの交戦開始、全28任務の選択と各区分からの開始、LESSON 09の直接受講を確認。

公開先: https://deep-blue-grid.pages.dev/

正式配備: https://7c50de05.deep-blue-grid.pages.dev

公開後もデバッグ指定なしで各モードと3任務区分、最後の教程の直接開始を確認。配信JS/CSSはローカルビルドのSHA-256と一致。画面証跡は`outputs/20261013-open-access/`。

主な変更: `app/game/Progression.ts` / `DeepBlueGrid.tsx` / `ModeAuthorization.ts` / `app/globals.css` / `scripts/export-unity-content.ts` / `tests/progression.test.ts` / `tests/progression-ui.test.mjs` / `tests/unity-handoff.test.ts` / `README.md` / `docs/UNITY_HANDOFF_INDEX.md` / 自動生成handoff JSONとチェックサム。
