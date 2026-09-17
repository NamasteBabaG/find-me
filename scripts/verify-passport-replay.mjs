// Native browser inputs against the disposable fictional passport fixture only.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const endpoint = process.argv[2];
if (!endpoint?.startsWith("ws://127.0.0.1:")) throw new Error("Local browser required");
const fixture = JSON.parse(await readFile("output/passport/smoke-fixture.json", "utf8"));
assert.ok(fixture.directory.includes("Temp") && fixture.directory.includes("findme-passport-smoke-"));
const config = JSON.parse(await readFile("content/demo/beach-v1-game.json", "utf8")).he;
const socket = new WebSocket(endpoint), pending = new Map(); let serial = 0;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.onmessage = ({ data }) => { const m = JSON.parse(data), job = pending.get(m.id); if (job) { pending.delete(m.id); m.error ? job.reject(new Error(m.error.message)) : job.resolve(m.result); } };
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const { targetInfos } = await send("Target.getTargets");
  const target = targetInfos.find(t => t.type === "page" && t.url.startsWith("http://localhost:3022/family/"));
  assert.ok(target);
  const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const read = async expression => (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  async function wait(expression) { for (let i = 0; i < 100; i++) { if (await read(expression)) return; await pause(100); } throw new Error(`Timed out: ${expression}`); }
  async function click(x, y) { await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); }
  async function button(text) {
    const p = await read(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return null;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert.ok(p, text); await click(p.x,p.y);
  }
  const album = () => read(`fetch('/api/play/album?gameId=${fixture.gameId}').then(r=>r.json())`);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `http://localhost:3022/family/${fixture.childId}/play/${fixture.gameId}?board=example-place-3` });
  await wait(`Boolean([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='לשחק מחדש'))`);
  const before = await album(); assert.ok(before.ok);
  await button("לשחק מחדש");
  const clicked = [];
  for (let i = 0; i < 3; i++) {
    await wait(`Boolean(document.querySelector('.stage__target[data-found="false"]'))`);
    await pause(1200);
    const id = await read(`document.querySelector('.stage__target[data-found="false"]')?.dataset.target`);
    const targetConfig = config.scenes[0].targets.find(t => t.id === id); assert.ok(targetConfig);
    const rect = targetConfig.sprite.hitRect;
    const stage = await read(`document.querySelector('.stage').getBoundingClientRect().toJSON()`);
    await click(stage.x + (rect.x + rect.w / 2) * stage.width, stage.y + (rect.y + rect.h / 2) * stage.height);
    clicked.push(id);
    await wait(`!document.querySelector('.stage__target[data-target="${id}"][data-found="false"]')`);
  }
  assert.equal(new Set(clicked).size, 3);
  await wait(`Boolean(document.querySelector('.passport-finale[open][data-phase="settled"]'))`);
  assert.equal(await read(`document.querySelector('.passport-finale__stamp').dataset.new`), "false");
  assert.equal(await read(`document.querySelectorAll('.passport-finale__items [data-new="true"]').length`), 0);
  const after = await album(); assert.deepEqual(after.progress, before.progress);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  await writeFile("output/passport/replay-complete.png", Buffer.from(data, "base64"));
  await button("פותחים את הדרכון שלי");
  await wait(`Boolean(document.querySelector('.travel-passport__cover > button'))`);
  await button("פותחים את הדרכון שלי"); await pause(1000);
  const metrics = await read(`(()=>{const e=document.querySelector('.adventure-passport');return{scroll:e.scrollHeight-e.clientHeight,height:document.querySelector('.travel-passport__book').getBoundingClientRect().height}})()`);
  assert.equal(metrics.scroll, 0);
  const result = { replayed: clicked, duplicateFinds: false, repeatedStamp: false, accountProgressUnchanged: true, inGamePassport: metrics };
  await writeFile("output/passport/replay-browser-evidence.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { socket.close(); }
