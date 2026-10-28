import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { DETECTIVE_IDENTITY_STYLE_SOURCES, DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "../../../../content/detectives/identity-style-release";
import { DETECTIVE_SOURCE_BOARDS } from "../../../../content/detectives/source-release";
import { localPatchBoardForVersion, localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { OpenAiIdentityStyleReviewer } from "../../../infra/generation/identity-style-reviewer";
import type { WorldBudgetSnapshot } from "../world-budget";
import { boardWizardBudget } from "../board-wizard-budget";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { identityStyleCatalogSha256 } from "../local-patch-identity-catalog";
import { prepareLocalPatchIdentityReferences } from "../local-patch-identity-reference";
import { identityReceiptReadyForPublication, reviewBoardWizardIdentity, type IdentityProvenance } from "../board-wizard-identity-gate";
import { readCollectionArt } from "../collection-art";
import { sha256Bytes } from "../fixed-sprite";

const settings = vi.hoisted(() => ({ APP_URL: "https://detective-art.example", APP_ENV: "qa" }));
vi.mock("../../../lib/env", () => ({ env: () => settings }));

describe("qualified Detective source and identity family", () => {
  it("resolves both explicit Detective families without borrowing Explorer sources", async () => {
    const boards = localPatchBoardsForVersion(13);
    expect(boards).toHaveLength(18);
    expect(boards.flatMap(board => board.hides)).toHaveLength(54);
    expect(new Set(boards.flatMap(board => board.hides.map(hide => hide.id))).size).toBe(54);
    expect(boards.every(board => board.art.includes("-detectives-") && board.hides.every(hide => hide.id.includes("-detectives-")))).toBe(true);
    expect(localPatchBoardForVersion("castlegate", 13)?.art).toContain("kingdom-castlegate-detectives");
    expect(localPatchBoardsForVersion(14)).toEqual([]);
    expect(localPatchBoardForVersion("newyork", 12)?.art).not.toBe(boards[0]!.art);
    expect(await identityStyleCatalogSha256("newyork", 13)).toBe(DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256);
    expect(await identityStyleCatalogSha256("newyork", 12)).toBe("e3a7558b783174c3655d810be3f711cfba373d8b549bfedfe957a15e052bac70");
  });

  it("builds the atlas from all nine measured Detective contexts and preserves the purchased Journey atlas", async () => {
    const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", "journey", undefined, { sceneVersion: 13 });
    expect(atlas.catalogSha256).toBe(DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256);
    expect(atlas.examples.map(row => row.boardId)).toEqual(DETECTIVE_SOURCE_BOARDS.map(row => row.board));
    expect(atlas.examples.map(row => row.boardSha256)).toEqual(DETECTIVE_IDENTITY_STYLE_SOURCES.map(row => row.sha256));
    expect(atlas.examples.map(row => {
      if (!("crop" in row)) throw Error("Expected a measured Detective source context");
      return row.crop;
    })).toEqual(DETECTIVE_IDENTITY_STYLE_SOURCES.map(row => row.crop));
    expect(atlas.atlasSha256).toBe(sha256Bytes(atlas.png));
    expect(await sharp(atlas.png).metadata()).toMatchObject({ format: "png", width: 1024, height: 1024 });
    const original = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6");
    expect(original.atlasSha256).toBe("313c054685b84ea961b52fa9a98c1ac91f26562c418eacf19000e9cac85199d6");
    expect(atlas.atlasSha256).not.toBe(original.atlasSha256);
  }, 30_000);

  it("refuses a foreign family, older style or altered retained public source rather than reusing another atlas", async () => {
    const kingdom = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", "kingdom", undefined, { sceneVersion: 13 });
    expect(kingdom.examples).toHaveLength(9);expect(kingdom.catalogSha256).not.toBe(DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256);
    await expect(buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v5", "journey", undefined, { sceneVersion: 13 })).rejects.toThrow("Detective sources");
    const source = DETECTIVE_IDENTITY_STYLE_SOURCES[0]!;
    await expect(buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", "journey", new Map([[source.sha256, Buffer.from("altered")]]), { sceneVersion: 13 })).rejects.toThrow("cached Detective source changed");
  });

  it("fetches only registered Detective bytes through the deployed CDN guard", async () => {
    const source = DETECTIVE_IDENTITY_STYLE_SOURCES[0]!, bytes = await readFile(source.art);
    const get = vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } }));
    expect((await readCollectionArt(source.art, source.sha256, "/unused", { fetch: get, cookie: "synthetic-qa" }))?.equals(bytes)).toBe(true);
    expect(get).toHaveBeenCalledWith(`${settings.APP_URL}/${source.art.slice(7)}`, expect.objectContaining({ redirect: "error", cache: "no-store" }));
    await expect(readCollectionArt(source.art, "0".repeat(64), "/unused", { fetch: get, cookie: "synthetic-qa" })).rejects.toThrow("unexpected pinned");
    expect(get).toHaveBeenCalledTimes(1);
    const html = vi.fn(async () => new Response("<html>QA gate</html>", { headers: { "content-type": "text/html" } }));
    await expect(readCollectionArt(source.art, source.sha256, "/unused", { fetch: html, cookie: "synthetic-qa" })).rejects.toThrow("static image unavailable");
  });

  it("retains the small integrated painter portrait and full independent judge portrait for13", async () => {
    const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#527e93" } }).png().toBuffer();
    const refs = await prepareLocalPatchIdentityReferences(sheet, 13), prior = await prepareLocalPatchIdentityReferences(sheet, 12);
    expect(await sharp(refs.identityPng).metadata()).toMatchObject({ width: 192, height: 192 });
    expect(await sharp(refs.judgeIdentityPng).metadata()).toMatchObject({ width: 512, height: 512 });
    expect(refs.identityPng.equals(prior.identityPng)).toBe(true);
    expect(refs.judgeIdentityPng.equals(prior.judgeIdentityPng)).toBe(true);
  });
});

const checks = { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass", sourceFaceVisible: "pass", facialVolume: "pass", viewConsistency: "pass" };
async function gateFixture(patch: Record<string, string> = {}) {
  let snapshot: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(snapshot),
    insertIfAbsent: async (_id, value) => { if (snapshot) return false; snapshot = { revision: 0, snapshot: structuredClone(value) }; return true; },
    compareAndSwap: async (_id, revision, value) => { if (!snapshot || snapshot.revision !== revision) return false; snapshot = { revision: revision + 1, snapshot: structuredClone(value) }; return true; },
  };
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store));
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#587e94" } }).png().toBuffer();
  const rows: { metaJson: string }[] = [];
  const db = { auditLog: { findUnique: async () => null, findFirst: async () => rows.at(-1) ?? null,
    create: async ({ data }: { data: { metaJson: string } }) => { rows.push(data); return data; } } } as unknown as Prisma.TransactionClient;
  const fetchOnce = vi.fn(async () => new Response(JSON.stringify({ model: "gpt-6.1-sol", usage: { prompt_tokens: 2000, completion_tokens: 400, total_tokens: 2400 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ checks: { ...checks, ...patch }, reason: "Controlled contract response; no visual acceptance claim" }) } }] }), { headers: { "x-request-id": "req_detective_identity_synthetic" } }));
  const provenance: IdentityProvenance = { promptVersion: "character-v8-full-source-volume-identity", quality: "medium", photoAssetId: "synthetic-photo", photoSha256: sha256Bytes(png), ageYears: 6, crop: null,
    style: { version: "board-matched-identity/v6", catalogSha256: DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256, atlasSha256: sha256Bytes(png) } };
  const deps = { db, budget, apiKey: "synthetic-never-live", beforeDispatch: vi.fn(async () => undefined), reviewer: new OpenAiIdentityStyleReviewer("synthetic-never-live", fetchOnce as typeof fetch),
    write: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => work(db) };
  return { input: { gameId: "synthetic-detective", identityAssetId: "synthetic-sheet", photo: png, sheet: png, atlas: png, provenance, contentVersion: 13 }, deps, fetchOnce, budget };
}

describe("Detective full-source identity gate (controlled transport, zero providers)", () => {
  it("requires the Detective recipe before dispatch and never downgrades to a legacy identity", async () => {
    const f = await gateFixture(); f.input.provenance.style.catalogSha256 = "a".repeat(64);
    await expect(reviewBoardWizardIdentity(f.deps, f.input)).rejects.toThrow("Detective identity requires");
    expect(f.fetchOnce).not.toHaveBeenCalled();
    expect((await f.budget.audit("synthetic-detective:board-wizard")).committedMicroUsd).toBe(0);
  });
  it("records the full-source independent HIGH question and replays exactly once", async () => {
    const f = await gateFixture(), receipt = await reviewBoardWizardIdentity(f.deps, f.input);
    expect(receipt).toMatchObject({ version: "board-wizard-identity-source-sol-high/v5", model: "gpt-6.1-sol", effort: "high", approved: true });
    expect(receipt.imageHashes).toHaveLength(4);
    expect(identityReceiptReadyForPublication(receipt, 13)).toBe(true);
    expect(identityReceiptReadyForPublication({ ...receipt, provenance: { ...receipt.provenance, style: { ...receipt.provenance.style, catalogSha256: "a".repeat(64) } } }, 13)).toBe(false);
    expect(await reviewBoardWizardIdentity(f.deps, f.input)).toEqual(receipt);
    expect(f.fetchOnce).toHaveBeenCalledOnce();
  });
  it.each(["identity", "age", "paintedStyle", "sheetLayout", "sourceFaceVisible", "facialVolume", "viewConsistency"])("does not select or publish a failed13 %s", async check => {
    const f = await gateFixture({ [check]: "fail" }), receipt = await reviewBoardWizardIdentity(f.deps, f.input);
    expect(identityReceiptReadyForPublication(receipt, 13)).toBe(false);
    expect(identityReceiptReadyForPublication({ ...receipt, approved: true, automaticSelection: { policy: "identity-best-of-two/v1", sourceFingerprint: receipt.fingerprint,
      candidates: [receipt.identityAssetId], selectedIdentityAssetId: receipt.identityAssetId, reason: "budget-fallback" } }, 13)).toBe(false);
  });
});
