// Supplement agent-browser with real Chromium touch input (not React state writes).
// Usage: node scripts/verify-passport-touch.mjs <agent-browser get cdp-url>
import assert from "node:assert/strict";
const endpoint = process.argv[2];
if (!endpoint?.startsWith("ws://127.0.0.1:")) throw new Error("Local browser endpoint required");
const socket = new WebSocket(endpoint), pending = new Map();
let serial = 0;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
socket.onmessage = ({ data }) => { const msg = JSON.parse(data); const waiter = pending.get(msg.id); if (waiter) { pending.delete(msg.id); msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result); } };
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const { targetInfos } = await send("Target.getTargets");
  const target = targetInfos.find(t => t.type === "page" && t.url.startsWith("http://localhost:3022/family/") && t.url.endsWith("/passport"));
  assert.ok(target, "Open the isolated fixture passport using agent-browser first");
  const { sessionId } = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  const read = async expression => (await cdp("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
  assert.equal(await read('innerWidth'), 390);
  assert.equal(await read('document.querySelector(".travel-passport").dir'), "rtl");
  const title = () => read('document.querySelector(".travel-passport__page-head h2").textContent');
  assert.equal(await title(), "מקום הדגמה 2");
  await read('document.querySelector(".travel-passport__photo").scrollIntoView({block:"center"})');
  const point = await read('(()=>{const r=document.querySelector(".travel-passport__photo").getBoundingClientRect();return {x:r.x+30,y:r.y+r.height/2}})()');
  async function swipe(x, y, dx, dy) {
    await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) { await cdp("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] }); await pause(20); }
    await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await pause(750);
  }
  await swipe(point.x, point.y, 165, 5);
  assert.equal(await title(), "מקום הדגמה 3", "Native rightward RTL swipe turns forward");
  assert.equal(await read('Boolean(document.querySelector(".travel-passport__zoom[open]"))'), false, "Swipe must not accidentally enlarge the photo");
  // A short viewport must never CLIP: what it cannot fit it must let you reach.
  // This used to demand that the document actually scroll, which was the old
  // layout's compromise — the page ran past the fold and scrolling was how you
  // got to the rest of it. Now that a place is half picture and half keepsakes
  // the whole leaf fits at 390x640, so there is nothing to scroll to. Assert
  // what the check is really for: the swipe does not turn the page, and no
  // content is stranded — either the page scrolls, or it already fits.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 640, deviceScaleFactor: 1, mobile: false });
  await read("scrollTo(0,0)");
  const beforeScroll = await read("scrollY");
  const scrollable = await read("document.documentElement.scrollHeight - innerHeight");
  await swipe(190, 580, 8, -180);
  assert.equal(await title(), "מקום הדגמה 3", "Vertical scrolling must not turn a page");
  if (scrollable > 0) assert.ok((await read("scrollY")) > beforeScroll + 50, "Native vertical scrolling remains available");
  else assert.ok(await read(`(()=>{const b=document.querySelector('.travel-passport__book').getBoundingClientRect();
    const reach=e=>{const r=e.getBoundingClientRect();return r.bottom<=b.bottom+0.5&&r.top>=b.top-0.5;};
    return [...document.querySelectorAll('.travel-passport__items button,.travel-passport__memory-actions > .fm-btn')].every(reach);})()`),
    "Nothing to scroll to, so every keepsake and action must already be on the paper");
  const overflow = await read("Math.max(0,document.documentElement.scrollWidth-innerWidth)");
  assert.equal(overflow, 0);
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  console.log(JSON.stringify({ nativeTouch: "pass", rtlForward: "2 → 3", accidentalZoom: false, verticalScroll: "pass", horizontalOverflow: overflow }));
} finally { socket.close(); }
