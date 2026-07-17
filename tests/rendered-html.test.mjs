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
