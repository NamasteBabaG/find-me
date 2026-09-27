/** Bounded experimental harness, no new provider transport and no game writes.
 * Three fixed image keys + one review, all through retained purchaseOnce. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { LocalPatchBoardSchema, cropOf, maskForHide } from "../src/domain/scene/local-patch-hides";
import { localPatchPrompt } from "../src/services/generation/local-patch-prompt";
import { poseMask } from "../src/services/generation/local-patch-render";
import { composeBoundedLocalPatch } from "../src/services/generation/local-patch-seam";
import { buyLocalPatch, localPatchRenderPolicySha256, type LocalPatchRenderInput } from "../src/infra/generation/openai-local-patch";
import type { FixedSourcePolicy } from "../src/infra/generation/openai-fixed-source";
import { purchaseOnce } from "../src/services/generation/paid-operation";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository, type BudgetJson } from "../src/services/generation/world-budget";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { applyTestSchema } from "../src/lib/test-schema";
import { requestJudgeWire, localPatchBoardJudgeSettings } from "../src/services/generation/local-patch-judge";
import { judgeCharge, CURRENT_JUDGE_PRICING_VERSION } from "../src/infra/generation/judge";
import { PAINT_COMPARISON as S, comparisonArgs, preservationPrompt, FINISH_PROMPT, FINISH_HEAD_PATH, COMPARISON_REVIEW_PROMPT } from "./lib/board-paint-comparison";

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
function pin(file: string, bytes: Buffer | string) {
  if (existsSync(file)) { if (hash(readFileSync(file)) !== hash(bytes)) throw Error(`Pinned evidence changed: ${path.basename(file)}`); }
  else writeFileSync(file, bytes, { flag: "wx" });
}
async function main() {
  const { mode, variant } = comparisonArgs(process.argv.slice(2));
  const dir = path.resolve(S.storage), previous = path.resolve(S.baseline), prefix = `${S.hide}-attempt-1`;
  const inputBytes = readFileSync(path.join(previous, "inputs.json")), inputs = JSON.parse(inputBytes.toString());
  const board = LocalPatchBoardSchema.parse(inputs.boards[0].board), hide = board.hides.find(h => h.id === S.hide)!;
  const original = readFileSync(board.art), identity = readFileSync(path.join(previous, "identity-normalized.png"));
  const source = readFileSync(path.join(previous, `${prefix}-before.png`)), baseline = readFileSync(path.join(previous, `${prefix}.png`));
  const priorRequest = json(path.join(previous, `${prefix}-request.json`)), priorResult = json(path.join(previous, `${prefix}.json`));
  if (!hide || hash(original) !== inputs.boards[0].sourceSha256 || hash(identity) !== priorRequest.identitySha256
    || hash(source) !== priorRequest.styleSha256 || hash(baseline) !== priorResult.sha256 || hash(inputBytes) !== priorResult.inputsSha256) throw Error("Baseline evidence mismatch");
  const v12 = localPatchPrompt({ ground: board.ground, pose: hide.pose, ageYears: 5, wardrobe: board.wardrobe,
    placement: hide.placement, mask: maskForHide(hide), contentVersion: 10, hideId: hide.id, paintRecipe: "board-paint-v1" });
  if (v12 !== priorRequest.prompt) throw Error("Released v12 changed; do not buy a different baseline");
  const originalMask = await poseMask(hide);
  if (hash(originalMask) !== priorRequest.maskSha256) throw Error("Baseline mask changed");
  const alpha = await sharp(Buffer.from(`<svg width="512" height="768" xmlns="http://www.w3.org/2000/svg"><path d="${FINISH_HEAD_PATH}" fill="white"/></svg>`)).png().toBuffer();
  const finishMask = await sharp({ create: { width: 512, height: 768, channels: 4, background: 'black' } })
    .composite([{ input: alpha, blend: 'dest-out' }]).png().toBuffer();
  const low = inputs.policy as FixedSourcePolicy;
  if (low.quality !== 'low' || localPatchRenderPolicySha256(low) !== inputs.policyHash) throw Error("Baseline policy changed");
  // Non-portrait mode's existing transport normalizes its second image to 1024.
  // Pre-normalize once so captured hashes equal the actual style-only reference.
  const finishReference = await sharp(source).resize(1024, 1024, { fit: 'inside' }).png().toBuffer();
  const plans = S.variants.map(id => ({ id,
    recipe: id === 'a-medium' ? inputs.promptVersion : id === 'b-v13-low' ? 'experimental/v13-source-preservation-1' : 'experimental/face-finish-1',
    prompt: id === 'a-medium' ? v12 : id === 'b-v13-low' ? preservationPrompt(v12) : FINISH_PROMPT,
    stylePng: id === 'c-finish-low' ? baseline : source,
    identityPng: id === 'c-finish-low' ? finishReference : identity,
    maskPng: id === 'c-finish-low' ? finishMask : originalMask,
    referenceMode: id === 'c-finish-low' ? undefined : priorRequest.referenceMode as LocalPatchRenderInput['referenceMode'],
    policy: { ...low, quality: id === 'a-medium' ? 'medium' as const : 'low' as const },
  }));
  const manifest = { version: S.id, capMicroUsd: S.capMicroUsd, maxImages: 3, maxReviews: 1, hide: S.hide,
    baselineInputsSha256: hash(inputBytes), sourceSha256: hash(original), baselineSha256: hash(baseline),
    composition: 'A/B existing bounded compositor; C exact outside-head protection, no retouching inside',
    plans: plans.map(p => ({ id: p.id, recipe: p.recipe, prompt: p.prompt, policy: p.policy, policyHash: localPatchRenderPolicySha256(p.policy),
      styleSha256: hash(p.stylePng), identitySha256: hash(p.identityPng), maskSha256: hash(p.maskPng), referenceMode: p.referenceMode })),
  };
  mkdirSync(dir, { recursive: true });
  const manifestBytes = JSON.stringify(manifest, null, 2);
  pin(path.join(dir, 'inputs.json'), manifestBytes);
  for (const p of plans) for (const [name, bytes] of [['input', p.stylePng], ['reference', p.identityPng], ['mask', p.maskPng]] as const) pin(path.join(dir, `${p.id}-${name}.png`), bytes);
  if (mode === '--prepare') { console.log(JSON.stringify({ mode, dir, imageKeys: S.variants, paidCalls: 0 })); return; }
  if (mode === '--export') {
    const approved = readFileSync('output/bar-material-review-20260923/dragon-stool-style-proof-v2.png');
    const panels = [await sharp(approved).resize(512, 768).png().toBuffer(), baseline, ...S.variants.map(id => readFileSync(path.join(dir, `${id}.png`)))];
    writeFileSync(path.join(dir, 'comparison.png'), await sharp({ create: { width: 2560, height: 768, channels: 3, background: 'white' } })
      .composite(panels.map((input, i) => ({ input, left: i * 512, top: 0 }))).png().toBuffer());
    const before = await sharp(baseline).removeAlpha().raw().toBuffer();
    const after = await sharp(readFileSync(path.join(dir, 'c-finish-low.png'))).removeAlpha().raw().toBuffer();
    const opacity = await sharp(alpha).ensureAlpha().raw().toBuffer();
    let protectedChanges = 0, changedPixels = 0;
    for (let pixel = 0; pixel < 512 * 768; pixel++) {
      const changed = [0, 1, 2].some(c => before[pixel * 3 + c] !== after[pixel * 3 + c]);
      if (changed) { changedPixels++; if (opacity[pixel * 4 + 3] === 0) protectedChanges++; }
    }
    pin(path.join(dir, 'finish-scope-check.json'), JSON.stringify({ protectedChanges, changedPixels, expectedProtectedChanges: 0,
      note: 'Pixel preservation outside head only; NOT facial identity/pose validation.' }, null, 2));
    if (protectedChanges !== 0) throw Error('Finishing composition modified protected pixels');
    console.log(JSON.stringify({ mode, dir, order: ['approved', 'baseline-v12-low', ...S.variants], paidCalls: 0 })); return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Error('Load the existing approved key without displaying it');
  const dbFile = path.join(dir, 'purchases.sqlite'), fresh = !existsSync(dbFile);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replaceAll('\\', '/')}` } } });
  try {
    if (fresh) await applyTestSchema(db, process.cwd());
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const allowed = [...S.variants.map(id => `image:${id}:1`), 'review:comparison:1'];
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx, createRequest: async request => {
      if (id !== S.id || !allowed.includes(request.requestKey) || auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > S.capMicroUsd) throw new WorldBudgetError('cap_exceeded', 'Comparison scope/reservation ceiling');
      return tx.createRequest(request);
    } })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db);
    const saveBudget = async () => writeFileSync(path.join(dir, 'budget.json'), JSON.stringify({ ...(await ledger.audit(S.id)), sampleCeilingMicroUsd: S.capMicroUsd }, null, 2));
    if (mode === '--render') {
      const p = plans.find(p => p.id === variant)!;
      const requestKey = `image:${p.id}:1`, fingerprint = hash(JSON.stringify({ manifest: hash(manifestBytes), plan: manifest.plans.find(item => item.id === p.id) }));
      console.log(JSON.stringify({ phase: 'purchase', variant, recipe: p.recipe, quality: p.policy.quality }));
      const bought = await purchaseOnce({ ledger, store }, { worldId: S.id, requestKey, scope: 'image', operationFingerprint: fingerprint, reserveMicroUsd: 150_000,
        buy: async () => {
          const answer = await buyLocalPatch(key, { worldId: S.id, requestKey, prompt: p.prompt, stylePng: p.stylePng, identityPng: p.identityPng, maskPng: p.maskPng, referenceMode: p.referenceMode }, { policy: p.policy });
          const bytes = Buffer.from(JSON.stringify({ png: (answer.png ?? answer.quarantined)?.toString('base64') ?? null, rejected: answer.rejected }));
          return answer.evidence ? { bytes, evidence: answer.evidence } : { bytes, unknownReason: answer.unknownReason ?? 'Missing charge evidence' };
        } });
      await saveBudget();
      if (bought.kind !== 'bought') throw Error(`Stopped: ${bought.kind}; reconcile, never retry`);
      const retained = JSON.parse(bought.bytes.toString());
      if (!retained.png || retained.rejected) throw Error('Paid image refused; retained ledger preserves evidence, no retry');
      const raw = Buffer.from(retained.png, 'base64');
      pin(path.join(dir, `${p.id}-provider.png`), raw);
      const patch = await sharp(raw).resize(512, 768, { fit: 'fill' }).png().toBuffer();
      pin(path.join(dir, `${p.id}-raw.png`), patch);
      let result: Buffer, technical: unknown;
      if (p.id === 'c-finish-low') {
        const paintedHead = await sharp(patch).ensureAlpha().composite([{ input: alpha, blend: 'dest-in' }]).png().toBuffer();
        result = await sharp(baseline).composite([{ input: paintedHead }]).png().toBuffer();
        technical = { experimentalHeadOnlyComposition: true, inheritedBaselineDefects: true };
      } else {
        const boundedResult = await composeBoundedLocalPatch(await sharp(original).png().toBuffer(), cropOf(hide), patch, maskForHide(hide));
        result = await sharp(boundedResult.candidate).extract(cropOf(hide)).png().toBuffer();
        technical = { usable: boundedResult.usable, seam: boundedResult.report, compositionPermission: boundedResult.compositionPermission };
      }
      pin(path.join(dir, `${p.id}.png`), result);
      const full = await sharp(original).composite([{ input: result, left: hide.left, top: hide.top }]).png().toBuffer();
      pin(path.join(dir, `${p.id}-full-board.png`), full);
      pin(path.join(dir, `${p.id}-board-preview.webp`), await sharp(full).resize(1920).webp({ quality: 90 }).toBuffer());
      pin(path.join(dir, `${p.id}.json`), JSON.stringify({ variant: p.id, fingerprint, inputsSha256: hash(manifestBytes), sha256: hash(result), rawSha256: hash(raw), technical,
        chargeMicroUsd: bought.evidence.amountMicroUsd, costBasis: bought.evidence.costBasis, visualReview: 'pending' }, null, 2));
      console.log(JSON.stringify({ phase: 'retained', variant, chargeMicroUsd: bought.evidence.amountMicroUsd, replayed: bought.replayed }));
    } else {
      const approved = await sharp(readFileSync('output/bar-material-review-20260923/dragon-stool-style-proof-v2.png')).resize(512, 768).png().toBuffer();
      const images = [source, baseline, approved, identity];
      const imageLabels = ['SOURCE original scene crop', 'BASELINE v12 LOW already has extra dial and yellow outfit', 'APPROVED face paint reference, not identity source', 'PORTRAIT identity only'];
      for (const id of S.variants) {
        const bytes = readFileSync(path.join(dir, `${id}.png`)), receipt = json(path.join(dir, `${id}.json`));
        if (hash(bytes) !== receipt.sha256 || receipt.inputsSha256 !== hash(manifestBytes)) throw Error('Review binding mismatch');
        images.push(bytes, await sharp(readFileSync(path.join(dir, `${id}-full-board.png`))).resize(1536).png().toBuffer());
        imageLabels.push(`${id} NATIVE CROP`, `${id} FULL BOARD context, same appearance not another child`);
      }
      const settings = { ...localPatchBoardJudgeSettings(10), maxOutputTokens: 4000 };
      const evidence = { prompt: COMPARISON_REVIEW_PROMPT, imageLabels, imageHashes: images.map(hash), settings };
      pin(path.join(dir, 'review-request.json'), JSON.stringify(evidence, null, 2));
      const bought = await purchaseOnce({ ledger, store }, { worldId: S.id, requestKey: 'review:comparison:1', scope: 'judge', operationFingerprint: hash(JSON.stringify(evidence)), reserveMicroUsd: 100_000,
        buy: async () => {
          const reply = await requestJudgeWire(key, { prompt: COMPARISON_REVIEW_PROMPT, images, imageLabels, settings }, fetch);
          const bytes = Buffer.from(JSON.stringify(reply)), charge = judgeCharge(reply.model ?? '', reply.usage ?? undefined, CURRENT_JUDGE_PRICING_VERSION);
          return reply.costUnknown || charge.costUnknown || !reply.requestId ? { bytes, unknownReason: 'Unresolved review bill' }
            : { bytes, evidence: { providerNamespace: 'openai:find-me-existing', providerRequestId: reply.requestId, usageId: hash(JSON.stringify(reply.usage)), rawUsage: reply.usage as BudgetJson,
              model: reply.model!, amountMicroUsd: Math.ceil(charge.costCents * 10000), costBasis: 'conservative-upper-estimate' as const } };
        } });
      await saveBudget();
      if (bought.kind !== 'bought') throw Error(`Review stopped: ${bought.kind}`);
      const keep = JSON.parse(bought.bytes.toString());
      pin(path.join(dir, 'review-raw.json'), bought.bytes);
      const check = z.enum(['pass', 'fail', 'unsure']);
      const schema = z.object({ variants: z.array(z.object({ id: z.enum(S.variants), identity: check, faceFinish: check, sourceProps: check, sourceOutfit: check, anatomyScaleGround: check, inputPreserved: check, notes: z.array(z.string()) })).length(3), recommendation: z.enum([...S.variants, 'none']), reason: z.string() });
      const parsed = !keep.wireFault ? schema.safeParse(JSON.parse(keep.raw)) : null;
      const review = parsed?.success && new Set(parsed.data.variants.map(v => v.id)).size === 3 ? parsed.data : null;
      pin(path.join(dir, 'review.json'), JSON.stringify({ review, costMicroUsd: bought.evidence.amountMicroUsd, valid: !!review }, null, 2));
      console.log(JSON.stringify({ phase: 'reviewed', review, costMicroUsd: bought.evidence.amountMicroUsd }));
    }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Comparison stopped'); process.exitCode = 1; });
