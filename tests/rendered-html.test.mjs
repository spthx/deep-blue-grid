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
  assert.match(html, /FLEET DEPLOY/);
  assert.match(html, /DIFFICULTY/);
  assert.match(html, /CASUAL/);
  assert.match(html, /TACTICS/);
  assert.match(html, /SURVIVAL/);
  assert.match(html, /IMPORTANT SECTION \/ 重要区画/);
  assert.match(html, /追加ダメージなし/);
  assert.match(html, /敵AIも同じ条件/);
  assert.doesNotMatch(html, /NORMAL|HARD|基本戦術・手加減なし/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("mobile command deck stays four columns by two rows", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test("returning from damage review resets the command to normal fire", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /const continueToPlayer = \(\) => \{\s*setWeapon\("fire"\);\s*setPicked\(\[\]\);/);
});

test("survival retries the current stage with its entering fleet", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /initStage\(stageIndex, "survival", survivalFleetRef\.current\)/);
  assert.match(source, /現在の残存艦隊で再配置/);
  assert.doesNotMatch(source, /RESTART SURVIVAL/);
});

test("placement uses explicit rotate and confirm controls", async () => {
  const source = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  assert.match(source, /placement-dock/);
  assert.match(source, /90°回転/);
  assert.match(source, /配置決定/);
  assert.doesNotMatch(source, /シルエットをタップして確定/);
});

test("radar contact and clear scans use restrained grid colors", async () => {
  const source = await readFile(new URL("../app/game/Renderer.ts", import.meta.url), "utf8");
  assert.match(source, /setLineDash\(\[cell\*\.11,cell\*\.075\]\)/);
  assert.match(source, /ctx\.arc\(px\+cell\*\.5,py\+cell\*\.5,cell\*\.31/);
  assert.match(source, /rgba\(76,151,133,\.13\)/);
  assert.match(source, /contactResolved/);
  assert.match(source, /board\.shots\[coord\.y\]\[coord\.x\]!=="unknown"/);
});

test("radar scan announces its binary result over the playfield", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(game, /radarAlert\.contact \? "CONTACT!" : "NO CONTACT"/);
  assert.match(game, /4区画内に敵影あり/);
  assert.match(game, /4区画内に敵影なし/);
  assert.match(game, /ESCORT SUPPORT：F-4出撃回数＋1/);
  assert.match(css, /\.radar-result/);
});

test("tactics identification masks contacts and marks critical sections", async () => {
  const game = await readFile(new URL("../app/game/DeepBlueGrid.tsx", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../app/game/Renderer.ts", import.meta.url), "utf8");
  assert.match(game, /UNKNOWN CONTACT/);
  assert.match(game, /SIGNATURE UNKNOWN/);
  assert.match(game, /IMPORTANT SECTION HIT/);
  assert.match(game, /IDENTIFIED \/ HULL DATA MASKED/);
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
  assert.match(css, /orientation: portrait[\s\S]*?\.turn-review \.review-confirm \{ width:min\(72%,280px\); min-width:0; justify-self:end; \}/);
});
