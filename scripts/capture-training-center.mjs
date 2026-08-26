import { mkdir, writeFile } from "node:fs/promises";

const cdpPort = process.env.DBG_CDP_PORT ?? "9223";
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
const page = targets.find((target) => target.type === "page" && target.url.includes("4317"));
if (!page) throw new Error("Deep Blue Grid CDP page was not found.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
let requestId = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
};
await new Promise((resolve) => { socket.onopen = resolve; });
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++requestId;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
  return response.result?.result?.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickText = async (text) => {
  const clicked = await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.includes(${JSON.stringify(text)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) {
    const labels = await evaluate(`[...document.querySelectorAll("button")].map((button) => button.innerText)`);
    throw new Error(`Button containing ${text} was not found. Buttons: ${JSON.stringify(labels)}`);
  }
  await wait(650);
};
const capture = async (name, width, height, mobile) => {
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile,
    screenWidth: width, screenHeight: height,
  });
  await wait(350);
  const response = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(new URL(`../outputs/${name}`, import.meta.url), Buffer.from(response.result.data, "base64"));
};

await mkdir(new URL("../outputs/", import.meta.url), { recursive: true });
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 402, height: 874, deviceScaleFactor: 1, mobile: true,
  screenWidth: 402, screenHeight: 874,
});
await send("Page.navigate", { url: "http://localhost:4317/?debug=all" });
await wait(1200);
await clickText("INITIAL TRAINING");
await clickText("FLEET DEPLOYMENT");
await capture("training-center-402x874-scene1.png", 402, 874, true);
await evaluate(`document.querySelector(".briefing-controls button.primary")?.click()`);
await wait(250);
await evaluate(`[...document.querySelectorAll(".briefing-controls button")].find((button) => button.innerText.includes("動きをもう一度"))?.click()`);
await capture("training-placement-402x874-start.png", 402, 874, true);
await wait(1150);
await capture("training-placement-402x874-moving.png", 402, 874, true);
await wait(1300);
await capture("training-placement-402x874-rotated.png", 402, 874, true);
await capture("training-center-1366x768.png", 1366, 768, false);

const audit = await evaluate(`(() => {
  const console = document.querySelector(".presentation-center-stage .briefing-console")?.getBoundingClientRect();
  const viewport = { width: innerWidth, height: innerHeight };
  const buttons = [...document.querySelectorAll(".briefing-controls button")].map((button) => {
    const rect = button.getBoundingClientRect();
    return { text: button.innerText, width: rect.width, height: rect.height };
  });
  return { console: console && { left: console.left, top: console.top, right: console.right, bottom: console.bottom }, viewport, buttons };
})()`);
console.log(JSON.stringify(audit, null, 2));
socket.close();
