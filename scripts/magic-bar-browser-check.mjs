/** Real pointer play of one already-open private pilot board. No injected store
 * events, API progress writes or localStorage seeding. Coordinates come from
 * reviewed visible pixels and the CURRENT displayed stage bounds. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const [slug, session = "magic-bar-owner"] = process.argv.slice(2);
const browser = process.env.BROWSER_CLI;
if (!browser) throw Error("BROWSER_CLI must point to the installed agent-browser executable");
const dir = "storage/magic-bar-20260918", inputs = JSON.parse(readFileSync(`${dir}/inputs.json`));
const board = inputs.boards.find(b => b.board.board === slug)?.board;
const plan = inputs.catalog.boards.find(b => b.boardSlug === slug);
const review = JSON.parse(readFileSync(`${dir}/final-review.json`));
if (!board || !plan) throw Error("Unknown pilot board");
function run(...args) {
  const reply = JSON.parse(execFileSync(browser, ["--session", session, "--json", ...args], { encoding: "utf8", timeout: 30000 }));
  if (!reply.success) throw Error(JSON.stringify(reply.error));
  return reply.data;
}
const evaluate = script => run("eval", script).result;
function tap(nx, ny) {
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
mkdirSync("output/magic-pilot-preflight-20260918", { recursive: true });
run("screenshot", path.resolve(`output/magic-pilot-preflight-20260918/${slug}-complete.png`));
writeFileSync(`output/magic-pilot-preflight-20260918/${slug}-browser.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
