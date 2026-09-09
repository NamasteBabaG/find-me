/**
 * Measure the board's OWN children next to each hide, so a slot's authored face
 * size can be checked against something real.
 *
 * This is the missing half of the scale question. `simple-peek.ts:43` draws the
 * child at `slot.faceHeightPx / observedFaceHeight` and the only guard is
 * `scale <= 1`, so a hand-typed number is rendered faithfully and every one of
 * the ten checks passes. Nothing compares her to the painting she stands in.
 *
 * The face regions already annotated on the boards cannot fill that gap: they
 * were traced by different hands, some tight rectangles and some generous
 * polygons including hat and hair, so their heights are not comparable even
 * within one board. This asks the strong reviewer for the one quantity that IS
 * on the same footing as `faceHeightPx` - eye-midpoint to chin of real upright
 * children at each hide's depth - and keeps its confidence and evidence.
 *
 * Source-blind: no inserted child, no desired size and no slot geometry are sent.
 *
 *   npx tsx scripts/board-scale-comparators.ts --spec=<operational spec> [--run]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { GenerationBudget } from "./generation-budget";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { LOW_CONTINUATION_POLICY_V2, LOW_CONTINUATION_ROOT_V2, LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS, LOW_CONTINUATION_PRIOR_LEDGERS } from "./fixed-low-continuation-policy";

const OUT_ROOT = "work/board-conditioned-engine-20260909/comparators";
const RESERVE_CENTS = 35;
const MIN_CONFIDENCE = 0.85;
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
function flag(name: string, fallback = ""): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const point = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() }).strict();
const reading = z.object({ point: point.nullable(), confidence: z.number().min(0).max(1), reason: z.string().min(1) }).strict();
const comparator = z.object({
  id: z.string().min(1), description: z.string().min(1), ageClass: z.enum(["child", "adult", "uncertain"]),
  sameDepthConfidence: z.number().min(0).max(1), posture: z.string(), uprightSuitable: z.boolean(),
  points: z.object({ eyeMidpoint: reading, chin: reading, leftSole: reading, rightSole: reading }).strict(), notes: z.string(),
}).strict();
/** Free-form prose that carries no measurement; the model returns it as a string
 *  or a list, and rejecting a paid answer over that would be absurd. */
const prose = z.union([z.string(), z.array(z.string())]).transform(v => Array.isArray(v) ? v.join(" ") : v);
const answerSchema = z.object({
  regions: z.array(z.object({ slotId: z.string().min(1), comparators: z.array(comparator).max(3), uncertainties: prose }).strict()),
  summary: prose,
}).strict();

async function main() {
  const specPath = flag("spec");
  if (!specPath) throw new Error("--spec is required");
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const input = (await loadBoardConditioningInputs(spec))[0]!;
  const boardId = input.boardId;
  mkdirSync(OUT_ROOT, { recursive: true });
  const faceOnly = process.argv.includes("--face-only");
  const outFile = path.join(OUT_ROOT, `${boardId}${faceOnly ? "-face-only" : ""}.json`);
  if (existsSync(outFile)) throw new Error(`${outFile} already exists; measured comparators are immutable`);

  const crops = await Promise.all(input.slots.map(async item => ({
    slotId: item.slot.id, window: item.slot.window,
    bytes: await sharp(input.board.png).extract(item.slot.window).png().toBuffer(),
  })));
  const files = [
    { name: "board.png", bytes: await sharp(input.board.png).resize(1536, 1024).png().toBuffer() },
    ...crops.map((c, i) => ({ name: `crop-${i + 2}.png`, bytes: c.bytes })),
  ];
  const cropLines = crops.map((c, i) => `Image${i + 2} is a native ${c.window.width}x${c.window.height} crop for slot "${c.slotId}", whose origin on the full board is (${c.window.left},${c.window.top}).`).join(" ");
  const boardMeta = await sharp(input.board.png).metadata();
  const prompt = `One-time illustrated hidden-object BOARD measurement, NOT a render judge. You see ONLY original board artwork: no inserted child, no desired dimensions, no expected measurements and no source sprite. Image1 is the full board reduced from ${boardMeta.width}x${boardMeta.height} to 1536x1024 for context only. ${cropLines} Coordinates below are LOCAL PIXELS inside the crop they belong to, never normalized and never full-board coordinates.

${faceOnly
  ? `For EACH crop, select up to THREE existing CHILDREN standing or sitting close to the depth of that crop's own ground plane, whose eyes and chin are both clearly visible. Their feet, legs and body may be entirely hidden - this measurement is about FACE SIZE only, so a child behind a crate, a counter or a crowd is perfectly usable. Clearly distinguish children from adults and from different depth planes. Prefer faces turned near enough to frontal that both pupils are readable. Return fewer or zero comparators rather than inventing anatomy.

For EACH comparator, describe its clothing/hat/location so it is unambiguously findable. Measure the midpoint of its two visible pupil centres and the visible underside of its chin (excluding neck and collar). Leave leftSole and rightSole as point:null unless a sole genuinely is visible; they are not needed. Give every point an independent confidence 0..1 and a reason. A hidden or ambiguous point must be point:null; never infer a skull top or hidden anatomy. Do not use an exaggerated hat or hairstyle to measure face size. Do NOT calculate any desired inserted-child size, move a slot, or approve anything. We calculate all distances ourselves from your coordinates and inspect them.`
  : `For EACH crop, select up to THREE existing fully visible UPRIGHT STANDING children close to the depth of that crop's own ground plane. Clearly distinguish children from adults and from different depth planes. Do not use sitting, strongly crouching, airborne, cut-off or foot-occluded comparators. A mild natural lean or relaxed knees is acceptable only if you note it explicitly. Return fewer or zero comparators rather than inventing anatomy.

For EACH comparator, describe its clothing/hat/location so it is unambiguously findable. Measure the midpoint of its two visible pupil centres, the visible underside of its chin (excluding neck and collar), and the TWO lowest visible supporting boot or foot sole contacts. For a flat sole edge use its midpoint. Give every point an independent confidence 0..1 and a reason. A hidden or ambiguous point must be point:null; never infer a skull top or hidden legs. Do not use an exaggerated hat or hairstyle to measure face size. Do NOT calculate any desired inserted-child size, move a slot, or approve anything. We calculate all distances ourselves from your coordinates and inspect them.`}

Return JSON {regions:[{slotId:string, comparators:[{id,description,ageClass:'child'|'adult'|'uncertain',sameDepthConfidence:number,posture:string,uprightSuitable:boolean,points:{eyeMidpoint:{point:{x,y}|null,confidence,reason},chin:{...},leftSole:{...},rightSole:{...}},notes}],uncertainties}],summary}. Use exactly these slotId values in this order: ${crops.map(c => `"${c.slotId}"`).join(", ")}. Invent no figures. Coordinates must lie inside their own crop. Left/right are the depicted person's anatomical sides. This is source-blind measurement evidence only; self-reported confidence is not calibrated correctness.`;

  // A paid answer that a validator rejected is still a paid answer: the whole
  // parsed measurement is kept in the ledger, so it is re-validated from there
  // rather than bought a second time.
  if (process.argv.includes("--from-ledger")) {
    const ledger = JSON.parse(readFileSync(path.resolve(LOW_CONTINUATION_ROOT_V2, "budget/requests.json"), "utf8")) as
      { entries: { kind: string; state: string; cents: number; response?: Record<string, unknown> }[] };
    const key = `board-comparators:${boardId}${faceOnly ? ":face-only" : ""}`;
    const entry = ledger.entries.find(e => e.kind === key && e.state === "known");
    if (!entry?.response?.measurement) throw new Error(`No settled comparator answer for ${boardId} in the ledger`);
    writeComparators(input, crops, entry.response, outFile, sha(prompt), 0, faceOnly);
    return;
  }

  if (!process.argv.includes("--run")) {
    console.log(JSON.stringify({ status: "prepared-no-spend", boardId, crops: crops.map(c => ({ slotId: c.slotId, window: c.window })), promptSha256: sha(prompt) }, null, 2));
    return;
  }

  if (!process.env.OPENAI_API_KEY && existsSync(".env")) {
    const m = /^OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/m.exec(readFileSync(".env", "utf8"));
    if (m?.[1]) process.env.OPENAI_API_KEY = m[1];
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Existing API credential unavailable");

  const budget = new GenerationBudget(path.resolve(LOW_CONTINUATION_ROOT_V2, "budget"), LOW_CONTINUATION_POLICY_V2.limitCents, LOW_CONTINUATION_POLICY_V2);
  if (budget.held) throw new Error("Unresolved prior charge; reconcile before spending");
  const prior = LOW_CONTINUATION_PRIOR_LEDGERS.reduce((total, file) => existsSync(file) ? total + (Number(JSON.parse(readFileSync(file, "utf8")).spentCents) || 0) : total, 0);
  const committed = prior + budget.spent;
  if (committed + RESERVE_CENTS > LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS) {
    throw new Error(`CUMULATIVE_STOP: ${committed.toFixed(4)} of ${LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS} cents committed; ${RESERVE_CENTS} more would exceed the approved ceiling`);
  }

  const { judgeCharge } = await import("../src/infra/generation/judge");
  const answer = await budget.run(`board-comparators:${boardId}${faceOnly ? ":face-only" : ""}`, RESERVE_CENTS, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: LOW_CONTINUATION_POLICY_V2.judgeModel, reasoning_effort: "high", max_completion_tokens: 8000,
          service_tier: "default", store: false, response_format: { type: "json_object" },
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...files.map(f => ({ type: "image_url", image_url: { url: `data:image/png;base64,${f.bytes.toString("base64")}`, detail: "high" } }))] }] }),
      });
      const wire = await response.text();
      let data;
      try { data = JSON.parse(wire); } catch {
        return { costCents: 0, costUnknown: true, status: "unreadable-response", httpStatus: response.status,
          requestId: response.headers.get("x-request-id"), responseId: null, model: null, serviceTier: null,
          rawUsage: null, responseText: null, measurement: null, costBasis: "conservative-upper-estimate", attempts: 1 };
      }
      const bill = judgeCharge(data.model ?? "", data.usage);
      const usageValid = data.usage && Number.isSafeInteger(data.usage.prompt_tokens) && data.usage.prompt_tokens > 0 && Number.isSafeInteger(data.usage.completion_tokens) && data.usage.completion_tokens > 0;
      const known = !bill.costUnknown && usageValid && data.model === LOW_CONTINUATION_POLICY_V2.judgeModel && (!data.service_tier || data.service_tier === "default");
      const content = data.choices?.[0]?.message?.content;
      let measurement: unknown = null;
      try { measurement = JSON.parse(content ?? ""); } catch { /* the bill stands even when the answer is unusable */ }
      return { ...bill, costUnknown: !known,
        status: response.ok && data.choices?.length === 1 && data.choices[0].finish_reason === "stop" && !data.choices[0].message?.refusal && measurement ? "measured-not-approved" : "invalid-response",
        requestId: response.headers.get("x-request-id"), responseId: data.id, httpStatus: response.status, model: data.model,
        serviceTier: data.service_tier, rawUsage: data.usage, responseText: content, measurement, costBasis: "conservative-upper-estimate", attempts: 1 };
    } finally { clearTimeout(timer); }
  });

  writeComparators(input, crops, answer, outFile, sha(prompt), prior + budget.spent, faceOnly);
}

type Crop = { slotId: string; window: { left: number; top: number; width: number; height: number } };

function writeComparators(
  input: Awaited<ReturnType<typeof loadBoardConditioningInputs>>[number],
  crops: Crop[],
  answer: Record<string, unknown>,
  outFile: string,
  promptSha256: string,
  committed: number,
  faceOnly: boolean,
): void {
  if (answer.status !== "measured-not-approved") throw new Error(`Measurement unusable (${answer.status}); the charge is recorded, nothing was inferred`);
  const parsed = answerSchema.parse(answer.measurement);
  const rows = [];
  for (const region of parsed.regions) {
    const crop = crops.find(c => c.slotId === region.slotId);
    if (!crop) throw new Error(`Answer names a slot this board did not send: ${region.slotId}`);
    for (const c of region.comparators) {
      const { eyeMidpoint: e, chin: ch, leftSole: l, rightSole: r } = c.points;
      const inside = (p: { x: number; y: number } | null) => !p || (p.x <= crop.window.width && p.y <= crop.window.height);
      if (![e, ch, l, r].every(p => inside(p.point))) throw new Error(`Comparator ${c.id} places a point outside its crop`);
      if (!e.point || !ch.point) { rows.push({ slotId: region.slotId, id: c.id, eligible: false, reason: "No visible face measurement" }); continue; }
      if (ch.point.y <= e.point.y) throw new Error(`Comparator ${c.id} has reversed face geometry`);
      const faceDistancePx = Math.hypot(ch.point.x - e.point.x, ch.point.y - e.point.y);
      const soles = l.point && r.point ? { x: (l.point.x + r.point.x) / 2, y: (l.point.y + r.point.y) / 2 } : null;
      const minConfidence = Math.min(c.sameDepthConfidence, ...Object.values(c.points).map(p => p.confidence));
      const faceConfidence = Math.min(c.sameDepthConfidence, e.confidence, ch.confidence);
      // Soles are irrelevant to a face-size comparator; requiring them is what
      // left six of nine hides with nothing to measure against.
      const eligible = c.ageClass === "child" && (faceOnly ? faceConfidence : minConfidence) >= MIN_CONFIDENCE && (faceOnly || c.uprightSuitable);
      rows.push({ slotId: region.slotId, id: c.id, description: c.description, posture: c.posture,
        faceDistancePx, eyeToSolePx: soles ? Math.hypot(soles.x - e.point.x, soles.y - e.point.y) : null,
        minConfidence, faceConfidence, eligible, reason: eligible ? "Passes the confidence gate; still not a human label" : "Retained as diagnostic evidence only" });
    }
  }
  const record = {
    version: "board-scale-comparators/v1", mode: faceOnly ? "face-only" : "standing-with-soles", boardId: input.boardId, measuredAt: new Date().toISOString(),
    boardSha256: sha(input.board.png), promptSha256, minConfidence: MIN_CONFIDENCE,
    evidence: { requestId: answer.requestId, responseId: answer.responseId, model: answer.model, costCents: answer.costCents, costUnknown: answer.costUnknown, rawUsage: answer.rawUsage },
    windows: crops.map(c => ({ slotId: c.slotId, window: c.window })),
    comparators: rows, summary: parsed.summary,
    note: "Source-blind measurement of the board's own children. Not an approval of any placement.",
  };
  writeFileSync(outFile, JSON.stringify(record, null, 2));
  const eligible = rows.filter(r => r.eligible);
  console.log(JSON.stringify({ outFile, comparators: rows.length, eligible: eligible.length, costCents: answer.costCents,
    cumulativeCommittedCents: Number(committed.toFixed(4)), cumulativeRemainingCents: Number((LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS - committed).toFixed(4)) }, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
