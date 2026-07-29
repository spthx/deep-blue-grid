# DEEP BLUE GRID Unity版 修正・受け入れチェックリスト

## 0. 対象と判定基準

- Unity対象: `D:\Desktop\UnityProject\DeepBlueGrid`
- Web正本: `https://github.com/spthx/deep-blue-grid`
- 正本コミット: `69f5c566ebfde8cb0eca814fe0f5d8f04b291834`
- ルール正本:
  1. `docs/unity-port/canonical-source/game-rules.test.ts`
  2. `docs/unity-port/canonical-gameplay.json`
  3. `docs/unity-port/canonical-source/constants.ts`
  4. `docs/unity-port/canonical-source/Campaign.ts`
  5. `docs/unity-port/canonical-source/engine.ts`
  6. `docs/unity-port/canonical-source/EnemyAI.ts`
  7. `docs/unity-port/canonical-source/SubmarineWake.ts`
  8. `docs/unity-port/canonical-source/DeepBlueGrid.tsx`
  9. `docs/unity-port/canonical-source/Renderer.ts`
  10. `docs/unity-port/canonical-source/AudioManager.ts`

この文書の「現状」は、2026-07-29にUnityプロジェクトを読み取り確認した時点を指す。メソッド名を照合の基準とし、行番号には依存しない。

### 現在状態についての固定事項

- **Stage 4 `CROSS FIRE` は全モードに存在する。**
- **SURVIVAL Stage 6の敵編成には護衛艦 `DE-02` が存在する。**
- Stage 4削除、SURVIVAL Stage 6からの護衛艦削除は相談段階であり、Web正本には未反映。Unityだけで先行変更しない。
- SURVIVAL Stage 5だけ敵編成を`SS-01 + SSX-00`へ変更し、名称を`SILENT HUNTER`とする。
- 画像生成された高密度SF艦艇は正本ではない。盤上艦影は`Renderer.ts`由来の平面的なCIC記号である。

### 優先度

- **P0**: ルール、公平性、秘匿、進行不能、端末向き。1件でも未完なら正確な移植としない。
- **P1**: 盤面表現、操作性、音・演出、記録。Android実機配布前に完了する。
- **P2**: 長期保守、補助情報、品質保証の強化。初回完成版に可能な限り含める。

### 実装前のテスト基盤

現状の`Packages/manifest.json`にはUnity Test Frameworkがない。次を先に用意する。

- `com.unity.test-framework`をUnity 6対応版で追加。
- `Assets/Tests/EditMode/DeepBlueGrid.EditModeTests.asmdef`
- `Assets/Tests/PlayMode/DeepBlueGrid.PlayModeTests.asmdef`
- ルールテスト候補:
  - `Assets/Tests/EditMode/NavalBoardTests.cs`
  - `Assets/Tests/EditMode/WeaponAndSupportTests.cs`
  - `Assets/Tests/EditMode/EnemyCommanderFairnessTests.cs`
  - `Assets/Tests/EditMode/CampaignAndSurvivalTests.cs`
  - `Assets/Tests/EditMode/RenderingContractTests.cs`
  - `Assets/Tests/EditMode/AudioSynthesisTests.cs`
- UIテスト候補:
  - `Assets/Tests/PlayMode/PortraitLayoutTests.cs`
  - `Assets/Tests/PlayMode/BattleFlowTests.cs`
  - `Assets/Tests/PlayMode/EffectParityTests.cs`

`ContentValidator`だけを回帰テストの代用にしない。ビルド時検査は残してよいが、個別の失敗理由をTest Runnerで確認できるようにする。

---

## P0: ルール・公平性・必須進行

## P0-01 CASUALでも未撃沈の敵艦影を隠す

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `RefreshView()`
  - `FleetSummary()`
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `DrawShip()`
- `Assets/Scripts/UI/NavalUnitArtwork.cs`
  - `ShipArtworkLayer.Sync()`
  - `ShipArtworkLayer.Rebuild()`

**失敗症状**

`RefreshView()`の現在値は次のため、CASUALの敵盤で未撃沈艦の位置、向き、輪郭を表示する。

```csharp
boardGraphic.revealShips =
    !showingEnemy || mode == GameMode.Casual || phase == BattlePhase.Defeat;
```

CASUALが公開するのは敵艦カード上の艦種、コード、正確な耐久と被弾数であり、未撃沈艦の盤面座標ではない。

**修正**

- 戦闘中の敵盤ではモードを問わず`revealShips = false`。
- `DrawShip()`は`revealShips || state.sunk`の条件を維持し、撃沈艦だけ全輪郭を公開。
- 敗北後の`TACTICAL PLOT REVIEW`では明示的な結果レビュー状態によって全配置を公開する。`GameMode.Casual`を公開条件に使わない。
- 艦カードの情報公開と盤面艦影の公開を別フラグにする。

**EditMode受け入れ**

- CASUAL、TACTICS、SURVIVALそれぞれで未撃沈敵艦のセルを描画入力へ渡しても、艦影頂点が生成されない。
- 撃沈後は構成全セルの艦影とSUNKマークが生成される。
- CASUALの艦カードは艦名、コード、`hits/size`を表示する。

**PlayMode受け入れ**

- CASUAL Stage 1開始直後、敵盤64セルのどこにも敵艦輪郭が見えない。
- 1隻撃沈後、その1隻だけ全輪郭が見える。
- 敗北後に`TACTICAL PLOT REVIEW`を押した場合だけ敵全配置を確認できる。

---

## P0-02 プレイヤー向け照準推薦を完全に除去する

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `RefreshView()`
  - `boardGraphic.recommended`
  - `boardTitle`の`CIC GUIDE`
- `Assets/Scripts/Game/NavalRules.cs`
  - `TacticalAdvisor`
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `recommended`
  - `DrawRecommendation()`
- `Assets/Editor/ContentValidator.cs`
  - `ValidateTacticalAdvisor()`

**失敗症状**

通常砲撃・未選択時に`TacticalAdvisor.Recommend(enemy, enemyWakes)`が最大3セルを点灯する。隠し配置を直接読んでいなくても、Web正本にない終盤ヒントであり、プレイヤーの推理を代行している。

**修正**

- `TacticalAdvisor`クラス、呼び出し、描画リスト、`CIC GUIDE`文言、専用検査を削除する。
- ECHO、RADAR、音紋、HIT、識別は正本どおり表示し、それらから先を自動推薦しない。
- 将来の「親切機能」としてもCASUALを含め復活させない。

**EditMode受け入れ**

- Runtime assemblyに`TacticalAdvisor`型が存在しない。
- `GridBoardGraphic`に推薦セル入力または推薦描画経路が存在しない。

**PlayMode受け入れ**

- HIT、ECHO、CONTACT、音紋が複数存在しても、未攻撃セルに推薦ブラケットや順位リングが出ない。
- 盤面タイトルに`CIC GUIDE`や推奨座標が出ない。

---

## P0-03 護衛艦リンクをF-4とHARPOONの両方へ実装する

**影響箇所**

- `Assets/Scripts/Game/NavalRules.cs`
  - `NavalBoard.Randomize()`
  - `WeaponPatterns.HasEscortLink()`
  - `Arsenal.MaxUses()`
  - `Arsenal.AvailableUses()`
  - `Arsenal.InitialUses()`
- `Assets/Scripts/Game/EnemyCommander.cs`
  - `Decide()`は同じ`Arsenal`を使うため、別ルールを追加せず共通化
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `WeaponStatus()`
  - `WeaponUnavailableReason()`
  - `LostCapability()`
  - 配置説明、艦カード説明
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `DrawEscortZone()`
- `Assets/Scripts/Game/AfterActionReport.cs`
  - `CapabilityFinding`
- `Assets/Editor/ContentValidator.cs`
  - `ValidateStagePlacement()`
  - `ValidateWeapons()`

**失敗症状**

- 現在の`HasEscortLink()`は空母だけを見る。
- 現在のHARPOON初期値は2で、リンク最大3を表現できない。
- `NavalBoard.Randomize()`は空母がいるときだけ空母→護衛艦の順に置き、戦艦リンク候補を作らない。
- UIと喪失記録はF-4追加出撃しか説明しない。

**正本ルール**

- 生存護衛艦の**2区画すべて**が、生存対象艦のいずれかの区画にマンハッタン距離1で接する。
- 斜め接触、護衛艦1区画だけの接触は無効。
- 空母リンク: F-4 `1 → 2`。
- 戦艦リンク: HARPOON `2 → 3`。
- 同じ護衛艦が空母と戦艦の両方へ条件を満たせば、両ボーナス同時成立。
- 損傷だけでは切れず、護衛艦または対象艦が撃沈されると切れる。
- 敵も同じ使用回数と成立条件。

**修正**

- `HasEscortLinkTo(board, targetId)`を共通化し、`HasEscortLink()`と`HasFireControlLink()`を公開。
- 内部弾庫はWebと同じ最大値、F-4=2、HARPOON=3で初期化する。
- 未リンク時上限はF-4=1、HARPOON=2。
- `spent = absoluteMaximum - storedUses`として、現在リンク上限から使用済みを引く。リンク切断後に使用済み追加分を復活させない。
- `Randomize()`は存在する`carrier`と`battleship`を先に配置し、護衛艦をどちらか一方へ完全隣接できる候補から選ぶ。
- 配置中の支援候補表示は空母と戦艦を区別し、両方成立候補も識別できるようにする。
- 護衛艦喪失表示を「F-4追加出撃及びHARPOON追加発射不能」へ更新。

**EditMode受け入れ**

- 2区画とも空母に直交隣接: F-4最大2。
- 2区画とも戦艦に直交隣接: HARPOON最大3。
- 片方だけ隣接、斜めだけ隣接: ボーナスなし。
- 1隻で両方へ完全隣接: F-4最大2かつHARPOON最大3。
- 追加分使用後に護衛艦撃沈: 追加弾は復活しない。
- 護衛艦または対象艦撃沈: 対応兵装は残数があっても搭載艦喪失またはリンク切断の状態になる。
- 同一seedの敵`Arsenal`もプレイヤーと同じ最大・残数遷移。
- Stage 2のランダム配置を100 seed試し、合法配置かつ可能な場合に戦艦リンクが成立する。

**PlayMode受け入れ**

- 配置を動かすだけでF-4/HARPOONの`残り n/m`とリンク表示が即時更新。
- 両リンク陣形でF-4を2回、HARPOONを3回使用でき、4回目は使用不能。
- 敵も3回目のHARPOONを撃てる場合があり、自軍だけの特典にならない。

---

## P0-04 SSX-00緊急潜航後に新位置を漏らさない

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `enemyIdentified`
  - `ResolvePlayerAttack()`
  - `RefreshView()`
  - `UpdateIdentificationLabels()`
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `identified`
  - `DrawCritical()`
- `Assets/Scripts/Game/NavalRules.cs`
  - `NavalBoard.RelocateShip()`は移動処理として維持

**失敗症状**

`enemyIdentified`が艦IDだけを保持し、描画時に移動後の`ship.critical`を再取得する。このためSSX-00が初回命中後に移動すると、識別菱形と`SSX`コードが秘密の新位置へ移り、緊急潜航の意味を失う。

**修正**

- `ShipId → 識別時座標`の辞書を追加する。
- 重要区画へ初命中した瞬間の座標を一度だけ保存し、SSX移動後も上書きしない。
- 識別マーカーは現在の`ShipAt(coord)`や現在の`ship.critical`を必要とせず、保存座標に描く。
- 旧座標のHITと識別マーカーを最終接触点として残す。
- 新位置、向き、残耐久は公開しない。

**EditMode受け入れ**

- SSXの初回HIT座標Aと再配置座標Bが異なる。
- 識別記録はAのまま、艦の現在座標はB。
- Aへの再攻撃は`ALREADY`で、Bへの命中が2回目の耐久としてSUNK。

**PlayMode受け入れ**

- 初回命中→`EMERGENCY DIVE / 緊急潜航`→盤面再表示後も識別菱形は旧HIT座標に残る。
- 新位置には艦影、重要区画、コード、点滅、選択補助が一切出ない。

---

## P0-05 TACTICS/SURVIVALのCONTACT順をシャッフルする

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `StartStage()`
  - `FleetSummary()`
  - 新規`enemyContactOrder`
- 必要なら艦カードUIの構築箇所

**失敗症状**

`FleetSummary()`が`board.ships`の配置順をそのまま`CONTACT-01`以降へ割り当てる。ステージ編成順を知るプレイヤーはCONTACT番号から艦種を推測できる。

**修正**

- TACTICS/SURVIVALのステージ初期化時に、`seed ^ 0x19c4a7`の独立乱数で敵編成ID配列をシャッフルし、その順をステージ中固定。
- CASUALは編成順でよい。
- 未識別表示は`UNKNOWN CONTACT / 01`形式。
- 未撃沈中の耐久表示は実耐久と無関係な5本固定ダミー。
- 識別後も残耐久、向き、未命中区画は隠す。
- 撃沈後だけ艦種、コード、全輪郭、実撃沈状態を公開。

**EditMode受け入れ**

- 複数seedでCONTACT順が編成定義順に固定されない。
- 同一seedでは順序が決定的。
- 並べ替えによって敵配置、AI乱数列、攻撃判定を変えない。

**PlayMode受け入れ**

- TACTICS Stage 5開始時、CONTACT-01が常にCV-08にはならない。
- 未識別の全カードが5本固定メーター。
- 重要区画命中後は名前とコードだけ変わり、残耐久は引き続き不明。

---

## P0-06 自軍重要区画被弾をDAMAGE ASSESSMENT完了まで保持する

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `EnemyTurn()`
  - `BuildReviewCommands()`
  - `ContinueToPlayer()`
  - `ShowAlert()`
  - 新規`pendingDamageReports`または同等の公開戦闘報告状態

**失敗症状**

現在は`ShowAlert(..., 1.65f)`が消えると重要区画被弾の主表示も失われる。プレイヤーが盤面へ視線を戻す前に「敵に識別された」情報を読み逃す。

**修正**

- 敵行動1回分の公開報告をDAMAGE ASSESSMENT状態へ保持。
- 表示内容:
  - 敵兵装
  - 被弾艦名・コード
  - 座標
  - 重要区画被弾
  - 撃沈
  - 失われた能力
- 複数重要区画命中時は最後の1件だけでなく全件を保持。
- 一時テロップは演出として残してよいが、右寄せの「被害報告を記録 / 攻撃へ」を押すまで持続表示を消さない。
- `ContinueToPlayer()`で報告をログへ確定し、表示状態をクリア。
- 確認後は敵情図、通常砲撃選択、座標未選択へ戻す。

**EditMode受け入れ**

- 敵の複数攻撃が2隻の重要区画へ命中したとき、報告モデルに2件残る。
- `ContinueToPlayer()`相当の遷移でだけ報告が消える。

**PlayMode受け入れ**

- 1.65秒経過後もDAMAGE ASSESSMENTに重要区画警告が残る。
- 確認ボタンが右側寄せ、縦持ち基準で高さ56dp以上。
- 確認後、敵盤へ切り替わり通常砲撃が選択済み。

---

## P0-07 Androidを縦持ち専用にする

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `Awake()`
  - `ApplyResponsiveLayout()`
- `Assets/Editor/ProjectSetup.cs`
  - `Configure()`
- `Assets/Editor/ContentValidator.cs`
  - `ValidatePresentationContracts()`
- `ProjectSettings/ProjectSettings.asset`
  - `defaultScreenOrientation`
  - `allowedAutorotateTo*`
  - `useOSAutorotation`

**失敗症状**

- Runtimeは左右Landscapeを許可し`ScreenOrientation.AutoRotation`。
- ProjectSetupは`UIOrientation.AutoRotation`。
- ContentValidatorがPortrait＋両Landscapeを正解として要求。
- ProjectSettingsも`defaultScreenOrientation: 4`、左右Landscape許可。

**修正**

- Android runtimeは`ScreenOrientation.Portrait`。
- `autorotateToLandscapeLeft/Right = false`。
- `autorotateToPortrait = true`、上下逆Portraitは無効。
- ProjectSettings、ProjectSetup、ContentValidatorの3か所を同じ契約にする。
- Editor上の横長Game Viewはレイアウト検査用に動いてもよいが、Android Playerは回転させない。

**EditMode受け入れ**

- `PlayerSettings.defaultInterfaceOrientation == UIOrientation.Portrait`。
- Portraitのみ許可、PortraitUpsideDownと両Landscapeは不許可。
- ContentValidatorが横向き許可を要求しない。

**PlayMode / 実機受け入れ**

- 端末を左右に90度回してもゲーム画面は縦持ちを維持。
- 一時停止・復帰、広告復帰後も縦持ちを維持。
- Safe Area再計算後に盤面と主要ボタンが欠けない。

---

## P0-08 AIは公開情報だけで判断し、カンニングしない

**影響箇所**

- `Assets/Scripts/Game/EnemyCommander.cs`
  - `Decide()`
  - `Observe()`
  - `ObserveRadar()`
  - `ObserveWake()`
  - `PlacementsFor()`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `StartStage()`
  - `EnemyTurn()`
- `Assets/Editor/CampaignClearability.cs`
  - `Simulate()`
  - `ResolveVisibleCaptain()`

**禁止事項**

- 相手`NavalBoard.ships`、`ShipAt()`、未公開`critical`、`hits.Count`をAIの照準判断に使用。
- Unity scene、renderer、艦影オブジェクトの座標から敵位置を逆引き。
- CASUALだからという理由で敵配置をAIまたはプレイヤー支援へ渡す。
- 乱数を撃つ直前に実配置へ合うまで引き直す。

**許可情報**

- 自身の艦、生存搭載艦、自身の兵装残数。
- 自身の攻撃で得たMISS / ECHO / HIT / SUNK。
- CONTACT / NO CONTACT。
- 公開音紋。
- TACTICS profileが重要区画へ実際に命中して得た艦種と座標。
- 撃沈時に公開された艦種と全構成セル。
- シナリオ上あらかじめ公開される相手編成。

**修正**

- `EnemyCommander`は相手Board参照を保持しない。`Decide()`へ渡すBoardは**AI自身の艦・弾庫確認用**だけとする。
- 相手情報は`Observe*()`の公開結果をコピーして内部knowledgeへ記録。
- `CampaignClearability.ResolveVisibleCaptain()`は現在、`target.ships`の生セルを直接読む。これは実ゲームAIではないが、クリア可能性の保証値を不正に上げる。正本と同じ公開情報コマンダーへ置換する。
- 同一の公開履歴とseedなら、隠し配置だけ異なる2盤に対して次の判断を同一にする。

**EditMode受け入れ**

- 隠し配置A/B、公開履歴同一、seed同一のAIが同じ兵装・同じ座標を返す。
- 重要区画未命中時は異なる艦種の秘密criticalを判断に使わない。
- TACTICSで重要区画命中後だけ、その公開識別に整合する配置推論を行う。
- 64ターンの探索で盤外、既攻撃セル、同一セル再攻撃なし。
- 敵と自軍の兵装使用上限が同じ。
- Clearabilityが相手の未公開`ships/cells`を読むコードパスを持たない。

---

## P1: 見た目・操作・記録の正本一致

## P1-01 盤面艦影をWebのprocedural形状へ置換する

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `BuildBattleChrome()`
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `DrawShip()`
  - `DrawPlacementPreview()`
- `Assets/Scripts/UI/NavalUnitArtwork.cs`
  - `NavalUnitAtlas`
  - `ShipArtworkLayer`
- `Assets/Editor/ContentValidator.cs`
  - `NavalUnitAtlas-v1.png`必須検査
- `Assets/Resources/Art/Units/NavalUnitAtlas-v1.png`

**失敗症状**

画像生成された写実寄りSF艦艇アトラスが盤面とボタンに載り、Web正本の平面CICシルエットより情報量、色、形、質感が大きく異なる。

**修正**

- `Renderer.ts / drawShip()`の幾何を`GridBoardGraphic`へ移植。
- 船体`#71909b` alpha `.88`、上部構造`#b0ced0`、沈没船体`#584e51` alpha `.55`。
- 空母4×2、通常水上艦、潜水艦をWebと同じ矩形・艦首・上部構造の比率で描く。
- 盤面、艦カード、通常砲撃ボタンからアトラス参照を外す。
- アトラスファイルを残す場合もRuntimeからロードせず、正本として扱わない。
- `externalShipArtwork`による二重描画分岐を解消する。

**受け入れ**

- `images/web-procedural-visual-reference.png`と同じ種類の簡潔な上面記号。
- 盤面スクリーンショットを重ねた際、艦占有セル、向き、艦首、上部構造が一致。
- `ContentValidator`が画像アトラスの存在を完成条件にしない。

---

## P1-02 通常砲撃と艦カードのアイコンを正本化する

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `BuildPlacementCommands()`
  - `BuildWeaponCommands()`
- `Assets/Scripts/UI/NavalUnitArtwork.cs`
- 必要なら`Assets/Scripts/UI/GridBoardGraphic.cs`の描画ヘルパーを共用

**失敗症状**

`WeaponCarrier(Fire)`が`null`のため、通常砲撃にアトラスのgeneric craftが表示される。Webには存在しない。

**修正**

- 通常砲撃は砲弾、照準環、十字照準のprocedural記号。
- 艦カードはWeb同様、名称、コード、状態、耐久メーターを主情報とし、高密度画像を置かない。
- UNKNOWN CONTACTへ艦型を連想できるシルエットを置かない。

**受け入れ**

- 通常砲撃ボタンを見て航空機・艦艇と誤認しない。
- TACTICS未識別カードはカード画像から艦種推測不能。

---

## P1-03 縦持ちUIを状態別に再配置し、主要操作のためのスクロールをなくす

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `BuildCanvas()`
  - `ApplyResponsiveLayout()`
  - `BuildBattleChrome()`
  - `BuildPlacementCommands()`
  - `BuildWeaponCommands()`
  - `BuildReviewCommands()`
  - `BuildResultCommands()`
  - `ShowResultModal()`
  - `ShowLogModal()`
- `Assets/Scripts/UI/UiFactory.cs`
  - `SafeAreaFitter`
- `Assets/Scripts/App/DeepBlueGridAds.cs`
  - バナー実高の通知と余白

**修正**

- 縦画面は常に1盤だけ表示。
- ヘッダー、ステージ、状態説明を必要最小限に畳む。
- 盤面を最大の正方形として確保。
- 武装は4列×2行:
  1. 通常砲撃
  2. F-4
  3. HARPOON
  4. SEA SPARROW
  5. MK-45 II
  6. SPS-10
  7. CANCEL
  8. FIRE / SCAN
- 存在しない艦の兵装は、選択可能に見せてから拒否せず、初めからdisabled表示。
- 配置中は艦カードを3列×最大2行、操作を次の2段にする。
  - 回転 / 配置決定
  - 元に戻す / RANDOM / CLEAR / COMMENCE ENGAGEMENT
- `COMMENCE ENGAGEMENT`は赤系の主要CTA。
- DAMAGE ASSESSMENT確認は右寄せ、幅広、高さ56dp以上。
- 結果カードは`ScrollRect`化し、下部CTAを固定または常時到達可能にする。
- 常時ログは1～3行の内部スクロール。画面全体を動かさない。
- 広告未ロード時に固定11.5%の空白を残さない。ロード時だけ実バナー高さ＋安全余白を加算。

**PlayMode受け入れ**

- 配置、目標選択、FIRE、DAMAGE ASSESSMENT、リトライ、WITHDRAWに画面全体のスクロール不要。
- ログ本文と結果詳細だけは内部`ScrollRect`を許可。
- 通常ボタン44dp以上、主要CTA56dp以上。
- 文字が縦1文字ずつ折り返されない。
- 盤面上端・下端セルを広告やコマンドが覆わない。

---

## P1-04 用語と状態表示をWeb正本へ揃える

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `BeginPlayerTurn()`
  - `ShowTurnCurtain()`
  - `EnemyTurn()`
  - `BuildReviewCommands()`
  - `ShowResultModal()`
  - `SetStatus()`呼び出し全般

**失敗症状**

味方ターンを一律`COMMAND`、ターン幕を`TACTICAL COMMAND / COMMAND`とするほか、正本にない`COMMAND RATING`、`SECTOR SECURED`を表示する。敵レーダーNO CONTACTも正本の`NO TRACK`ではなく`SCAN EVADED`。

**修正**

| 状態 | 表示 |
|---|---|
| 配置 | `FLEET DEPLOYMENT / 艦隊配置` |
| 味方待機 | `AWAITING ORDERS / 指令待機` |
| 目標選択 | `TARGET DESIGNATION / 目標指示` |
| 発射可能 | `READY TO ENGAGE / 攻撃準備完了` |
| 攻撃中 | `ENGAGING / 攻撃実行中` |
| 敵行動 | `HOSTILE ACTION / 敵攻撃` |
| 被害確認 | `DAMAGE ASSESSMENT / 被害確認` |
| 勝利 | `MISSION ACCOMPLISHED / 作戦目標達成` |
| 敗北 | `MISSION ABORTED / 作戦中止` |
| 全作戦完了 | `OPERATION COMPLETE / 全作戦完了` |

- `COMMAND ASSESSMENT / 指揮所見`は結果分析の固有見出しとして残す。
- `COMMAND RATING`、`SECTOR SECURED`は削除。
- 敵レーダーCONTACT: `HOSTILE RADAR CONTACT / FLEET DETECTED`。
- 敵レーダーNO CONTACT: `ENEMY SPS-10 SCAN / NO TRACK`。

**受け入れ**

- 画面文字列のスナップショット検査で旧固定`COMMAND`、`COMMAND RATING`、`SECTOR SECURED`、`SCAN EVADED`が対象箇所に残らない。
- 指揮所見だけは`COMMAND ASSESSMENT`を維持。

---

## P1-05 重要区画・敵識別・SILENT profileの処理を揃える

**影響箇所**

- `Assets/Scripts/Game/EnemyCommander.cs`
  - `Observe()`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `ResolvePlayerAttack()`
  - `EnemyTurn()`
- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `DrawCritical()`

**失敗症状**

`EnemyCommander.Observe()`は`profile != Casual`なら識別を配置推論へ使うため、`Silent` profileまで重要区画識別をAI推論へ使用する。WebのAI推論利用条件は`profile == tactics`。

**修正**

- AI内部の`identifiedShips`更新は`AiProfile.Tactics`だけ。
- TACTICS/SURVIVALのプレイヤー向け識別表示自体は有効。
- `SILENT HUNTER`の警告・ログは表示してよいが、Silent profileの配置推論へ識別座標を入れない。
- 重要区画は追加ダメージなし。

**EditMode受け入れ**

- 同じcritical HITをCasual、Tactics、Silentへ観測させ、内部識別を持つのはTacticsだけ。
- critical HITと通常HITのダメージ増分は同じ1。

---

## P1-06 盤面マーカーと一時演出をWebへ一致させる

**影響箇所**

- `Assets/Scripts/UI/GridBoardGraphic.cs`
  - `Update()`
  - `DrawShot()`
  - `DrawCritical()`
  - `DrawWake()`
  - `DrawRadar()`
  - `DrawRadarFan()`
- `Assets/Scripts/UI/VisualPolish.cs`
  - `GridBoardFx`
  - `BoardShake`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - 各`WaitForSecondsRealtime`

**正本値**

- ECHO alpha: `.55 + .30 × sin(t × 4)`。
- HIT / SUNK alpha: `.70 + .25 × sin(t × 8)`。
- 重要区画被弾 pulse: `.78 + .20 × sin(t × 7)`。
- 識別 pulse: `.82 + .16 × sin(t × 5)`。
- レーダー pulse: `.72 + .18 × sin(t × 3.4)`。
- 音紋: `p=(t×1.25)%1`、2本目位相差`.42`、半径`.13→.47 cell`、alpha`.65×(1-p)`。
- すべての音紋は同一グローバル位相。出現時刻ごとに位相をずらさない。

**現在の差**

- ECHO/HIT/SUNKは再描画されても描画値が静的。
- Wake速度が`.65`で、正本の`1.25`より遅い。
- `GridBoardFx`の放射状爆発片はWebより派手で、マーカーを隠す。
- `BoardShake`が`anchoredPosition +=`で毎フレーム加算され、原点復帰せずドリフトする。

**修正**

- `Renderer.ts`の形状とpulse式を移植。
- HIT/SUNKの常設マーカーと一時着弾演出を別レイヤー化。
- 一時演出は常設マーカーを覆い続けない。
- Webにない放射状破片、強い全面フラッシュ、ズームは除去。
- `BoardShake`はTrigger時の基準座標を保存し、毎フレーム`origin + offset`、終了時`origin`へ必ず復帰。

**演出時間**

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
| 敵識別 | 1650ms |
| 緊急潜航 | 1750ms |
| 画面揺れ | 280ms |
| 武装タッチ説明 | 2600ms |

**EditMode受け入れ**

- 固定時刻を注入し、各pulse式が許容誤差`±0.01`。
- 全音紋が同じ時刻で同じ半径・alpha。
- 画面揺れ10回後の`anchoredPosition`が開始値と完全一致。

**PlayMode受け入れ**

- MISS、ECHO、HIT、SUNK、VITAL、IDENTIFIED、WAKE、CONTACT、NO CONTACTを単独スクリーンショット化。
- 1秒動画でマーカー周期と音紋同期を確認。
- エフェクト後も盤面位置、タップ座標、グリッド線がずれない。

---

## P1-07 音を`AudioManager.ts`の合成値へ一致させる

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridFeedback.cs`
  - `Awake()`
  - `Tone()`
  - `AmbientPulse()`
  - `Sequence()`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - 各`feedback.Play()`

**失敗症状**

現在の周波数、長さ、attack/release、音量、8秒ambientはWeb正本と異なる。

**修正**

- 音声ファイルを使用せず実行時合成。
- 指定gainから`.0001`への指数減衰。独自attack、reverb、filter、compressor、panなし。
- 最低限、次を完全移植:

| Cue | 波形 | 周波数 | 長さ | gain |
|---|---|---|---:|---:|
| cursor | square | 720→640Hz | 25ms | .018 |
| confirm | square | 520→700Hz | 60ms | .035 |
| cancel | sawtooth | 220→140Hz | 80ms | .025 |
| fire | sawtooth | 110→530Hz | 240ms | .060 |
| splash-1 | triangle | 160→60Hz | 180ms | .045 |
| splash-2 | sine | 670→170Hz | 120ms | .025 |
| hit-1 | square | 80→40Hz | 340ms | .070 |
| hit-2 | sawtooth | 520→220Hz | 100ms | .035 |

- sonarは360→400、540→580、720→760Hzを各120ms、120ms間隔、gain `.035`。
- BGMはsquare、`[55,55,73,55,82,73,55,49]Hz`、260ms間隔、各120ms、終端-4Hz、gain `.012`。
- Unity独自`AmbientPulse()`を削除。
- 撃沈時はHIT音の後にSUNK sequenceを重ねる。

**EditMode受け入れ**

- 生成AudioClipのsample数が指定時間と1 sample以内。
- FFT主成分が始端・終端周波数の`±2%`。
- envelope末尾が`.0001`相当まで減衰。
- BGMの8音順、260ms間隔、ループ位置が一致。

**PlayMode / 実機受け入れ**

- ミュート時にSE/BGMがともに停止し、復帰後に多重BGMにならない。
- バックグラウンド→フォアグラウンド復帰後も音声状態が壊れない。
- Web版とのAB比較でcursor、fire、hit、sonar、BGMの高さと長さが明確に一致。

---

## P1-08 ログを最新行先頭・全ステージ保持へ揃える

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `AddLog()`
  - `RefreshView()`
  - `ShowLogModal()`
  - `StartCampaign()`
  - `StartStage()`
  - `AdvanceResult()`

**失敗症状**

現在は`logs.Add()`で古い順に保持し、常時欄も末尾3行を古→新で表示する。正本は最新行が先頭。

**修正**

- `logs.Insert(0, entry)`または表示時逆順で、最新行を上。
- 40行制限なし。
- モード開始時だけ新しい作戦ログにし、ステージ移行・リトライで消さない。
- `HHMMZ`、秒なし。
- 区切り行は太字・色変更:
  - MODE作戦開始
  - STAGE交戦開始
  - 作戦目標達成
  - 交戦終了・作戦中止
  - 修復・再補給
- 自軍被害へ敵兵装、艦名、コード、座標、重要区画、撃沈、喪失能力を記録。
- ログScrollRect初期位置は先頭。

**受け入れ**

- 1000行追加して欠落なし。
- Stage 1→2、Stage 2リトライ後もStage 1開始行が残る。
- 先頭行が常に最新。
- 結果画面から作戦全履歴へ到達できる。

---

## P1-09 結果・指揮所見・喪失能力を最新ルールへ合わせる

**影響箇所**

- `Assets/Scripts/Game/AfterActionReport.cs`
  - `CapabilityFinding`
  - `Build()`
  - `BuildSurvivalFinding()`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `LostCapability()`
  - `BuildAssessment()`
  - `ShowResultModal()`

**修正**

- 護衛艦喪失:
  - `護衛支援能力を喪失。F-4追加出撃及びHARPOON追加発射不能。`
- 搭載艦を喪失した兵装を未使用特殊兵装に数えない。
- SURVIVALは進入時艦数・区画、累積損耗、当該海域戦果、劣勢条件を評価。
- 敗因で責めず、事実、損耗、戦果、再検討余地を記述。
- 勝敗を問わず両盤と全ログへ到達可能。
- 敗北時:
  - RETRY STAGE
  - WITHDRAW
  - COMMAND ASSESSMENT
  - TACTICAL PLOT REVIEW
- SURVIVALリトライは海域進入時の生存艦隊を復元し、失敗試行中の喪失を確定しない。

**受け入れ**

- 護衛艦喪失ログと指揮所見にF-4とHARPOONの両方を記録。
- 空母喪失後、残F-4を「未投入可能兵装」に数えない。
- SURVIVAL Stage 5敗北時、過去の損耗と当該海域戦果を別々に表示。
- RETRY後の艦隊が失敗開始時と同一。

---

## P1-10 SURVIVALクリア可能性検査を連続6海域にする

**影響箇所**

- `Assets/Editor/CampaignClearability.cs`
  - `ValidateOrThrow()`
  - `Simulate()`

**失敗症状**

現在は各ステージを`NavalData.StandardFleet`から独立開始するため、SURVIVALの「沈没艦は戻らない」を検査していない。

**修正**

- 1 trialをStage 1からStage 6まで連続実行。
- 勝利後、生存艦だけを全快・再補給して次ステージへ。
- 撃沈艦と搭載兵装を除外。
- Stage 5は`SS-01 + SSX-00`。
- Stage 6は現在の正本どおり敵護衛艦を含む。
- 公開情報だけを使うプレイヤーコマンダーで評価。
- 単一の必勝を保証せず、複数seedに実用的な勝ち筋が存在することを報告。

**受け入れ**

- ログに各trialの進入艦隊、喪失、次海域艦隊、最終到達海域を出す。
- Stage 4を飛ばさない。
- Stage 6敵編成にDE-02を含む。
- 少なくとも1つの公平情報seedで全6海域クリア経路を確認。

---

## P2: 保守・補助品質

## P2-01 配置・武装の説明をタッチで即時表示する

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `BuildPlacementCommands()`
  - `BuildWeaponCommands()`
  - `WeaponHelp()`
- `Assets/Scripts/UI/UiFactory.cs`
  - pointer enter / pointer down / long press用の共通イベント

**修正**

- マウスover、focus、touch downで艦・兵装説明を2600ms表示。
- 艦説明:
  - 役割
  - 占有区画
  - 搭載兵装
  - 重要区画
  - 喪失時能力
- 護衛艦はF-4/HARPOONの両リンク、同時成立、密集リスクを説明。
- 使用不能兵装も、なぜ使えないかを短く表示。
- 長押しを発射・配置確定として誤認しない。

**受け入れ**

- Android touchでタップ確定前に説明を読める。
- PC mouse overとkeyboard focusでも同じ文言。

---

## P2-02 スリープ抑止と一時停止復帰を正本相当にする

**影響箇所**

- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `OnApplicationFocus()`
  - `OnApplicationPause()`
- 必要なら新規`Assets/Scripts/App/ScreenAwakeController.cs`

**修正**

- プレイ中は`Screen.sleepTimeout = SleepTimeout.Never`。
- モード選択へ戻る、アプリ終了時は以前の値へ復元。
- pause/resume後にBGM、選択状態、DAMAGE ASSESSMENT、ログを維持。
- 復帰でコルーチンを二重起動しない。

**受け入れ**

- Androidで無操作時間を超えてもゲーム中に自動消灯しない。
- Home→復帰、広告→復帰、画面ロック解除後にターンが二重進行しない。

---

## P2-03 不使用の旧ゲーム系と生成アート依存を隔離する

**影響箇所**

- `Assets/Scripts/Game/DeepBlueGridGame.cs`
- `Assets/Scripts/Content/*`
- `Assets/Resources/Content/*`
- `Assets/Scripts/UI/NavalUnitArtwork.cs`

**修正**

- 現行8×8海戦へ未接続の旧node/energy/hullゲーム系をRuntime sceneから参照しない。
- 削除しない場合は別assemblyまたは`Legacy`へ隔離し、ContentValidatorとビルドへ混入させない。
- 正本外アセットをResources自動ロードしない。

**受け入れ**

- Main sceneから旧ゲームクラスへの参照なし。
- Android buildのResourcesに不要な生成艦艇アトラスを含めない。

---

## P2-04 決定的seedと診断情報を開発ビルドへ追加する

**影響箇所**

- `Assets/Scripts/Game/NavalRules.cs`
  - `SeededRandom`
- `Assets/Scripts/App/DeepBlueGridApp.cs`
  - `StartStage()`
- 開発専用診断UIまたはログ

**修正**

- Development Buildだけ現在seed、mode、stage、AI profile、hunt breadthをログへ出す。
- Release画面にseedや内部AI情報を表示しない。
- 同じseedで配置、CONTACT順、AI判断列を再現可能。

**受け入れ**

- 失敗報告のseedから同一配置・同一AI列を再現。
- Release APKから内部情報表示を確認できない。

---

## 縦持ちUIテストマトリクス

次を**各モード**の配置、初回ターン、通常砲撃、特殊兵装、敵攻撃、DAMAGE ASSESSMENT、ログ、勝利、敗北で確認する。

| 区分 | 解像度 / 論理サイズ | Safe Area | 広告 | 必須確認 |
|---|---|---|---|---|
| 最小smoke | 360×800 | 上24 / 下24dp | なし | 文字破綻、盤面入力 |
| Android標準 | 393×852 | 上32 / 下24dp | なし | 全主要操作無スクロール |
| 正本比較 | 402×874 | 上47 / 下34dp | なし | Web縦画面との構図比較 |
| 大型phone | 412×915 | 上32 / 下24dp | なし | 余白過多なし |
| 短めphone | 540×960 | 上24 / 下24dp | なし | コマンド欠けなし |
| Pixel 3実機 | 1080×2160 | 実機値 | なし | タップ、文字、振動、音 |
| Pixel 3実機 | 1080×2160 | 実機値 | バナー表示 | 盤面・CTA非遮蔽 |
| 縦tablet | 800×1280相当 | 0 / 24dp | なし | UIが中央に間延びしない |

### 各サイズ共通の合格条件

- Safe Area外へ主要文字・ボタンを置かない。
- 402×874基準で通常ボタン44dp以上、主要CTA56dp以上。
- 盤面は正方形、8×8の座標変換にずれなし。
- 配置時、盤面のA/H行または1/8列をコマンドが覆わない。
- 武装、CANCEL、FIRE/SCANは常に同じ2行内。
- FIREだけが不自然に画面右下へ離れない。
- DAMAGE ASSESSMENT確認は右手親指で押せる位置。
- 画面全体を1～40pxだけ動かさないとボタンが押せない状態を不合格とする。
- 広告なし時は広告分の空白を解放。
- 広告あり時も盤面と主要CTAの間に誤タップ防止余白を持つ。
- ログ・結果本文だけ内部スクロール可。配置・攻撃・被害確認の主要フローはスクロール不可。

---

## ルール回帰テスト一覧

Webの`game-rules.test.ts`を最低限、次のUnity EditModeテストへ移植する。

- 6ステージの編成とAI値。
- Stage 5 AI緩和、SURVIVAL Stage 6の1.785。
- SURVIVAL Stage 5だけSilent Hunter。
- Zulu時刻が秒なし。
- 指揮所見が非難口調でなく、累積損耗を考慮。
- SURVIVAL開始は6艦、沈没艦は次海域へ戻らない。
- 全ステージ編成が合法配置可能。
- 空母4×2と4方向回転。
- 全艦重要区画の4方向回転。
- 潜水艦1区画は命中・識別・撃沈が同時。
- 重複、盤外、同一艦二重配置を拒否。
- 配置済み艦を拾い直して移動。
- 同一セル再攻撃で二重ダメージなし。
- ECHOは上下左右4方向だけ。
- 最終潜水艦の行動後にだけ音紋。
- 音紋は艦、既攻撃、未解消レーダー、既存音紋を避ける。
- SSXは1回目HIT後に移動、2回目でSUNK。
- SS-01生存中はSS-01が射撃、以後SSXはHOLD/FIRE交互。
- AIとプレイヤーが同じ音紋候補を得る。
- 5命中済み空母をAIが公開情報から追撃可能。
- 重要区画識別を配置推論へ使うのはTactics profileだけ。
- 兵装パターンの盤端切り捨て。
- RADARはダメージなし、未破壊区画だけCONTACT。
- 搭載艦喪失で残兵装使用不能。
- 未リンクHARPOONは2回。
- 戦艦リンクHARPOONは3回。
- 1護衛艦のF-4/HARPOON同時リンク。
- 未リンクF-4は1回。
- AIは盤外・既攻撃を選ばない。
- TACTICS敵も同じ補給量、隠し艦位置を読まない。
- 複数seedの公平AI対戦で双方に実用的な勝ち筋。

---

## 完了判定

以下をすべて満たした時だけ「Web正本に近いUnity Android縦持ち版」とする。

- [ ] P0全項目完了。
- [ ] EditMode / PlayMode全テスト成功。
- [ ] ContentValidator成功。
- [ ] 連続SURVIVAL clearability検査完了。
- [ ] Android ARM64 Development Build成功。
- [ ] Pixel 3縦持ちで配置から勝敗後レビューまで通しプレイ。
- [ ] CASUALの未撃沈敵艦影が見えない。
- [ ] TacticalAdvisorが存在しない。
- [ ] F-4/HARPOON両リンクが敵味方対称。
- [ ] SSX緊急潜航後の新位置漏洩なし。
- [ ] CONTACT順から艦種推定不能。
- [ ] 重要区画警告が確認まで残る。
- [ ] 主要操作に画面全体の微小スクロール不要。
- [ ] procedural艦影、マーカー、音紋、レーダーが参照画像と一致。
- [ ] 音の周波数、長さ、BGM列が正本値と一致。
- [ ] 画面揺れ後の盤面ドリフトなし。
- [ ] 全ログを結果画面から確認可能。
- [ ] Stage 4が存在する。
- [ ] SURVIVAL Stage 6の敵に護衛艦が存在する。
- [ ] AIが隠し配置を直接読まない。
