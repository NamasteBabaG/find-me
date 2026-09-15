/** Explicit public-example authoring, using the production v9 retained renderer.
 * One identity / three first-attempt hides. No customer DB, activation or deploy.
 * Existing key must be loaded by caller. Source-bound visual review gates hides. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { applyTestSchema } from "../src/lib/test-schema";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository } from "../src/services/generation/world-budget";
import { purchaseOnce } from "../src/services/generation/paid-operation";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { normalizeBoardWizardIdentity } from "../src/services/generation/board-wizard-identity";
import { renderLocalPatchHide } from "../src/services/generation/local-patch-render";
import { buyLocalPatch, localPatchImagePolicyForVersion, localPatchRenderPolicySha256, LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE } from "../src/infra/generation/openai-local-patch";
import { captureIdentity, imageBill, replayIdentity } from "./local-patch-style-pilot";
import { LocalPatchBoardSchema, assertPlaceable, maskForHide } from "../src/domain/scene/local-patch-hides";
import { ReadyAdventureBoardSchema } from "../src/domain/adventure/content";
import { SEAM_LIMITS } from "../src/services/generation/local-patch-seam";

// v1 was rejected locally before fetch: the reference was not 1024-square.
// Its ledger remains intact; see docs/DEMO_BEACH_2026-09-15.md for proof.
const WORLD = "public-demo-beach-20260915-v2", CAP = 2_000_000;
const hash = (v: Buffer | string) => createHash("sha256").update(v).digest("hex");
const dir = path.resolve("storage/public-demo-beach-20260915-v2");
function pin(file: string, value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  const full = path.join(dir, file);
  if (existsSync(full) && readFileSync(full, "utf8") !== serialized) throw new Error(`Pinned input changed: ${file}`);
  writeFileSync(full, serialized);
  return hash(serialized);
}
async function main() {
  const phase = process.argv[2] ?? "--dry-run";
  if (!["--dry-run", "--identity", "--hides", "--repair-library", "--relocate-library"].includes(phase)) throw new Error("Choose an explicit authoring phase");
  mkdirSync(dir, { recursive: true });
  const photo = readFileSync("public/demo/example-photo.jpg");
  // Healthy original beach bystander, visually checked. Supplies technique,
  // never identity. The SAME public example photograph supplies face and hair.
  const style = await sharp(readFileSync("output/imagegen/beach-style-child.png")).resize(1024, 1024, { fit: "contain", background: "#e4dfd5" }).png().toBuffer();
  const styleMeta = await sharp(style).metadata();
  if (styleMeta.width !== 1024 || styleMeta.height !== 1024 || styleMeta.format !== "png") throw new Error("Style preflight failed before reservation");
  const request = { originalPhoto: photo, mimeType: "image/jpeg", crop: null, childName: "נועה", ageYears: 8, styleRef: style,
    qaStyleContract: { version: "board-matched-identity/v2" as const, catalogSha256: hash("public-beach-style-v1"), atlasSha256: hash(style) } };
  const identityInputsHash = pin("identity-inputs.json", { world: WORLD, photoSha256: hash(photo), styleSha256: hash(style), ageYears: 8, policy: "board-matched-identity/v2" });
  if (phase === "--dry-run") { console.log({ paidCalls: 0, identityInputsHash }); return; }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Existing key unavailable");
  const dbPath = path.join(dir, "purchases.sqlite"), fresh = !existsSync(dbPath);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll("\\", "/")}` } } });
  try {
    if (fresh) await applyTestSchema(db, process.cwd());
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx, createRequest: async req => {
      if (id !== WORLD || auditWorldBudget(tx.snapshot).committedMicroUsd + req.reserveMicroUsd > CAP) throw new WorldBudgetError("cap_exceeded", "Public demo budget ceiling");
      return tx.createRequest(req);
    } })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db), deps = { ledger, store };
    const provider = new OpenAiAvatarProvider(key, { model: "gpt-image-2", quality: "medium", tries: 1 });
    const identity = await purchaseOnce(deps, { worldId: WORLD, requestKey: "identity:1", scope: "identity", operationFingerprint: identityInputsHash, reserveMicroUsd: 150_000, buy: async () => {
      if (phase !== "--identity") throw new Error("Identity must be purchased and reviewed first");
      const captured = await captureIdentity(() => provider.createCharacter(request), globalThis.fetch);
      const bytes = Buffer.from(JSON.stringify(captured)), evidence = imageBill(captured);
      return evidence ? { bytes, evidence } : { bytes, unknownReason: "Identity price unresolved; no retry" };
    } });
    if (identity.kind !== "bought") throw new Error(`Identity ${identity.kind}; no retry`);
    const character = await replayIdentity(JSON.parse(identity.bytes.toString()), () => provider.createCharacter(request));
    writeFileSync(path.join(dir, "identity.png"), character.sheetPng);
    writeFileSync(path.join(dir, "avatar.png"), character.avatarPng);
    const normalized = await normalizeBoardWizardIdentity(character.sheetPng);
    writeFileSync(path.join(dir, "identity-normalized.png"), normalized.png);
    if (phase === "--hides" || phase === "--repair-library" || phase === "--relocate-library") {
      const review = JSON.parse(readFileSync(path.join(dir, "identity-review.json"), "utf8"));
      if (!review.accepted || review.identitySha256 !== hash(character.sheetPng) || review.inputsSha256 !== identityInputsHash) throw new Error("Identity visual review required");
      const raw = JSON.parse(readFileSync("content/demo/beach-v1-plan.json", "utf8"));
      const board = LocalPatchBoardSchema.parse(raw.patchBoard), plan = ReadyAdventureBoardSchema.parse(raw.plan);
      const art = readFileSync(board.art);
      if (hash(art) !== plan.art.sha256) throw new Error("Board pixels changed");
      assertPlaceable(board, { width: 3840, height: 2160 });
      const repair = phase === "--repair-library" || phase === "--relocate-library";
      const policy = repair ? { ...localPatchImagePolicyForVersion(9), quality: "medium" as const } : localPatchImagePolicyForVersion(9), policyHash = localPatchRenderPolicySha256(policy);
      const attempt = phase === "--relocate-library" ? 3 : repair ? 2 : 1;
      if (phase === "--repair-library") {
        const h = board.hides.find(h => h.id === "beach-library")!;
        h.hint!.en += " CRITICAL REPAIR: the original curly-haired guitarist's HEAD occupies the lower-left of this crop. KEEP THAT ENTIRE EXISTING HEAD EXACTLY IN PLACE, including his face, hair and neck. He is IN FRONT of the girl, naturally obscuring part of her legs. Do not erase or replace the guitarist with sand or feet. Keep the original boy's book in the new girl's hands and match his body scale. Preserve all other bystanders and the entire outer 32-pixel frame exactly.";
      }
      pin(phase === "--relocate-library" ? "hide-inputs-library-relocate.json" : repair ? "hide-inputs-library-repair.json" : "hide-inputs.json", { board, plan, identitySha256: hash(normalized.png), policyHash, attempt });
      const png = await sharp(art).png().toBuffer(), judgeIdentityPng = await sharp(normalized.png).resize(256, 256, { fit: "inside" }).png().toBuffer();
      for (const hide of board.hides) {
        if (repair && hide.id !== "beach-library") continue;
        const m = maskForHide(hide);
        if (Math.min(m.left, m.top, 512 - m.left - m.width, 768 - m.top - m.height) < SEAM_LIMITS.bandPx) throw new Error(`Unsafe mask margin: ${hide.id}`);
        console.log({ phase: "hide-start", id: hide.id });
        const result = await renderLocalPatchHide({ ...deps, renderPolicySha256: policyHash, render: input => buyLocalPatch(key, input, { policy }) },
          { worldId: WORLD, contentVersion: 9, board, hide, composedPng: png, identityPng: normalized.png, judgeIdentityPng,
            referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, ageYears: 8, attempt, apiKey: key });
        if (result.shippingPng) writeFileSync(path.join(dir, `${hide.id}.png`), result.shippingPng);
        if (result.composedPng) writeFileSync(path.join(dir, `${hide.id}-composed.png`), result.composedPng);
        writeFileSync(path.join(dir, `${hide.id}.json`), JSON.stringify({ accepted: result.accepted, refusedBecause: result.refusedBecause, renderFault: result.renderFault,
          seam: result.seam, compositionPermission: result.compositionPermission, stoppedReason: result.stoppedReason, costUnknown: result.costUnknown,
          renderCents: result.renderCents, replayed: result.replayed, visualReview: "pending" }, null, 2));
        writeFileSync(path.join(dir, "budget.json"), JSON.stringify(await ledger.audit(WORLD), null, 2));
        if (result.costUnknown || result.refusedBecause === "stopped" || !result.shippingPng) throw new Error("Unresolved purchase or missing patch; no retry");
      }
    }
    console.log({ phase, audit: await ledger.audit(WORLD), published: false });
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Public demo authoring failed"); process.exitCode = 1; });
