/** Explicit private candidate staging. Has no connection to the application DB. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { localPatchBoardForVersion } from '../src/domain/scene/local-patch-catalog';
import { cropOf, maskForHide } from '../src/domain/scene/local-patch-hides';
import { poseMask } from '../src/services/generation/local-patch-render';
import { prepareLocalPatchIdentityReferences } from '../src/services/generation/local-patch-identity-reference';
import { composeBoundedLocalPatch } from '../src/services/generation/local-patch-seam';
import { buyLocalPatch, localPatchRenderPolicySha256 } from '../src/infra/generation/openai-local-patch';
import { purchaseOnce } from '../src/services/generation/paid-operation';
import { WorldBudget, auditWorldBudget, type WorldBudgetRepository, type BudgetJson } from '../src/services/generation/world-budget';
import { requestJudgeWire, localPatchJudgeSettings, localPatchJudgePrompt } from '../src/services/generation/local-patch-judge';
import { judgeCharge } from '../src/infra/generation/judge';
import { PrismaWorldBudgetStore } from '../src/infra/db/prisma-world-budget-store';
import { CasWorldBudgetRepository } from '../src/infra/db/world-budget-repository';
import { PrismaRetainedPurchaseStore } from '../src/infra/db/prisma-retained-purchase-store';
import { applyTestSchema } from '../src/lib/test-schema';
import { inspectTerminalV10RepairSnapshot } from './lib/terminal-v10-repair-preflight';
import { TERMINAL_REPAIR, CENTERED_REPAIR, centeredRepairPrompt, assertCenteredRepairReservation, repairTarget, repairPrompt, assertRepairReservation } from './lib/terminal-v10-repair-request';
import { planTargetCenteredContext } from '../src/domain/scene/local-patch-context-plan';
import { composeReframedLocalPatch } from '../src/services/generation/local-patch-context';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const centered = process.argv[4] === '--centered';
const S = centered ? CENTERED_REPAIR : TERMINAL_REPAIR;
const dir = path.resolve(centered ? 'tmp/incident-yuval-centered-20260928' : 'tmp/incident-yuval-repair-20260928');
function pin(name: string, bytes: Buffer | string) {
  const file = path.join(dir, name);
  if (existsSync(file)) { if (sha(readFileSync(file)) !== sha(bytes)) throw Error('Immutable repair input/output changed'); }
  else writeFileSync(file, bytes, { flag: 'wx' });
}
async function main() {
  const [mode, slug, ...extra] = process.argv.slice(2);
  if (extra.length !== (centered ? 1 : 0) || !['--prepare', '--execute', '--review', '--replay-check'].includes(mode ?? '') || !S.targets.some(v => v === slug)) throw Error('Use --prepare|--execute|--review|--replay-check antarctica|giza [--centered]');
  const inventory = inspectTerminalV10RepairSnapshot(readFileSync('tmp/incident-review-rows.json', 'utf8'), S.snapshotSha256);
  const board = localPatchBoardForVersion(slug!, 10); if (!board) throw Error('Historical board unavailable');
  const hide = repairTarget(board), crop = cropOf(hide), source = readFileSync(board.art);
  const gallery = readJson('tmp/incident-yuval-review/manifest.json');
  const sourcePin = gallery.assets.find((a: { board: string; sourceSha256?: string }) => a.board === slug && a.sourceSha256);
  const composedPin = gallery.assets.find((a: { file: string }) => a.file === `${slug}-review.png`);
  const composed = readFileSync(`tmp/incident-yuval-review/${slug}-review.png`);
  if (sha(source) !== sourcePin?.sourceSha256 || sha(composed) !== composedPin?.sha256) throw Error('Historical review/source mismatch');
  const identityEnvelope = readJson('tmp/incident-repair-identity.json');
  if (identityEnvelope.id !== 'ast_yl7pmozkdan4a8v8cpu8' || identityEnvelope.mimeType !== 'image/png') throw Error('Identity binding mismatch');
  const identity = Buffer.from(identityEnvelope.bytes, 'base64');
  const refs = await prepareLocalPatchIdentityReferences(identity, 10);
  const contextPlan = centered ? planTargetCenteredContext(crop, maskForHide(hide), { width: 3840, height: 2160 }) : undefined;
  const target = await sharp(composed).extract(contextPlan?.provider ?? crop).png().toBuffer();
  const originalTarget = await sharp(composed).extract(crop).png().toBuffer();
  const mask = await poseMask(contextPlan ? { ...hide, mask: contextPlan.providerTarget } : hide);
  const prompt = contextPlan ? centeredRepairPrompt(board, contextPlan.providerTarget) : repairPrompt(board);
  const manifest = { version: S.version, authorization: centered ? 'owner-one-additional-Antarctica-image-plus-review-max-USD0.25-existing-key-20260928' : 'owner-two-failed-hides-one-image-each-plus-reviews-total-max-USD1-existing-key-20260928',
    scope: 'private-staged-candidate-NOT-live-retry-or-publication', slug, hide, crop, ageYears: 5,
    ...(contextPlan ? { contextPlan } : {}),
    snapshotSha256: inventory.snapshotSha256, preservedSha256: inventory.preservedSha256,
    sourceSha256: sha(source), composedSha256: sha(composed), identitySheetSha256: sha(identity), identitySha256: sha(refs.identityPng),
    styleSha256: sha(target), maskSha256: sha(mask), prompt, policy: S.policy,
    policySha256: localPatchRenderPolicySha256(S.policy), capMicroUsd: S.capMicroUsd };
  const serialized = JSON.stringify(manifest, null, 2), fingerprint = sha(serialized);
  mkdirSync(dir, { recursive: true });
  if (mode !== '--prepare' && !existsSync(path.join(dir, `${slug}-request.json`))) throw Error('Prepare and inspect before purchase');
  pin(`${slug}-request.json`, serialized); pin(`${slug}-source.png`, target); pin(`${slug}-mask.png`, mask); pin('identity.png', refs.identityPng);
  if (mode === '--prepare') { console.log(JSON.stringify({ mode, slug, fingerprint, paidCalls: 0 })); return; }
  // Read ONLY the owner-selected existing credential, in memory; never persist or print it.
  const replayOnly = mode === '--replay-check';
  const match = replayOnly ? null : /^OPENAI_API_KEY\s*=\s*(.+)$/m.exec(readFileSync(path.resolve('../../.env'), 'utf8'));
  const apiKey = (process.env.OPENAI_API_KEY || match?.[1]?.trim().replace(/^["']|["']$/g, ''));
  if (!apiKey && !replayOnly) throw Error('Existing credential unavailable');
  const dbPath = path.join(dir, 'purchases.sqlite'), fresh = !existsSync(dbPath);
  if (replayOnly && fresh) throw Error('Replay requires a retained purchase');
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll('\\', '/')}` } } });
  try {
    if (fresh) await applyTestSchema(db, process.cwd());
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx,
      createRequest: request => { (centered ? assertCenteredRepairReservation : assertRepairReservation)(id, request.requestKey, auditWorldBudget(tx.snapshot).committedMicroUsd, request.reserveMicroUsd); return tx.createRequest(request); },
    })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db), requestKey = `image:${slug}:1`;
    const saveBudget = async () => {
      const audit = await ledger.audit(S.worldId);
      writeFileSync(path.join(dir, 'budget.json'), JSON.stringify({ ...audit,
        authorizedRoundCapMicroUsd: S.capMicroUsd, authorizedRoundRemainingMicroUsd: Math.max(0, S.capMicroUsd - audit.committedMicroUsd),
      }, null, 2));
    };
    if (mode === '--review') {
      const result = readJson(path.join(dir, `${slug}-result.json`));
      const candidate = readFileSync(path.join(dir, `${slug}-candidate.png`));
      if (result.fingerprint !== fingerprint || sha(candidate) !== result.candidateSha256) throw Error('Review candidate changed');
      const settings = localPatchJudgeSettings(10);
      const reviewPrompt = localPatchJudgePrompt(hide.id, { ageYears: 5, support: hide.placement?.support }, 10)
        + '\nAdditional incident acceptance: compare BEFORE and AFTER for orphan remains of the replaced target (especially boots, hands and head), damaged neighboring people, and straight-edge truncation. Report precise visible locations. Preserve-neighbor and intended-target position are requirements here, not optional. Do not excuse such faults because the face looks attractive. If any such fault exists, pictureWhole must fail. The target bounds are ' + JSON.stringify(maskForHide(hide)) + ' in the 512x768 crop.';
      const reviewBytes = JSON.stringify({ version: S.version, prompt: reviewPrompt, settings, beforeSha256: sha(originalTarget), afterSha256: sha(candidate), identitySha256: sha(refs.judgeIdentityPng) }, null, 2);
      pin(`${slug}-review-request.json`, reviewBytes);
      const reviewed = await purchaseOnce({ ledger, store }, { worldId: S.worldId, requestKey: `review:${slug}:1`, scope: 'judge', operationFingerprint: sha(reviewBytes), reserveMicroUsd: 40_000,
        buy: async () => {
          const answer = await requestJudgeWire(apiKey!, { settings, prompt: reviewPrompt, images: [originalTarget, candidate, refs.judgeIdentityPng], imageLabels: ['BEFORE — original intended scene', 'AFTER — exact candidate that would ship', 'PORTRAIT — canonical identity'] }, fetch);
          const bytes = Buffer.from(JSON.stringify(answer)), charge = judgeCharge(answer.model ?? '', answer.usage ?? undefined);
          if (charge.costUnknown || answer.costUnknown || !answer.requestId) return { bytes, unknownReason: 'Review billing evidence incomplete' };
          return { bytes, evidence: { providerNamespace: 'openai:find-me-existing', providerRequestId: answer.requestId,
            usageId: sha(JSON.stringify(answer.usage ?? {})), rawUsage: (answer.usage ?? {}) as BudgetJson,
            model: answer.model!, amountMicroUsd: Math.round(charge.costCents * 10_000), costBasis: 'conservative-upper-estimate' as const } };
        } });
      await saveBudget();
      if (reviewed.kind !== 'bought') throw Error('Review retained/held; no retry');
      pin(`${slug}-review.json`, reviewed.bytes);
      console.log(JSON.stringify({ slug, mode, replayed: reviewed.replayed, chargeMicroUsd: reviewed.evidence.amountMicroUsd, livePublished: false }));
      return;
    }
    const bought = await purchaseOnce({ ledger, store }, { worldId: S.worldId, requestKey, scope: 'image', operationFingerprint: fingerprint, reserveMicroUsd: 150_000,
      buy: async () => {
        if (replayOnly) throw Error('Replay unexpectedly reached provider boundary');
        const answer = await buyLocalPatch(apiKey!, { worldId: S.worldId, requestKey, prompt, stylePng: target,
          identityPng: refs.identityPng, referenceMode: refs.referenceMode, maskPng: mask }, { policy: S.policy });
        const bytes = Buffer.from(JSON.stringify({ png: (answer.png ?? answer.quarantined)?.toString('base64'), rejected: answer.rejected }));
        return answer.evidence ? { bytes, evidence: answer.evidence } : { bytes, unknownReason: answer.unknownReason ?? 'Missing usage evidence' };
      } });
    await saveBudget();
    if (bought.kind !== 'bought') throw Error(`Purchase ${bought.kind}; no automatic retry`);
    if (replayOnly && !bought.replayed) throw Error('Expected retained replay');
    const retained = JSON.parse(bought.bytes.toString());
    if (!retained.png || retained.rejected) throw Error('Provider reply refused; retained, not retrying');
    const raw = Buffer.from(retained.png, 'base64'); pin(`${slug}-provider.png`, raw);
    const normalized = await sharp(raw).resize(512, 768, { fit: 'fill' }).png().toBuffer(); pin(`${slug}-raw.png`, normalized);
    const composedResult = contextPlan ? await composeReframedLocalPatch(composed, normalized, contextPlan)
      : await composeBoundedLocalPatch(composed, crop, normalized, maskForHide(hide));
    const shipping = await sharp(composedResult.candidate).extract(crop).png().toBuffer();
    pin(`${slug}-candidate.png`, shipping); pin(`${slug}-board.png`, composedResult.candidate);
    pin(`${slug}-preview.webp`, await sharp(composedResult.candidate).resize(1920).webp({ quality: 90 }).toBuffer());
    pin(`${slug}-result.json`, JSON.stringify({ fingerprint, providerSha256: sha(raw), candidateSha256: sha(shipping),
      chargeMicroUsd: bought.evidence.amountMicroUsd, costBasis: bought.evidence.costBasis,
      usable: composedResult.usable, region: composedResult.region, seam: composedResult.report,
      compositionPermission: composedResult.compositionPermission, visualAcceptance: 'pending', livePublished: false }, null, 2));
    console.log(JSON.stringify({ slug, replayed: bought.replayed, chargeMicroUsd: bought.evidence.amountMicroUsd, usable: composedResult.usable, livePublished: false }));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Bounded repair stopped. Inspect private evidence; no automatic retry or live publication.'); process.exitCode = 1; });
