import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the finished game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>DEEP BLUE GRID/);
  assert.match(html, /DEEP/);
  assert.match(html, /FLEET DEPLOYMENT/);
  assert.match(html, /OPERATION MODE/);
  assert.match(html, /CASUAL/);
  assert.match(html, /TACTICS/);
  assert.match(html, /SURVIVAL/);
  assert.match(html, /VITAL COMPARTMENT \/ 重要区画/);
  assert.match(html, /追加ダメージなし/);
  assert.match(html, /敵指揮系統も同じ条件/);
  assert.match(html, /敵指揮系統も探知済み情報だけで判断/);
  assert.match(html, /複数海域/);
  assert.doesNotMatch(html, /DIFFICULTY|NORMAL|HARD|基本戦術・手加減なし/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("mobile command deck stays four columns by two rows", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:760px\) \{[\s\S]*?\.command-deck \{ position:sticky; \}/);
});

test("responsive regimes cover compact portrait, phone landscape, tablet landscape, and full-HD", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /max-width: 1099px\) and \(orientation: portrait\), \(max-width: 959px\) and \(max-height: 600px\)/);
  assert.match(css, /min-width:960px\) and \(orientation:landscape\)/);
  assert.match(css, /min-width:1100px/);
  assert.doesNotMatch(css, /min-width:1100px\) and \(max-height:1050px\)/);
  assert.match(css, /calc\(100dvh - 330px\)/);
  assert.match(css, /\.phase-placement \.canvas-wrap[\s\S]*?calc\(100dvh - 425px\)/);
  assert.match(css, /\.ops-lower\.compact-command-bottom,[\s\S]*?\.legend\.compact-command-bottom \{ display:none; \}/);
  assert.match(css, /\.mobile-field-switch button \{[\s\S]*?min-height:44px/);
});

test("unavailable weapons cannot become the selected command", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /const selectWeapon = \(nextWeapon: WeaponId\) => \{[\s\S]*?const state = weaponState\(nextWeapon\);[\s\S]*?if \(!state\.available\) \{[\s\S]*?return;[\s\S]*?setWeapon\(nextWeapon\);/);
  assert.equal((source.match(/disabled=\{phase !== "player" \|\| locked\}/g) ?? []).length, 2);
  assert.equal((source.match(/aria-disabled=\{!state\.available \|\| phase !== "player" \|\| locked\}/g) ?? []).length, 2);
  assert.equal((source.match(/aria-pressed=\{weapon === id\}/g) ?? []).length, 2);
  assert.match(source, /onPointerDown=\{\(\) => showWeaponPeek\(id\)\}/);
});

test("keyboard and full-HD review controls do not double-trigger", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /target\?\.closest\("button, summary, a, input, textarea, select, \[role='dialog'\]"\)/);
  assert.match(source, /if \(!difficulty \|\| phase === "victory" \|\| phase === "defeat"\) return/);
  assert.match(source, /className="result-review-bar compact-command-bottom"/);
  assert.match(css, /:where\(button, summary\):focus-visible/);
});
test("portrait play collapses redundant top and placement information", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /className="placement-help placement-dossier"[\s\S]*?open=\{!compactViewport\}/);
  assert.match(source, /className="placement-dossier-body"/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*?\.quick-guide \{ display:none; \}/);
  assert.match(css, /orientation:portrait[\s\S]*?\.mobile-field-switch > div \{ display:none; \}/);
});
test("returning from damage review resets the command to normal fire", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /const continueToPlayer = \(\) => \{[\s\S]*?setWeapon\("fire"\);\s*setPicked\(\[\]\);/);
});

test("survival retries the current stage with its entering fleet", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /difficulty === "survival" \? survivalFleetRef\.current : undefined, true/);
  assert.match(source, /戦術撤退。現在の交戦結果を破棄し、進入時艦隊で再出撃。/);
  assert.match(source, /現在の残存艦隊で再配置/);
  assert.doesNotMatch(source, /RESTART SURVIVAL/);
});

test("placement uses explicit rotate and confirm controls", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /placement-dock/);
  assert.match(source, /90°回転/);
  assert.match(source, /ORIENTATIONS\.indexOf\(orientation\) \+ 1/);
  assert.match(source, /east: "東", south: "南", west: "西", north: "北"/);
  assert.match(source, /配置決定/);
  assert.doesNotMatch(source, /シルエットをタップして確定/);
});

test("radar contact and clear scans use one restrained tactical frame", async () => {
  const source = await readFile(new URL("../app/game/Renderer.ts", import.meta.url), "utf8");
  assert.match(source, /setLineDash\(\[cell\*\.16,cell\*\.11\]\)/);
  assert.match(source, /ctx\.arc\(centerX,centerY,radius/);
  assert.match(source, /ctx\.createLinearGradient/);
  assert.match(source, /contactResolved/);
  assert.match(source, /const mark=board\.shots\[y\]\[x\];if\(mark!=="unknown"\)drawMark/);
});

test("passive sonar announces its binary result over the playfield", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /radarAlert\.hostile \? radarAlert\.contact \? "FLEET DETECTED" : "NO TRACK" : radarAlert\.contact \? "CONTACT!" : "NO CONTACT"/);
  assert.match(game, /指定4区画内に未破壊艦区画の音響反応あり/);
  assert.match(game, /指定4区画内に反応なし/);
  assert.match(game, /PASSIVE SONAR/);
  assert.match(game, /ESCORT SUPPORT：ACTIVE。F-4出撃＋1/);
  assert.match(css, /\.radar-result/);
  assert.match(game, /setActiveEffect\("scan"\)/);
  assert.match(game, /activeEffect === "impact" \? "shake"/);
  assert.doesNotMatch(game, /active\.length \? "shake"/);
});

test("enemy passive sonar uses the same four-cell listening area and result overlay", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(game, /setActive\(decision\.weapon === "radar" \? radarCells\(decision\.targets\[0\]\) : decision\.targets\)/);
  assert.match(game, /sleep\(decision\.weapon === "radar" \? 800 : 750\)/);
  assert.match(game, /setRadarAlert\(\{ contact, hostile: true \}\)/);
  assert.match(game, /HOSTILE SONAR CONTACT/);
  assert.match(game, /FLEET DETECTED/);
  assert.match(game, /敵聴音が自軍艦隊を捕捉/);
});

test("cruiser straddle rotates without adding a ninth mobile command", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/game/engine.ts", import.meta.url), "utf8");
  assert.match(game, /const \[attackOrientation, setAttackOrientation\] = useState<Orientation>\("north"\)/);
  assert.match(game, /STRADDLE_ORIENTATIONS\[\(currentIndex \+ 1\) % STRADDLE_ORIENTATIONS\.length\]/);
  assert.doesNotMatch(game, /valid\.includes\(candidate\)/);
  assert.match(game, /散布界が盤外です。90°回転または照準変更/);
  assert.match(game, /picked\.length && sameCoord\(picked\[0\], coord\)[\s\S]*?rotateStraddleAim\(\)/);
  assert.match(game, /nextWeapon === "sparrow" && weapon === "sparrow"\) \{[\s\S]*?rotateStraddleAim\(\)/);
  assert.match(game, /phase === "player" && weapon === "sparrow"\) rotateStraddleAim\(\)/);
  assert.match(engine, /export function straddleCells/);
  assert.match(game, /8-INCH STRADDLE/);
  assert.match(game, /PASSIVE SONAR/);
  assert.match(game, /HULL DATA MASKED/);
  assert.doesNotMatch(game, /SEA SPARROW|SPS-10/);
});

test("tactics identification masks contacts and marks critical sections", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../app/game/Renderer.ts", import.meta.url), "utf8");
  assert.match(game, /UNKNOWN CONTACT/);
  assert.match(game, /SIGNATURE UNKNOWN/);
  assert.match(game, /VITAL COMPARTMENT HIT/);
  assert.match(game, /HULL DATA MASKED/);
  assert.match(game, /definition\.name \+ " \/ IDENTIFIED"/);
  assert.match(renderer, /drawCritical/);
  assert.match(renderer, /drawIdentification/);
});

test("hostile identification remains until review confirmation and mobile confirm aligns right", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /identificationTimer\.current = hostile \? null : setTimeout/);
  assert.match(game, /const continueToPlayer = \(\) => \{[\s\S]*?setIdentificationAlert\(null\);[\s\S]*?setPhase\("player"\);/);
  assert.match(game, /hostile persistent/);
  assert.match(css, /\.identification-alert\.persistent/);
  assert.match(css, /orientation:portrait[\s\S]*?\.turn-review \.review-confirm \{ width:min\(72%,280px\); min-width:0; justify-self:end; \}/);
});

test("submarine wakes are emitted only after that submarine side acts", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const enemyTurn = game.slice(game.indexOf("const enemyTurn"), game.indexOf("const continueToPlayer"));
  const playerAttack = game.slice(game.indexOf("const resolvePlayerAttack"), game.indexOf("const targetRequirement"));
  const confirmAction = game.slice(game.indexOf("const confirmAction"), game.indexOf("const cancelAim"));
  assert.match(enemyTurn, /emitEnemySubmarineWake\(decision\.actor\)/);
  assert.doesNotMatch(enemyTurn, /emitPlayerSubmarineWake\(\)/);
  assert.match(playerAttack, /emitPlayerSubmarineWake\(\)/);
  assert.doesNotMatch(playerAttack, /emitEnemySubmarineWake\(\)/);
  assert.match(confirmAction, /emitPlayerSubmarineWake\(\)/);
});

test("responsive command surfaces cover iPhone portrait and full-HD play", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /className="desktop-command-rail"/);
  assert.match(game, /className="placement-tools rail-placement-tools"/);
  assert.match(game, /renderPlacementControls\("rail"\)/);
  assert.match(game, /className="placement-tools compact-placement-bottom"/);
  assert.match(game, /SYSTEM STATUS/);
  assert.match(game, /VESSEL DATA/);
  assert.match(game, /確認完了/);
  assert.match(css, /\.desktop-command-rail \{ display:none; \}/);
  assert.match(css, /@media \(min-width:960px\) and \(orientation:landscape\)/);
  assert.match(css, /\.combat-workspace\.active \{ display:grid; grid-template-columns:minmax\(0,1fr\) clamp\(286px,24vw,326px\)/);
  assert.match(css, /\.rail-placement-tools \{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.compact-command-bottom,\.compact-placement-bottom \{ display:none!important; \}/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.placement-tools \{[\s\S]*?position:sticky/);
  assert.match(css, /\.command-deck \{ position:relative; \}/);
  assert.match(css, /\.weapon-peek \{[\s\S]*?position:absolute/);
  assert.match(css, /orientation:portrait[\s\S]*?\.turn-review \{ position:fixed;[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(138px,44%\)/);
});

test("survival SEA BAT and escort link are explained in the interface", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const campaign = await readFile(new URL("../app/game/Campaign.ts", import.meta.url), "utf8");
  assert.match(campaign, /SURVIVAL_STAGE_FIVE_FLEET/);
  assert.match(campaign, /SEA BAT/);
  assert.match(game, /EMERGENCY DIVE/);
  assert.match(game, /ENEMY SILENT RUNNING/);
  assert.match(game, /護衛艦の全区画を空母へ上下左右で隣接/);
  assert.match(game, /LINK ACTIVE/);
  assert.match(game, /FIRE CONTROL LINK：ACTIVE。HARPOON発射＋1/);
  assert.match(game, /DUAL SUPPORT LINK：ACTIVE。F-4出撃＋1 \/ HARPOON発射＋1/);
  assert.match(game, /双方への同時リンクも成立/);
});

test("battle log drawer and victory battlefield review remain accessible", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /バトルログを開く/);
  assert.match(game, /className="log-drawer"/);
  assert.match(game, /TACTICAL PLOT REVIEW/);
  assert.match(game, /結果画面へ戻る/);
  assert.doesNotMatch(game, /slice\(-40\)/);
  assert.match(game, /FULL OPERATION LOG/);
  assert.match(game, /CIC戦闘経過記録/);
  assert.match(game, /＝ STAGE \$\{stage\.id\} \/ \$\{stageAttemptRef/);
  assert.match(game, /＝ REARM & REPAIR \/ 修復・再補給 ＝/);
  assert.match(game, /戦果：敵\$\{enemySunk\}艦撃沈/);
  assert.match(game, /LOST_CAPABILITY\[struckShip\.id\]/);
  assert.match(game, /coordName\(result\.coord\)/);
  assert.match(css, /\.battle-log ol \{ max-height:76px;[\s\S]*?overflow-y:auto/);
  assert.match(css, /\.log-drawer li\.stage-start/);
  assert.match(css, /font-weight:800/);
  assert.match(css, /\.mobile-field-switch \.mobile-switch-utilities \{[\s\S]*?repeat\(3,44px\)/);
  assert.match(css, /\.result-review-bar/);
});

test("CIC logs use Zulu timestamps and defeat unlocks factual post-action intelligence", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /CIC EVENT LOG \/ ZULU TIME \/ ENTRIES/);
  assert.match(game, /<time>\{formatZulu\(entry\.at\)\}<\/time>/);
  assert.match(game, /総員戦闘配置。/);
  assert.match(game, /自軍艦隊、戦闘能力喪失。/);
  assert.match(game, /作戦続行不能。交戦終了、作戦中止。/);
  assert.match(game, /COMMAND ASSESSMENT/);
  assert.match(game, /POST-ENGAGEMENT INTELLIGENCE/);
  assert.match(game, /交戦後解析：敵配置確認/);
  assert.match(game, /revealShips: phase === "defeat" && resultReview/);
  assert.match(game, /concealDamage: identificationRules && !\(phase === "defeat" && resultReview\)/);
  assert.match(css, /\.command-assessment/);
  assert.match(css, /\.operation-time/);
});
