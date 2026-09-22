/** Real pointer play of one already-open private pilot board. No injected store
 * events, API progress writes or localStorage seeding. Coordinates come from
 * reviewed visible pixels and the CURRENT displayed stage bounds. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2), journeyRefresh = args[0] === "--journey-refresh", twoWorlds = args[0] === "--two-worlds";
if (journeyRefresh || twoWorlds) args.shift();
const [slug, session = "magic-bar-owner"] = args;
const browser = process.env.BROWSER_CLI;
if (!browser) throw Error("BROWSER_CLI must point to the installed agent-browser executable");
const dir = twoWorlds ? "storage/two-worlds-bar-20260919" : journeyRefresh ? "storage/journey-refresh-bar-20260919" : "storage/magic-bar-20260918", inputs = JSON.parse(readFileSync(`${dir}/${twoWorlds ? 'playtest-inputs' : 'inputs'}.json`));
const outputDir = twoWorlds ? "output/two-worlds-20260919/playtest" : journeyRefresh ? "output/journey-refresh-preflight-20260919" : "output/magic-pilot-preflight-20260918";
const board = inputs.boards.find(b => b.board.board === slug)?.board;
const plan = inputs.catalog.boards.find(b => b.boardSlug === slug);
const review = twoWorlds ? inputs : JSON.parse(readFileSync(`${dir}/final-review.json`));
if (!board || !plan) throw Error("Unknown pilot board");
function run(...args) {
  const reply = JSON.parse(execFileSync(browser, ["--session", session, "--json", ...args], { encoding: "utf8", timeout: 30000 }));
  if (!reply.success) throw Error(JSON.stringify(reply.error));
  return reply.data;
}
const evaluate = script => run("eval", script).result;
function tap(nx, ny) {
  // A portrait viewport intentionally covers the frame and pans within the
  // artwork. Reach off-screen evidence with real pointer drags, never by
  // changing the app's camera/store or granting a hidden target a synthetic tap.
  for (let step = 0; step < 8; step++) {
    const bounds = evaluate('({stage:document.querySelector(".stage").getBoundingClientRect().toJSON(),v:document.querySelector(".viewport").getBoundingClientRect().toJSON()})');
    const px = bounds.stage.x + nx * bounds.stage.width, py = bounds.stage.y + ny * bounds.stage.height;
    const v = bounds.v;
    if (px >= v.x + 65 && px <= v.right - 65 && py >= v.y + 110 && py <= v.bottom - 100) break;
    const dx = Math.max(-v.width * .55, Math.min(v.width * .55, v.x + v.width / 2 - px));
    const dy = Math.max(-v.height * .45, Math.min(v.height * .45, v.y + v.height / 2 - py));
    const sx = v.x + v.width / 2 - dx / 2, sy = v.y + v.height / 2 - dy / 2;
    run("mouse", "move", String(Math.round(sx)), String(Math.round(sy))); run("mouse", "down");
    run("mouse", "move", String(Math.round(sx + dx)), String(Math.round(sy + dy))); run("mouse", "up");
  }
  const b = evaluate('document.querySelector(".stage").getBoundingClientRect().toJSON()');
  const x = Math.round(b.x + nx * b.width), y = Math.round(b.y + ny * b.height);
  const point = evaluate(`({w:innerWidth,h:innerHeight,tag:document.elementFromPoint(${x},${y})?.className})`);
  if (x < 0 || y < 0 || x >= point.w || y >= point.h || !["stage__sprite", "stage__layer stage__base", "stage"].includes(point.tag)) throw Error(`Point covered or outside viewport: ${x},${y} ${point.tag}`);
  run("mouse", "move", String(x), String(y)); run("mouse", "down"); run("mouse", "up");
}
const report = { slug, session, discoveries: [], targets: [] };
if (!evaluate(`document.querySelector('.viewport')?.getAttribute('aria-label')`)?.includes(plan.name.he)) throw Error("Wrong live board");
run("wait", "3300");
for (const item of plan.discoveries) {
  const r = item.hitRect; tap(r.x + r.w / 2, r.y + r.h / 2); run("wait", "400");
  report.discoveries.push({ id: item.id, counter: evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")?.startsWith("תגליות:"))?.getAttribute("aria-label")') });
}
if (!report.discoveries.at(-1).counter?.includes("6 מתוך 6")) throw Error(`Six discovery clicks did not collect six: ${JSON.stringify(report.discoveries)}`);
for (let i = 0; i < 3; i++) {
  const alt = evaluate('document.querySelector(".stage__sprite")?.getAttribute("alt")');
  const index = Number(alt?.match(/\d+/)?.[0]) - 1, hide = board.hides[index];
  if (!hide) throw Error(`Missing visible child: ${alt}`);
  const raster=evaluate('(()=>{const i=document.querySelector(".stage__sprite");return {loaded:i?.complete,width:i?.naturalWidth,height:i?.naturalHeight}})()');
  if(!raster.loaded||raster.width!==512||raster.height!==768)throw Error(`Personal raster not decoded: ${hide.id}`);
  const g = review.hides[hide.id].geometry;
  tap((hide.left + g.headX) / 3840, (hide.top + g.headY) / 2160);
  run("wait", "3400");
  const found = Number(evaluate('document.querySelector(".scene")?.getAttribute("data-found-count")'));
  if (found !== i + 1) throw Error(`Actual child click failed: ${hide.id}, found=${found}`);
  report.targets.push({ id: hide.id, found });
}
report.snapshot = run("snapshot", "-i");
report.errors = run("errors");
report.overflow = evaluate('({x:document.documentElement.scrollWidth-innerWidth,y:document.documentElement.scrollHeight-innerHeight})');
mkdirSync(outputDir, { recursive: true });
const viewport = evaluate('innerWidth+"x"+innerHeight');
run("screenshot", path.resolve(`${outputDir}/${slug}-${viewport}-complete.png`));
writeFileSync(`${outputDir}/${slug}-${viewport}-browser.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
