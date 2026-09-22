/** Bounded personal pilot through the EXISTING product painter and retained ledger.
 * No new transport, no live catalog mutation, no automatic retry, no publication.
 * --dry-run pins inputs; --render <hide-id> [1|2|3] buys/replays exactly one attempt.
 * Repairs require a source-bound, explicitly authored repair JSON before purchase.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { MAGIC_PILOT_CATALOG, MAGIC_PILOT_PATCH_BOARDS } from "../content/adventures/magic-pilot";
import { JOURNEY_REFRESH_CATALOG, JOURNEY_REFRESH_PATCH_BOARDS } from "../content/adventures/journey-refresh-pilot";
import { TWO_WORLD_PATCH_BOARDS, TWO_WORLD_RELEASE_ID, TWO_WORLD_STORAGE, TWO_WORLD_CAP_MICRO_USD } from "../content/adventures/two-worlds-production";
import { LocalPatchHideSchema, assertPlaceable, maskForHide } from "../src/domain/scene/local-patch-hides";
import { applyTestSchema } from "../src/lib/test-schema";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository } from "../src/services/generation/world-budget";
import { renderLocalPatchHide } from "../src/services/generation/local-patch-render";
import { SEAM_LIMITS } from "../src/services/generation/local-patch-seam";
import { normalizeBoardWizardIdentity } from "../src/services/generation/board-wizard-identity";
import { buyLocalPatch, localPatchImagePolicyForVersion, localPatchRenderPolicySha256, LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE } from "../src/infra/generation/openai-local-patch";
import { LOCAL_PATCH_AGE_PROMPT_VERSION, type LocalPatchRepairCheck } from "../src/services/generation/local-patch-prompt";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  // Explicit staging selector. No new transport or alternate paid ledger path:
  // both pilots still use renderLocalPatchHide and retained purchaseOnce receipts.
  const args = process.argv.slice(2);
  const twoWorlds = args[0] === '--two-worlds';
  const productionSlug = twoWorlds ? (args.shift(), args.shift()) : undefined;
  const journeyRefresh = args[0] === "--journey-refresh";
  if (journeyRefresh) args.shift();
  const CAP = twoWorlds ? TWO_WORLD_CAP_MICRO_USD : 2_000_000;
  const WORLD = twoWorlds ? TWO_WORLD_RELEASE_ID : journeyRefresh ? "journey-refresh-bar-amazon-20260919-v1" : "magic-bar-three-20260918-v1";
  const catalog = journeyRefresh ? JOURNEY_REFRESH_CATALOG : MAGIC_PILOT_CATALOG;
  const patchBoards = twoWorlds ? TWO_WORLD_PATCH_BOARDS.filter(b=>b.board===productionSlug) : journeyRefresh ? JOURNEY_REFRESH_PATCH_BOARDS : MAGIC_PILOT_PATCH_BOARDS;
  if(twoWorlds && patchBoards.length!==1) throw Error('Select one authored production board after --two-worlds');
  const productionArt = twoWorlds ? JSON.parse(readFileSync('content/adventures/two-worlds-art.json','utf8')) as {slug:string;sha256:string}[] : [];
  const [phase = "--dry-run", target, attemptText = "1", ...extra] = args;
  const attempt = Number(attemptText);
  if (extra.length || !["--dry-run", "--render"].includes(phase) || ![1, 2, 3].includes(attempt)
    || phase === "--dry-run" && target || phase === "--render" && !target) throw Error("Use --dry-run OR --render <hide-id> [1|2|3]");
  const prior = path.resolve("../adventure-three-boards-20260914/storage/adventure-bar-20260914");
  const previousInputs = readFileSync(path.join(prior, "inputs.json"));
  const oldReview = JSON.parse(readFileSync(path.join(prior, "identity-review.json"), "utf8"));
  const originalPhoto = readFileSync("C:/GNart/Work/SmallHeroesAssets/Bar.png");
  const identitySheet = readFileSync(path.join(prior, "identity.png"));
  if (oldReview.accepted !== true || oldReview.identitySha256 !== hash(identitySheet)
    || oldReview.inputsSha256 !== hash(previousInputs)
    || JSON.parse(previousInputs.toString()).child.photoSha256 !== hash(originalPhoto)) throw Error("Bar's reviewed identity/source binding changed");
  const identity = (await normalizeBoardWizardIdentity(identitySheet)).png;
  const avatar = readFileSync(path.join(prior, "avatar.png"));
  const policy = localPatchImagePolicyForVersion(10), policyHash = localPatchRenderPolicySha256(policy);
  const boards = await Promise.all(patchBoards.map(async board => {
    const plan = catalog.boards.find(p => p.boardSlug === board.board);
    const art = readFileSync(board.art), meta = await sharp(art).metadata();
    const expectedSha = twoWorlds ? productionArt.find(p=>p.slug===board.board)?.sha256 : plan?.status==='ready' ? plan.art.sha256 : undefined;
    if (!expectedSha || hash(art) !== expectedSha || meta.width !== 3840 || meta.height !== 2160) throw Error("Approved master changed");
    assertPlaceable(board, { width: 3840, height: 2160 });
    for (const hide of board.hides) {
      const m = maskForHide(hide);
      if (Math.min(m.left, m.top, 512 - m.left - m.width, 768 - m.top - m.height) < SEAM_LIMITS.bandPx) throw Error(`No seam margin: ${hide.id}`);
    }
    return { board, art, sourceSha256: hash(art) };
  }));
  const dir = path.resolve(twoWorlds ? `${TWO_WORLD_STORAGE}/${productionSlug}` : journeyRefresh ? "storage/journey-refresh-bar-20260919" : "storage/magic-bar-20260918"); mkdirSync(dir, { recursive: true });
  const serialized = JSON.stringify({ version: WORLD, contentVersion: 10, capMicroUsd: CAP,
    identitySha256: hash(identity), identitySheetSha256: hash(identitySheet), avatarSha256: hash(avatar),
    sourcePhotoSha256: hash(originalPhoto), ageYears: 5, reusedIdentity: true,
    policyHash, promptVersion: LOCAL_PATCH_AGE_PROMPT_VERSION,
    boards: boards.map(({ board, sourceSha256 }) => ({ board, sourceSha256 })), ...(twoWorlds ? {} : {catalog}),
  }, null, 2);
  const inputsFile = path.join(dir, "inputs.json");
  if (existsSync(inputsFile) && readFileSync(inputsFile, "utf8") !== serialized) throw Error("Pinned inputs changed: no paid-key reset allowed");
  // Rendering never truncates an already-pinned file while another hide verifies
  // it. --dry-run creates these before the batch starts; subsequent calls only read.
  if (!existsSync(inputsFile)) writeFileSync(inputsFile, serialized, {flag:'wx'});
  for (const [name,bytes] of [['identity-normalized.png',identity],['avatar.png',avatar]] as const) {
    const destination=path.join(dir,name);
    if (existsSync(destination)) { if(hash(readFileSync(destination))!==hash(bytes))throw Error(`Pinned ${name} changed`); }
    else writeFileSync(destination,bytes,{flag:'wx'});
  }
  if (phase === "--dry-run") {
    console.log(JSON.stringify({ phase, dir, hides: patchBoards.reduce((n, b) => n + b.hides.length, 0), discoveries: twoWorlds ? 'separate-authoring-gate' : catalog.boards.reduce((n, b) => n + (b.status === "ready" ? b.discoveries.length : 0), 0), reusedIdentity: true, paidCalls: 0, capUsd: CAP / 1e6 })); return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw Error("Caller must load the existing approved key without logging it");
  const entry = boards.find(b => b.board.hides.some(h => h.id === target));
  const originalHide = entry?.board.hides.find(h => h.id === target);
  if (!entry || !originalHide) throw Error("Unknown authored hide");
  const repair = attempt > 1 ? JSON.parse(readFileSync(path.join(dir, `${target}-repair-${attempt}.json`), "utf8")) : null;
  if (repair && (repair.inputsSha256 !== hash(serialized) || repair.hideId !== target || repair.attempt !== attempt
    || typeof repair.reason !== "string" || repair.reason.length < 20 || !Array.isArray(repair.checks))) throw Error("Invalid explicit repair plan");
  const hide = LocalPatchHideSchema.parse({ ...originalHide,
    // Explicit source-bound identity-only repair; never changes the crop or
    // resets a paid key. The mask and prompt are part of its fingerprint.
    ...(repair?.maskOverride ? { mask: repair.maskOverride } : {}),
    ...(repair?.placementOverride ? { placement: { ...originalHide.placement, ...repair.placementOverride } } : {}),
  });
  assertPlaceable({...entry.board,hides:entry.board.hides.map(h=>h.id===hide.id?hide:h)},{width:3840,height:2160});
  const dbPath = path.resolve(twoWorlds ? `${TWO_WORLD_STORAGE}/purchases.sqlite` : path.join(dir, "purchases.sqlite")), fresh = !existsSync(dbPath);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll("\\", "/")}` } } });
  try {
    if (fresh) await applyTestSchema(db, process.cwd());
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx, createRequest: async request => {
      if (id !== WORLD || auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > CAP) throw new WorldBudgetError("cap_exceeded", "Retained production reservation ceiling reached");
      return tx.createRequest(request);
    } })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db);
    console.log(JSON.stringify({ phase: "render-start", hide: target, attempt }));
    const result = await renderLocalPatchHide({ ledger, store, renderPolicySha256: policyHash, render: input => buyLocalPatch(key, input, { policy }) }, {
      worldId: WORLD, contentVersion: 10, board: entry.board, hide,
      composedPng: await sharp(entry.art).png().toBuffer(), identityPng: identity,
      judgeIdentityPng: await sharp(identity).resize(256, 256, { fit: "inside" }).png().toBuffer(),
      referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, ageYears: 5, attempt,
      repairChecks: repair?.checks as LocalPatchRepairCheck[] | undefined, apiKey: key,
    });
    const prefix = path.join(dir, `${target}-attempt-${attempt}`);
    if (result.patchPng) writeFileSync(`${prefix}-raw.png`, result.patchPng);
    if (result.shippingPng) writeFileSync(`${prefix}.png`, result.shippingPng);
    const { patchPng: _patch, shippingPng: _shipping, composedPng: _composed, ...technical } = result;
    writeFileSync(`${prefix}.json`, JSON.stringify({ ...technical, inputsSha256: hash(serialized),
      sha256: result.shippingPng ? hash(result.shippingPng) : null, effectiveHide: hide, visualReview: "pending" }, null, 2));
    const audit = await ledger.audit(WORLD);
    writeFileSync(path.join(dir, "budget.json"), JSON.stringify(audit, null, 2));
    console.log(JSON.stringify({ phase: "retained", hide: target, attempt, accepted: result.accepted,
      renderFault: result.renderFault, stoppedReason: result.stoppedReason, visualReview: "pending", settledMicroUsd: audit.settledMicroUsd, held: audit.held }));
    if (result.costUnknown || result.refusedBecause === "stopped") throw Error("Unresolved paid operation: reconcile retained evidence, never reset or retry");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Magic pilot stopped"); process.exitCode = 1; });
