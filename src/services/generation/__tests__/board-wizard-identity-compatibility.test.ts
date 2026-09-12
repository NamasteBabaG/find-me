import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { characterPrompt, LEGACY_QA_CHARACTER_PROMPT_VERSION, QA_CHARACTER_PROMPT_VERSION, qaCharacterPromptVersion } from "../../../infra/generation/character-prompt";
import type { IdentityStyleReviewer } from "../../../infra/generation/identity-style-reviewer";
import { boardWizardBudget } from "../board-wizard-budget";
import { IDENTITY_GATE_KEY, IDENTITY_GATE_VERSION, LEGACY_IDENTITY_GATE_VERSION, identityGatePrompt, reviewBoardWizardIdentity, type IdentityProvenance } from "../board-wizard-identity-gate";
import { sha256Bytes } from "../fixed-sprite";
import type { WorldBudgetSnapshot } from "../world-budget";

// Captured from the deployed v1 implementation BEFORE the style upgrade. A
// legacy request must not silently acquire today's prose and fingerprint.
const LEGACY_CHARACTER_AGE6_SHA = "8c1e35829c1c0cd979116e529c8a79ac8780ed1fd82281afbc296214b3e62d62";
const LEGACY_GATE_AGE6_SHA = "616609aa8dd0a755322b01838e7fa34a077e6b10ec49776db7869fa772f13873";
const shaText = (text: string) => sha256Bytes(Buffer.from(text));

async function fixture(style: IdentityProvenance["style"]["version"], paintedStyle: "pass" | "fail" | "uncertain" = "pass") {
  let snapshot: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(snapshot),
    insertIfAbsent: async (_id, value) => { if (snapshot) return false; snapshot = { revision: 0, snapshot: structuredClone(value) }; return true; },
    compareAndSwap: async (_id, revision, value) => {
      if (!snapshot || snapshot.revision !== revision) return false;
      snapshot = { revision: revision + 1, snapshot: structuredClone(value) }; return true;
    },
  };
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store));
  const rows: { metaJson: string }[] = [];
  const db = { auditLog: {
    findFirst: async () => rows.at(-1) ?? null,
    create: async ({ data }: { data: { metaJson: string } }) => { rows.push(data); return data; },
  } } as unknown as Prisma.TransactionClient;
  const review = vi.fn<IdentityStyleReviewer["review"]>(async () => ({
    httpOk: true, requestId: "req_synthetic_compatibility",
    body: { model: "gpt-5.6-sol", service_tier: "default",
      usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        checks: { identity: "pass", age: "pass", paintedStyle, sheetLayout: "pass" },
        reason: "Synthetic response proves version and gate wiring, not visual quality.",
      }) } }],
    },
  }));
  const beforeDispatch = vi.fn(async () => undefined);
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#597381" } }).png().toBuffer();
  const provenance: IdentityProvenance = {
    promptVersion: qaCharacterPromptVersion(style), quality: "medium", photoAssetId: "compat-photo",
    photoSha256: sha256Bytes(png), ageYears: 6, crop: null,
    style: { version: style, catalogSha256: "a".repeat(64), atlasSha256: sha256Bytes(png) },
  };
  return {
    input: { gameId: "compat-game", identityAssetId: "compat-sheet", photo: png, sheet: png, atlas: png, provenance },
    deps: { db, budget, apiKey: "synthetic-never-live", reviewer: { review }, beforeDispatch,
      write: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => work(db) },
    budget, review, beforeDispatch, rows,
  };
}

describe("initial identity style versions remain distinct at the purchase boundary", () => {
  it("preserves the exact pre-upgrade v1 character and gate questions", () => {
    expect(LEGACY_QA_CHARACTER_PROMPT_VERSION).toBe("character-v3-board-matched-matte");
    expect(LEGACY_IDENTITY_GATE_VERSION).toBe("board-wizard-identity-style-sol-high/v1");
    expect(qaCharacterPromptVersion("board-matched-identity/v1")).toBe(LEGACY_QA_CHARACTER_PROMPT_VERSION);
    expect(shaText(characterPrompt({ styled: true, ageYears: 6, qaStyleContractVersion: "board-matched-identity/v1" }))).toBe(LEGACY_CHARACTER_AGE6_SHA);
    expect(shaText(identityGatePrompt(6, LEGACY_IDENTITY_GATE_VERSION))).toBe(LEGACY_GATE_AGE6_SHA);
  });

  it("replays a legacy receipt under its original gate instead of rebilling it under the new policy", async () => {
    const f = await fixture("board-matched-identity/v1");
    const first = await reviewBoardWizardIdentity(f.deps, f.input);
    expect(first).toMatchObject({ version: LEGACY_IDENTITY_GATE_VERSION, approved: true,
      provenance: { promptVersion: LEGACY_QA_CHARACTER_PROMPT_VERSION } });
    expect(shaText(first.prompt)).toBe(LEGACY_GATE_AGE6_SHA);
    const bill = await f.budget.readRequest("compat-game:board-wizard", IDENTITY_GATE_KEY);
    expect(bill).toMatchObject({ state: "settled", operationFingerprint: first.fingerprint });
    expect(await reviewBoardWizardIdentity({ ...f.deps, reviewer: { review: f.review } }, structuredClone(f.input))).toEqual(first);
    expect(f.review).toHaveBeenCalledTimes(1);
    expect(f.beforeDispatch).toHaveBeenCalledTimes(1);
    expect(f.rows).toHaveLength(1);
  });

  it("routes v2 to a genuinely new character question and stricter identity review", async () => {
    const f = await fixture("board-matched-identity/v2");
    expect(qaCharacterPromptVersion("board-matched-identity/v2")).toBe(QA_CHARACTER_PROMPT_VERSION);
    expect(QA_CHARACTER_PROMPT_VERSION).not.toBe(LEGACY_QA_CHARACTER_PROMPT_VERSION);
    expect(IDENTITY_GATE_VERSION).not.toBe(LEGACY_IDENTITY_GATE_VERSION);
    expect(shaText(characterPrompt({ styled: true, ageYears: 6, qaStyleContractVersion: "board-matched-identity/v2" }))).not.toBe(LEGACY_CHARACTER_AGE6_SHA);
    const result = await reviewBoardWizardIdentity(f.deps, f.input);
    expect(result).toMatchObject({ version: IDENTITY_GATE_VERSION, approved: true,
      provenance: { promptVersion: QA_CHARACTER_PROMPT_VERSION } });
    expect(result.prompt).toBe(identityGatePrompt(6));
    expect(result.prompt).not.toContain("A recognizable detailed drawing may pass");
    expect(f.review.mock.calls[0]![0].prompt).toBe(result.prompt);
    expect(f.review.mock.calls[0]![0].images).toHaveLength(3);
  });

  it.each(["fail", "uncertain"] as const)("a v2 %s style assessment cannot approve or buy a retry", async style => {
    const f = await fixture("board-matched-identity/v2", style);
    expect(await reviewBoardWizardIdentity(f.deps, f.input)).toMatchObject({ version: IDENTITY_GATE_VERSION, approved: false });
    expect(await reviewBoardWizardIdentity(f.deps, f.input)).toMatchObject({ approved: false });
    expect(f.review).toHaveBeenCalledTimes(1);
    expect((await f.budget.readRequest("compat-game:board-wizard", IDENTITY_GATE_KEY))?.state).toBe("settled");
  });

  it("rejects crossed style and prompt versions before dispatching or reserving", async () => {
    for (const style of ["board-matched-identity/v1", "board-matched-identity/v2"] as const) {
      const f = await fixture(style);
      f.input.provenance.promptVersion = style === "board-matched-identity/v1" ? QA_CHARACTER_PROMPT_VERSION : LEGACY_QA_CHARACTER_PROMPT_VERSION;
      await expect(reviewBoardWizardIdentity(f.deps, f.input)).rejects.toThrow();
      expect(f.review).not.toHaveBeenCalled();
      expect(f.beforeDispatch).not.toHaveBeenCalled();
      expect(await f.budget.readRequest("compat-game:board-wizard", IDENTITY_GATE_KEY)).toBeNull();
    }
  });
});
