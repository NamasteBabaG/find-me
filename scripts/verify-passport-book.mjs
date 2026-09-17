// Local-only visual/interaction gate. Connect to the agent-browser fixture session.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const endpoint = process.argv[2];
if (!endpoint?.startsWith("ws://127.0.0.1:")) throw new Error("Local browser endpoint required");
const socket = new WebSocket(endpoint), pending = new Map(); let serial = 0;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.onmessage = ({ data }) => { const msg = JSON.parse(data), job = pending.get(msg.id); if (job) { pending.delete(msg.id); msg.error ? job.reject(new Error(msg.error.message)) : job.resolve(msg.result); } };
function send(method, params = {}, sessionId) { return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir("output/passport", { recursive: true });
const evidence = [];
try {
  const { targetInfos } = await send("Target.getTargets");
  const target = targetInfos.find(t => t.type === "page" && t.url.startsWith("http://localhost:3022/family/") && t.url.endsWith("/passport"));
  assert.ok(target);
  const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const read = async expression => (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  async function click(selector) {
    const p = await read(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert.ok(p, selector); await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", clickCount: 1 }); await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", clickCount: 1 });
  }
  const shot = async name => { const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(`output/passport/${name}.png`, Buffer.from(data, "base64")); };
  const metrics = () => read(`(()=>{const b=document.querySelector('.travel-passport__book'),c=document.querySelector('.travel-passport__cover');return{height:(b??c).getBoundingClientRect().height,vertical:Math.max(0,document.documentElement.scrollHeight-innerHeight),horizontal:Math.max(0,document.documentElement.scrollWidth-innerWidth),title:document.querySelector('.travel-passport__page-head h2')?.textContent,columns:document.querySelector('.travel-passport__spread')?getComputedStyle(document.querySelector('.travel-passport__spread')).gridTemplateColumns:null}})()`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  if (await read('document.querySelector(".travel-passport").dataset.open==="true"')) { await click(".travel-passport__toolbar > button"); }
  await pause(100);
  const cover = await metrics(); assert.equal(cover.vertical, 0); await shot("book-cover-final");
  await click(".travel-passport__cover > button"); await pause(110);
  assert.ok(await read('document.querySelector(".travel-passport__opening-cover") && getComputedStyle(document.querySelector(".travel-passport__opening-cover")).transform!=="none"'));
  await shot("book-opening-motion"); await pause(1000);
  const opened = await metrics(); assert.equal(opened.height, cover.height); assert.equal(opened.vertical, 0); assert.equal(opened.horizontal, 0);
  evidence.push({ viewport: "1366x768", coverHeight: cover.height, openHeight: opened.height, vertical: opened.vertical, horizontal: opened.horizontal, openingAnimation: true });
  await click('.travel-passport__places button:nth-child(2)'); await pause(1000);
  await read('Promise.all(Array.from(document.querySelectorAll(".travel-passport__page img")).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;setTimeout(r,5000)})))');
  await shot("book-desktop-final");
  const beforeDetail = await metrics(); await click('.travel-passport__items li:first-child button'); await pause(100);
  assert.ok(await read('Boolean(document.querySelector(".travel-passport__zoom[open]"))')); await shot("book-detail-final");
  await click(".travel-passport__zoom > button"); assert.equal((await metrics()).height, beforeDetail.height);
  await click('.travel-passport__edge--next'); await pause(180); await shot("book-turn-motion"); await pause(700);
  await click('.travel-passport__edge--previous'); await pause(700);
  for (const [width, height] of [[390, 844], [360, 740], [360, 640]]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await pause(100);
    const m = await metrics(); assert.equal(m.title, "מקום הדגמה 2"); assert.equal(m.horizontal, 0);
    assert.ok(await read('(()=>{const b=document.querySelector(".travel-passport__book").getBoundingClientRect();return Array.from(document.querySelectorAll(".travel-passport__items button")).every(e=>e.getBoundingClientRect().bottom<=b.bottom-3)})()'), "No sticker or label may spill outside the paper");
    if (height >= 740) assert.equal(m.vertical, 0); else assert.ok(m.vertical < 130, "Smallest screens may need only a short vertical scroll");
    await read('scrollTo(0,0)'); await shot(`book-mobile-${width}x${height}`); evidence.push({ viewport: `${width}x${height}`, ...m });
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  const mobileOpen = await metrics(); await click(".travel-passport__toolbar > button"); assert.equal((await metrics()).height, mobileOpen.height);
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); await pause(100);
  await click(".travel-passport__cover > button");
  assert.equal(await read('Boolean(document.querySelector(".travel-passport__opening-cover"))'), false);
  await cdp("Emulation.setEmulatedMedia", { features: [] });
  assert.equal(await read('Boolean(document.querySelector("[data-nextjs-dialog]"))'), false);
  await writeFile("output/passport/book-browser-evidence.json", JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} finally { socket.close(); }
