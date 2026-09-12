import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { OpenAiIdentityStyleReviewer } from "../../../infra/generation/identity-style-reviewer";
import { LEGACY_QA_CHARACTER_PROMPT_VERSION as QA_CHARACTER_PROMPT_VERSION } from "../../../infra/generation/character-prompt";
import type { WorldBudgetSnapshot } from "../world-budget";
import { boardWizardBudget } from "../board-wizard-budget";
import { ADVISORY_IDENTITY_GATE_VERSION, IDENTITY_GATE_KEY, LEGACY_IDENTITY_GATE_VERSION, identityApprovedForDisplay, identityGatePrompt, identityReceiptReadyForPublication, reviewBoardWizardIdentity, requireBoardWizardIdentityApproval, type IdentityProvenance } from "../board-wizard-identity-gate";
import { sha256Bytes } from "../fixed-sprite";
import type { Container } from "../../container";

const answer = (style = "pass") => ({ checks: { identity: "pass", age: "pass", paintedStyle: style, sheetLayout: "pass" }, reason: "Synthetic test response, no visual quality claim" });
const response = (content: unknown = answer(), patch = {}) => new Response(JSON.stringify({ model: "gpt-5.6-sol", service_tier: "default", usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 },
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], ...patch }), { headers: { "x-request-id": "req_synthetic_identity_gate" } });
async function fixture(reply: () => Promise<Response> = async () => response()) {
  let snapshot: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(snapshot),
    insertIfAbsent: async (_id, s) => { if (snapshot) return false; snapshot = { revision: 0, snapshot: structuredClone(s) }; return true; },
    compareAndSwap: async (_id, revision, s) => { if (!snapshot || snapshot.revision !== revision) return false; snapshot = { revision: revision + 1, snapshot: structuredClone(s) }; return true; },
  };
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store)), rows: { metaJson: string }[] = [];
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#597381" } }).png().toBuffer();
  const db = { auditLog: { findFirst: async () => rows.at(-1) ?? null, create: async ({ data }: { data: { metaJson: string } }) => { rows.push(data); return data; } },
    asset: { findUniqueOrThrow: async () => ({ status: "READY", deletedAt: null, storagePath: "private-photo" }) } } as unknown as Prisma.TransactionClient;
  const fetchOnce = vi.fn((_url: string | URL | Request, _init?: RequestInit) => reply()), beforeDispatch = vi.fn(async () => undefined);
  const deps = { db, budget, apiKey: "never-live", beforeDispatch, reviewer: new OpenAiIdentityStyleReviewer("synthetic-never-live", fetchOnce as typeof fetch),
    write: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => work(db) };
  const provenance: IdentityProvenance = { promptVersion: QA_CHARACTER_PROMPT_VERSION, quality: "medium", photoAssetId: "synthetic-photo", photoSha256: sha256Bytes(png), ageYears: 6, crop: null,
    style: { version: "board-matched-identity/v1", catalogSha256: "a".repeat(64), atlasSha256: sha256Bytes(png) } };
  const input = { gameId: "synthetic-game", identityAssetId: "synthetic-sheet", photo: png, sheet: png, atlas: png, provenance };
  const enrollment = { gameId: input.gameId, identityAssetId: input.identityAssetId, sheetSha256: sha256Bytes(png), catalogSha256: provenance.style.catalogSha256, photoAssetId: provenance.photoAssetId, ageYears: 6, crop: null };
  const c = { db, storage: { get: async () => png } } as unknown as Container;
  return { deps, input, budget, fetchOnce, beforeDispatch, rows, enrollment, c };
}
describe("identity style gate (synthetic images and HTTP; zero paid calls)", () => {
  it("recomputes its HTTP deadline after a slow reservation and holds without dispatch when the window is gone", async () => {
    for (const spentMs of [40_000, 130_000]) {
      const f = await fixture(); let now = 100_000;
      const reserve = f.budget.reserve.bind(f.budget);
      const reserveSpy = vi.spyOn(f.budget, "reserve").mockImplementation(async (...args) => { const result = await reserve(...args); now += spentMs; return result; });
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
      const review = vi.fn(async (input: Parameters<OpenAiIdentityStyleReviewer["review"]>[0]) => {
        expect(input.timeoutMs).toBe(55_000);
        return { httpOk: true, requestId: "req_deadline_identity", body: await response().json() };
      });
      try {
        const result = await reviewBoardWizardIdentity({ ...f.deps, reviewer: { review } }, { ...f.input, deadlineAt: 220_000 });
        if (spentMs === 40_000) { expect(result.approved).toBe(true); expect(review).toHaveBeenCalledOnce(); }
        else {
          expect(result).toMatchObject({ approved: false, requestId: null, costMicroUsd: 0 });
          expect(result.reason).toContain("never dispatched"); expect(review).not.toHaveBeenCalled();
          expect(await f.budget.audit("synthetic-game:board-wizard")).toMatchObject({ held: true, settledMicroUsd: 0 });
          await reviewBoardWizardIdentity({ ...f.deps, reviewer: { review } }, { ...f.input, deadlineAt: now + 270_000 });
          expect(review).not.toHaveBeenCalled();
        }
      } finally { clock.mockRestore(); reserveSpy.mockRestore(); }
    }
  });
  it("keeps the bounded identity timeout alive through a hanging response body", async () => {
    let aborted = false;
    const hangingFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => ({ ok: true, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => { init!.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("body aborted")); }, { once: true }); }),
    }) as Response);
    const reviewer = new OpenAiIdentityStyleReviewer("synthetic", hangingFetch as typeof fetch);
    await expect(reviewer.review({ prompt: "test", images: [], timeoutMs: 30 })).rejects.toThrow("body aborted");
    expect(aborted).toBe(true); expect(hangingFetch).toHaveBeenCalledOnce();
    await expect(reviewer.review({ prompt: "test", images: [], timeoutMs: 0 })).rejects.toThrow("window expired");
    expect(hangingFetch).toHaveBeenCalledOnce();
  });
  it.each(["fail", "uncertain"])("catalog 7 records %s as a Luna LOW warning without blocking or buying another identity", async value => {
    const f = await fixture(async () => response({ checks: { identity: value, age: value, paintedStyle: value, sheetLayout: value }, reason: "Synthetic visible warning" }, { model: "gpt-5.6-luna" }));
    f.input.provenance.promptVersion = "character-v4-board-drawn-face-reference";
    f.input.provenance.style.version = "board-matched-identity/v2";
    const input = { ...f.input, contentVersion: 7 }, enrollment = { ...f.enrollment, contentVersion: 7 };
    const r = await reviewBoardWizardIdentity(f.deps, input);
    expect(r).toMatchObject({ version: ADVISORY_IDENTITY_GATE_VERSION, approved: false, model: "gpt-5.6-luna", effort: "low" });
    expect(r.costMicroUsd).toBe(980);
    const body = JSON.parse(f.fetchOnce.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ model: "gpt-5.6-luna", reasoning_effort: "low", max_completion_tokens: 3000, store: false });
    expect(body.messages[0].content).toHaveLength(4);
    expect(identityReceiptReadyForPublication(r, 7)).toBe(true);
    expect(identityReceiptReadyForPublication(r, 6)).toBe(false);
    expect(identityReceiptReadyForPublication(r, 9)).toBe(false);
    await requireBoardWizardIdentityApproval(f.c, f.budget, enrollment);
    const profile = { identityAssetId: r.identityAssetId, originalPhotoAssetId: r.provenance.photoAssetId, ageYears: r.provenance.ageYears };
    expect(await identityApprovedForDisplay(f.c, profile, 7)).toBe(true);
    expect(await identityApprovedForDisplay(f.c, { ...profile, ageYears: 4 }, 7)).toBe(false);
    await expect(requireBoardWizardIdentityApproval(f.c, f.budget, { ...enrollment, sheetSha256: "e".repeat(64) })).rejects.toThrow("different child");
    expect(await reviewBoardWizardIdentity(f.deps, input)).toEqual(r);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("catalog 7 permits unreadable visual findings only with a settled bill, never unknown usage", async () => {
    for (const billed of [true, false]) {
      const f = await fixture(async () => response({ malformed: true }, { model: "gpt-5.6-luna", ...(billed ? {} : { usage: null }) }));
      f.input.provenance.promptVersion = "character-v4-board-drawn-face-reference";
      f.input.provenance.style.version = "board-matched-identity/v2";
      const r = await reviewBoardWizardIdentity(f.deps, { ...f.input, contentVersion: 7 });
      expect(r.approved).toBe(false); expect(r.checks).toBeNull();
      expect(identityReceiptReadyForPublication(r, 7)).toBe(billed);
      if (billed) await requireBoardWizardIdentityApproval(f.c, f.budget, { ...f.enrollment, contentVersion: 7 });
      else await expect(requireBoardWizardIdentityApproval(f.c, f.budget, { ...f.enrollment, contentVersion: 7 })).rejects.toThrow();
      expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    }
  });
  it("uses original photo for likeness, board people for style; never demands board placement before a board exists", () => {
    const prompt = identityGatePrompt(6, LEGACY_IDENTITY_GATE_VERSION);
    expect(prompt).toContain("ORIGINAL painted board people"); expect(prompt).toContain("photograph-like face");
    expect(prompt).toContain("NOT a demand for pixel-identical brushwork"); expect(prompt).toContain("Do not judge on-board placement");
  });
  it("passes only four complete checks, settles once, and reuses the same receipt without paying again", async () => {
    const f = await fixture(); const r = await reviewBoardWizardIdentity(f.deps, f.input);
    expect(r.approved).toBe(true); expect(r.costMicroUsd).toBe(18000);
    const body = JSON.parse(f.fetchOnce.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ model: "gpt-5.6-sol", reasoning_effort: "high", service_tier: "default", store: false });
    expect(body.messages[0].content).toHaveLength(4);
    await requireBoardWizardIdentityApproval(f.c, f.budget, f.enrollment);
    expect(await reviewBoardWizardIdentity(f.deps, f.input)).toEqual(r);
    expect(f.fetchOnce).toHaveBeenCalledTimes(1); expect(f.beforeDispatch).toHaveBeenCalledTimes(1);
    expect(f.rows[0]!.metaJson).not.toContain("base64");
  });
  it.each(["fail", "uncertain"])("a %s style check retains evidence but cannot enroll or re-buy", async style => {
    const f = await fixture(async () => response(answer(style)));
    expect((await reviewBoardWizardIdentity(f.deps, f.input)).approved).toBe(false);
    await expect(requireBoardWizardIdentityApproval(f.c, f.budget, f.enrollment)).rejects.toThrow("awaiting");
    await reviewBoardWizardIdentity(f.deps, f.input); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it.each(["missing-check", "truncated", "invalid-json", "too-many-tokens"])("%s cannot pass even with billable usage", async defect => {
    const patch = defect === "truncated" ? { choices: [{ finish_reason: "length", message: { content: JSON.stringify(answer()) } }] }
      : defect === "invalid-json" ? { choices: [{ finish_reason: "stop", message: { content: "no-json" } }] }
      : defect === "too-many-tokens" ? { usage: { prompt_tokens: 2000, completion_tokens: 8001 } } : {};
    const f = await fixture(async () => response(defect === "missing-check" ? { checks: { paintedStyle: "pass" }, reason: "incomplete" } : answer(), patch));
    expect((await reviewBoardWizardIdentity(f.deps, f.input)).approved).toBe(false);
    expect((await f.budget.readRequest("synthetic-game:board-wizard", IDENTITY_GATE_KEY))?.state).toBe("settled");
  });
  it.each(["transport", "missing-usage", "wrong-tier", "wrong-model"])("%s retains the full reserve and blocks a repeated paid call", async defect => {
    const f = await fixture(async () => { if (defect === "transport") throw new Error("sensitive-provider-failure");
      return response(answer(), defect === "missing-usage" ? { usage: null } : defect === "wrong-tier" ? { service_tier: "priority" } : { model: "different-model" }); });
    expect((await reviewBoardWizardIdentity(f.deps, f.input)).approved).toBe(false);
    expect(await f.budget.audit("synthetic-game:board-wizard")).toMatchObject({ reservedMicroUsd: 400000, held: true });
    await reviewBoardWizardIdentity(f.deps, f.input); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
    expect(f.rows[0]!.metaJson).not.toContain("sensitive-provider-failure");
  });
  it("refuses a review above the inclusive world ceiling before HTTP", async () => {
    const f = await fixture(); await f.budget.importSettled("synthetic-game:board-wizard", { scope: "identity", operationFingerprint: "prior", evidence: { providerNamespace: "synthetic", providerRequestId: "prior", usageId: "prior", rawUsage: { tokens: 1 }, model: "synthetic", amountMicroUsd: 3700000, costBasis: "provider-billed" } });
    await expect(reviewBoardWizardIdentity(f.deps, f.input)).rejects.toMatchObject({ code: "cap_exceeded" }); expect(f.fetchOnce).not.toHaveBeenCalled();
  });
  it("requires approval at enrollment and refuses changed child/catalog/crop/cost or source pixels", async () => {
    const f = await fixture(); await expect(requireBoardWizardIdentityApproval(f.c, f.budget, f.enrollment)).rejects.toThrow("required");
    await reviewBoardWizardIdentity(f.deps, f.input);
    for (const patch of [{ catalogSha256: "b".repeat(64) }, { ageYears: 7 }, { photoAssetId: "other-child" }, { sheetSha256: "c".repeat(64) }, { crop: { x: 0, y: 0, w: .5, h: .5 } }]) {
      await expect(requireBoardWizardIdentityApproval(f.c, f.budget, { ...f.enrollment, ...patch })).rejects.toThrow("different child");
    }
    await expect(reviewBoardWizardIdentity(f.deps, { ...f.input, provenance: { ...f.input.provenance, style: { ...f.input.provenance.style, atlasSha256: "d".repeat(64) } } })).rejects.toThrow("provenance");
    const r = JSON.parse(f.rows[0]!.metaJson); r.costMicroUsd = 0; f.rows[0]!.metaJson = JSON.stringify(r);
    await expect(requireBoardWizardIdentityApproval(f.c, f.budget, f.enrollment)).rejects.toThrow("billing"); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch after losing lifecycle authority, and preserves billing if publication loses its claim", async () => {
    const f = await fixture(); f.beforeDispatch.mockRejectedValueOnce(new Error("deleted"));
    await expect(reviewBoardWizardIdentity(f.deps, f.input)).rejects.toThrow("deleted"); expect(f.fetchOnce).not.toHaveBeenCalled();
    await expect(reviewBoardWizardIdentity({ ...f.deps, write: async () => { throw new Error("stale-lease"); } }, f.input)).rejects.toThrow("stale-lease");
    expect((await f.budget.readRequest("synthetic-game:board-wizard", IDENTITY_GATE_KEY))?.state).toBe("settled");
    await expect(reviewBoardWizardIdentity(f.deps, f.input)).rejects.toThrow("reconcile"); expect(f.fetchOnce).toHaveBeenCalledTimes(1);
  });
});
