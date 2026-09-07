/** OFFLINE authoring pilot only. Never modifies the catalog or renders a child.
 * --run explicitly authorizes calls under the linked pilot's $5 reasoning-layer cap.
 * No automatic retries, immutable attempts, no fallback model, no child photo.
 * npx tsx scripts/plan-fixed-slots.ts <fresh-output-dir> [--run] [--prior=<previous-run-dir>] [--scenes=paris,greatwall]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { envKey } from "./slot-patch";

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" }, num = { type: "number" };
const point = obj({ x: num, y: num });
const box = obj({ x: num, y: num, w: num, h: num });
const slot = obj({ id: str, landmark: str, pose: str, fullBodyBoxAge8: box, visibleFaceBox: box,
  supportPoint: point, supportDescription: str, occlusion: str, foregroundPolygon: { type: "array", items: point },
  nearbyChildBox: box, nearbyAdultBox: box, scaleRationale: str,
  ageBands: obj({ age2to4: str, age5to7: str, age8to10: str }),
  anatomyInstructions: str, extractionInstructions: str, collisionRisks: str, confidence: num });
const schema = obj({ scene: str, coordinateSystem: str, boardConcerns: str, slots: { type: "array", items: slot } });

export function schemaForScene(slug: string) {
  if (!["paris", "greatwall"].includes(slug)) throw new Error("Unknown pilot scene");
  return { ...schema, properties: { ...schema.properties, scene: { type: "string", enum: [slug] } } };
}

export function validatePlan(plan: any, slug: string) {
  if (plan.scene !== slug) throw new Error("Scene must be the exact requested slug");
  if (plan.slots?.length !== 3 || new Set(plan.slots.map((s: any) => s.id)).size !== 3 || plan.slots.some((s: any) => !["1", "2", "3"].includes(s.id))) throw new Error("Expected exactly three unique proposals numbered 1,2,3");
  const unit = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  for (const s of plan.slots) {
    for (const b of [s.fullBodyBoxAge8, s.visibleFaceBox, s.nearbyChildBox, s.nearbyAdultBox]) {
      if (![b.x, b.y, b.w, b.h].every(unit) || b.w <= 0 || b.h <= 0 || b.x + b.w > 1 || b.y + b.h > 1) throw new Error("Invalid normalized box");
    }
    if (![s.supportPoint.x, s.supportPoint.y, s.confidence].every(unit)) throw new Error("Invalid point/confidence");
    if (s.foregroundPolygon.length > 0 && s.foregroundPolygon.length < 3) throw new Error("Invalid polygon");
    for (const p of s.foregroundPolygon) if (![p.x, p.y].every(unit)) throw new Error("Invalid polygon");
    const f = s.visibleFaceBox, b = s.fullBodyBoxAge8;
    if (f.x < b.x || f.y < b.y || f.x + f.w > b.x + b.w + 0.001 || f.y + f.h > b.y + b.h + 0.001) throw new Error("Face lies outside planned body");
    if (s.supportPoint.x < b.x || s.supportPoint.x > b.x + b.w || s.supportPoint.y < b.y || s.supportPoint.y > b.y + b.h) throw new Error("Support point lies outside planned body");
  }
}

async function main() {
  const dirArg = process.argv[2];
  if (!dirArg || dirArg.startsWith("--")) throw new Error("Specify a fresh output directory");
  const dir = path.resolve(dirArg);
  if (existsSync(dir)) throw new Error("Use a fresh run directory. No append/overwrite/retry.");
  const paid = process.argv.includes("--run"), model = "gpt-6-astra";
  const capUsd = 5, reserveUsd = 1.5, maxOutput = 24000;
  // The fixed three-image request used 7,603 input tokens in the saved pilot.
  // Allow more than 3x that (24k), priced as cache-WRITE at $12.5/M,
  // plus the full 24k reasoning+text output cap at $50/M. Inputs are one 1536px
  // overview and two <=1536px crops, not unlimited images or prompts.
  const priorArg = process.argv.find(a => a.startsWith("--prior="))?.slice(8);
  let accountedUsd = 0;
  const priorEvidence = [];
  if (priorArg) {
    const prior = path.resolve(priorArg);
    for (const slug of ["paris", "greatwall"]) {
      const reservationFile = path.join(prior, slug, "reservation.json");
      if (!existsSync(reservationFile)) continue;
      const costFile = path.join(prior, slug, "cost.json");
      const record = JSON.parse(readFileSync(existsSync(costFile) ? costFile : reservationFile, "utf8"));
      const cost = record.costUnknown === false ? record.upperBoundUsd : record.accountedUsd ?? record.reserveUsd;
      if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) throw new Error("Invalid prior accounting");
      accountedUsd += cost;
      priorEvidence.push({ file: existsSync(costFile) ? costFile : reservationFile, sha256: hash(readFileSync(existsSync(costFile) ? costFile : reservationFile)), accountedUsd: cost });
    }
    // Includes any earlier linked attempts, not only the most recent directory.
    const priorRun = JSON.parse(readFileSync(path.join(prior, "run.json"), "utf8"));
    accountedUsd += priorRun.priorAccountedUsd ?? 0;
  }
  const priorAccountedUsd = accountedUsd;
  const key = paid ? envKey("OPENAI_API_KEY") : undefined;
  if (paid && !key) throw new Error("Existing OPENAI_API_KEY is unavailable");
  mkdirSync(dir, { recursive: true });
  const save = (name: string, data: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  save("run.json", { model, reasoning: "high", capUsd, reserveUsd, maxOutput, paid, priorAccountedUsd, priorEvidence, purpose: "candidate planning only; human approval and multi-identity rendered certification pending", pricingDate: "2026-09-07" });
  const scenes = (process.argv.find(a => a.startsWith("--scenes="))?.slice(9) ?? "paris,greatwall").split(",");
  if (!scenes.length || new Set(scenes).size !== scenes.length || scenes.some(s => !["paris", "greatwall"].includes(s))) throw new Error("Invalid pilot scene selection");
  for (const slug of scenes) {
    const scene = JSON.parse(readFileSync(`content/scenes/${slug}/scene.json`, "utf8"));
    const source = readFileSync(path.join("public", scene.art.base));
    if (hash(source) !== scene.art.sha256) throw new Error("Board changed");
    const cell = path.join(dir, slug); mkdirSync(cell);
    const write = (name: string, data: unknown) => save(`${slug}/${name}`, data);
    const views = [
      { label: "FULL BOARD: all coordinates in the answer refer to this whole board, normalized 0..1, origin TOP LEFT.", rect: { left: 0, top: 0, width: 3072, height: 2048 } },
      { label: "DETAIL LEFT LOWER: maps to whole-board x=0..0.5 and y=0.35..1. Do NOT return coordinates relative to this crop.", rect: { left: 0, top: 717, width: 1536, height: 1331 } },
      { label: "DETAIL RIGHT LOWER: maps to whole-board x=0.5..1 and y=0.35..1. Do NOT return coordinates relative to this crop.", rect: { left: 1536, top: 717, width: 1536, height: 1331 } },
    ];
    const prompt = `You are the senior environment artist and game designer planning FIXED insertion slots in a finished hidden-child board for ages 2-10. This is one-time preproduction, NOT permission to replace art. Board=${slug}. Choose THREE visually distinct, physically plausible positions in this exact image, with easy/medium/harder concealment. You may replace earlier landmark concepts; do not force a carousel, lantern or dragon location if unsafe. Prefer clean open support surfaces beside recognizable static props. Existing people/animals must remain completely untouched; no replacement of their face/body, no standing on people/dragons, no mixing limbs or floating head. Keep the face, eyes, nose and cheeks completely visible and opaque. If lower body is hidden, a complete plausible body MUST fit behind an actual existing object at that depth. A natural seated or kneeling pose is fine. Avoid difficult thin railings/hair-like occluders and tiny background locations. Use an 8-year-old child as size baseline, NOT a 20-year-old: relate perspective size to an existing child and adult at the SAME depth, cite their exact boxes. Return whole-body envelope including any hidden legs, face box, feet/seat support point, and polygon only if a real existing foreground object must overlap the child (otherwise []). Age 2-4 vs 5-7 vs 8-10 requires age-specific head/body proportions, not just uniform resizing. Crisp detailed identity-bearing features and clothing, warm clean illustrated storybook style, without speckled background noise or photorealism. Give semantic extraction instructions: isolate the generated CHILD silhouette; preserve solid face interior, exclude every original background pixel/prop, do not infer alpha from color difference. Explicitly explain potential collisions and uncertainty. Do not claim a location is certified without rendered on-board trials. Output exactly 3 proposals with ids 1,2,3. ALL geometry normalized to the FULL 3072x2048 board, top-left origin; nearbyChildBox and nearbyAdultBox must identify REAL existing figures used to calibrate perspective. Confidence is 0..1, not a quality guarantee.`;
    const content: any[] = [{ type: "input_text", text: prompt }];
    for (let i = 0; i < views.length; i++) {
      const v = views[i]!;
      const image = await sharp(source).extract(v.rect).resize({ width: 1536 }).jpeg({ quality: 90 }).toBuffer();
      writeFileSync(path.join(cell, `input-${i}.jpg`), image, { flag: "wx" });
      content.push({ type: "input_text", text: v.label }, { type: "input_image", image_url: `data:image/jpeg;base64,${image.toString("base64")}`, detail: "high" });
    }
    // Only fixed board artwork (no child reference) is sent. Retain the response
    // so a dropped local connection can be recovered by id without rebuying it.
    const request = { model, reasoning: { effort: "high" }, store: true, background: true, max_output_tokens: maxOutput,
      input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "fixed_slot_proposals", strict: true, schema: schemaForScene(slug) } } };
    write("request.json", request);
    write("input.json", { art: scene.art.base, artSha256: scene.art.sha256, sceneVersion: scene.version, sceneDefinitionSha256: hash(JSON.stringify(scene)), requestSha256: hash(JSON.stringify(request)), views });
    if (!paid) { console.log(`${slug}: free preparation complete`); continue; }
    if (accountedUsd + reserveUsd > capUsd) throw new Error("Pilot cap exceeded before call");
    write("reservation.json", { reserveUsd, accountedBeforeUsd: accountedUsd, createdAt: new Date().toISOString(), requestSha256: hash(JSON.stringify(request)) });
    accountedUsd += reserveUsd;
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(1_200_000) });
    } catch (e) {
      write("failure.json", { message: "Transport failed: charge unknown; reservation retained. No retry.", accountedUsd }); throw e;
    }
    const raw = await response.text();
    writeFileSync(path.join(cell, "start-response.json"), raw, { flag: "wx" });
    let r = JSON.parse(raw);
    write("start-http.json", { status: response.status, requestId: response.headers.get("x-request-id"), responseId: r.id ?? null });
    let polls = 0;
    while (response.ok && ["queued", "in_progress"].includes(r.status)) {
      if (!/^resp_[a-zA-Z0-9]+$/.test(r.id) || polls >= 120) throw new Error("Polling stopped; retrieve saved response id, NEVER resubmit");
      await new Promise(resolve => setTimeout(resolve, 30_000));
      response = await fetch(`https://api.openai.com/v1/responses/${r.id}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60_000) });
      const polled = await response.text();
      writeFileSync(path.join(cell, `poll-${String(++polls).padStart(3, "0")}.json`), polled, { flag: "wx" });
      r = JSON.parse(polled);
    }
    write("response.json", r);
    const u = r.usage;
    const http = { status: response.status, requestId: response.headers.get("x-request-id"), responseId: r.id ?? null, model: r.model ?? null };
    write("http.json", http);
    if (!response.ok || !u || !Number.isInteger(u.input_tokens) || !Number.isInteger(u.output_tokens) || u.input_tokens < 0 || u.output_tokens < 0) {
      write("cost.json", { ...http, costUnknown: true, accountedUsd: reserveUsd, note: "No valid usage; retain reservation and stop." }); throw new Error(`${slug}: HTTP/usage problem; no retry`);
    }
    // Report upper-bound accounting separately: cache-write/read breakdown may
    // differ. Do not present the conservative bound as exact invoice spend.
    const upperBoundUsd = u.input_tokens * 12.5 / 1e6 + u.output_tokens * 50 / 1e6;
    const standardNoCacheUsd = u.input_tokens * 10 / 1e6 + u.output_tokens * 50 / 1e6;
    accountedUsd += upperBoundUsd - reserveUsd;
    write("cost.json", { ...http, usage: u, costUnknown: false, upperBoundUsd, standardNoCacheUsd, exactInvoiceCostKnown: false });
    if (r.model !== model || u.input_tokens > 24000 || u.output_tokens > maxOutput || upperBoundUsd > reserveUsd || accountedUsd > capUsd) throw new Error("Unexpected model/token/cost bound; STOP");
    if (r.status !== "completed") throw new Error("Incomplete response; no automatic retry");
    const resultText = r.output.flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
    const plan = JSON.parse(resultText); write("proposal-unvalidated.json", plan);
    validatePlan(plan, slug); write("proposal.json", plan);
    console.log(`${slug}: 3 candidate positions, ${u.input_tokens} input + ${u.output_tokens} output tokens, cost upper bound $${upperBoundUsd.toFixed(5)}`);
  }
  save("summary.json", { accountedUsd, capUsd, paid, certified: false, installed: false });
}
if (process.argv[1] && path.basename(process.argv[1]) === "plan-fixed-slots.ts") {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Planner failed"); process.exitCode = 1; });
}
