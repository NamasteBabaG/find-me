import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { BOARD_CHECKS, BOARD_JUDGE_MODEL, BOARD_JUDGE_VERSION, boardJudgePrompt } from "../../../infra/generation/board-verdict";
import { judgeCharge } from "../../../infra/generation/judge";
import type { PatchJudgeInput, PatchJudgement } from "../../../infra/generation/types";
import type { WorldBudgetSnapshot } from "../world-budget";
import { boardWizardBudget } from "../board-wizard-budget";
import { boardWizardVisualKeys, judgeBoardWizardAppearance } from "../board-wizard-visual-judge";
import { sha256Bytes } from "../fixed-sprite";

async function fixture(unknown = false) {
  let saved: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(saved),
    insertIfAbsent: async (_id, snapshot) => { if (saved) return false; saved = { revision: 0, snapshot: structuredClone(snapshot) }; return true; },
    compareAndSwap: async (_id, revision, snapshot) => { if (!saved || saved.revision !== revision) return false; saved = { revision: revision + 1, snapshot: structuredClone(snapshot) }; return true; },
  };
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store));
  const blobs = new Map<string, { key: string; contentType: string; data: Uint8Array }>();
  const db = { fileBlob: { findUnique: async ({ where }: { where: { key: string } }) => blobs.get(where.key) ?? null,
    create: async ({ data }: { data: { key: string; contentType: string; data: Uint8Array } }) => { if (blobs.has(data.key)) throw new Error("duplicate"); blobs.set(data.key, structuredClone(data)); return data; } } } as unknown as Prisma.TransactionClient;
  const png = await sharp({ create: { width: 16, height: 24, channels: 4, background: "#6688aa" } }).png().toBuffer();
  const input: PatchJudgeInput = { patchPng: png, reference: png, boardCrop: png, childName: "Synthetic", ageYears: 6, label: "synthetic/slot", recipe: { pose: "standing", support: "Standing in shade", occlusion: "none", occlusionMode: "open", comparators: "nearby original people" } };
  const judge = { id: "synthetic-sol-no-network", judge: vi.fn(async (input: PatchJudgeInput): Promise<PatchJudgement> => {
    const images = [await sharp(input.boardCrop!).resize(1024, 1024, { fit: "inside" }).png().toBuffer(), await sharp(input.patchPng).resize(512, 512, { fit: "contain", background: { r: 130, g: 130, b: 130, alpha: 1 } }).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer(), await sharp(input.reference).resize(512, 512, { fit: "inside" }).png().toBuffer()];
    const usage = unknown ? null : { prompt_tokens: 1000, completion_tokens: 100 }, charge = judgeCharge(BOARD_JUDGE_MODEL, usage ?? undefined);
    return { verdict: "ok", reason: "Synthetic evidence only", model: BOARD_JUDGE_MODEL, costCents: charge.costCents, costUnknown: charge.costUnknown,
      version: BOARD_JUDGE_VERSION, policy: "strong", checks: Object.fromEntries(BOARD_CHECKS.map(k => [k, "pass"])) as NonNullable<PatchJudgement["checks"]>,
      promptSent: boardJudgePrompt(input.childName, input.ageYears, input.recipe), imageHashes: images.map(sha256Bytes), wireImages: images.slice(0, 2),
      attempts: [{ requestId: unknown ? null : "req-synthetic-visual", model: BOARD_JUDGE_MODEL, usage, costCents: charge.costCents, costUnknown: charge.costUnknown, status: 200 }] };
  }) };
  const beforeDispatch = vi.fn(async () => {}), deps = { db, budget, apiKey: "never-used", write: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => fn(db), beforeDispatch, judge };
  const request = { worldId: "synthetic-world", boardId: "synthetic-board", slotId: "A", attempt: 1, playerBindingSha256: "a".repeat(64), input };
  return { deps, request, blobs, budget, judge, beforeDispatch };
}

describe("budgeted final-composite Sol HIGH review, all provider results synthetic", () => {
  it("settles exact known usage once and reuses matching private wire evidence without another dispatch", async () => {
    const f = await fixture(); const first = await judgeBoardWizardAppearance(f.deps, f.request);
    expect(first.judgement.verdict).toBe("ok"); expect(first.judgement.wireImages).toBeUndefined();
    expect((await f.budget.audit(f.request.worldId)).settledMicroUsd).toBe(7000);
    expect((await judgeBoardWizardAppearance(f.deps, f.request)).reused).toBe(true);
    expect(f.judge.judge).toHaveBeenCalledTimes(1); expect(f.beforeDispatch).toHaveBeenCalledTimes(1); expect(f.blobs.size).toBe(3);
  });
  it("retains uncertain billing as a400000 reservation and never converts a claimed ok into approval", async () => {
    const f = await fixture(true); const result = await judgeBoardWizardAppearance(f.deps, f.request);
    expect(result.judgement.verdict).toBe("unknown"); expect(await f.budget.audit(f.request.worldId)).toMatchObject({ held: true, reservedMicroUsd: 400000, settledMicroUsd: 0 });
    expect((await judgeBoardWizardAppearance(f.deps, f.request)).reused).toBe(true); expect(f.judge.judge).toHaveBeenCalledTimes(1);
  });
  it("refuses a new review before dispatch when its reservation exceeds the inclusive $4 cap", async () => {
    const f = await fixture(); await f.budget.importSettled(f.request.worldId, { scope: "identity", operationFingerprint: "earlier-work", evidence: { providerNamespace: "fixture", providerRequestId: "earlier", usageId: "earlier", rawUsage: { tokens: 1 }, model: "fixture", amountMicroUsd: 3_700_000, costBasis: "provider-billed" } });
    await expect(judgeBoardWizardAppearance(f.deps, f.request)).rejects.toMatchObject({ code: "cap_exceeded" }); expect(f.judge.judge).not.toHaveBeenCalled();
  });
  it("does not reuse a pass against changed lighting instructions or modified retained wire pixels", async () => {
    const f = await fixture(); await judgeBoardWizardAppearance(f.deps, f.request);
    await expect(judgeBoardWizardAppearance(f.deps, { ...f.request, input: { ...f.request.input, recipe: { ...f.request.input.recipe!, support: "Different light" } } })).rejects.toThrow("different composed pixels or policy");
    const key = boardWizardVisualKeys(f.request.worldId, f.request.boardId, f.request.slotId, 1).wire0; f.blobs.get(key)!.data[0] = 0;
    await expect(judgeBoardWizardAppearance(f.deps, f.request)).rejects.toThrow("wire evidence changed"); expect(f.judge.judge).toHaveBeenCalledTimes(1);
  });
  it("fails closed if cached request-level cost is changed", async () => {
    const f = await fixture(); const r = await judgeBoardWizardAppearance(f.deps, f.request), blob = f.blobs.get(r.receiptKey)!;
    const record = JSON.parse(Buffer.from(blob.data).toString()); record.judgement.costCents = 0; blob.data = Buffer.from(JSON.stringify(record));
    await expect(judgeBoardWizardAppearance(f.deps, f.request)).rejects.toThrow("bill differs"); expect(f.judge.judge).toHaveBeenCalledTimes(1);
  });
});
