import { afterEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyTestSchema } from "../../../lib/test-schema";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { purchaseOnce } from "../paid-operation";
import * as style from "../board-wizard-identity-style";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { captureIdentity, imageBill, pilotBudget, PILOT_WORLD, runPilot } from "../../../../scripts/local-patch-style-pilot";

const good = { model: "gpt-image-2", data: [{ b64_json: "raw-paid-output" }], usage: {
  input_tokens: 30, input_tokens_details: { text_tokens: 10, image_tokens: 20 }, output_tokens: 50,
} };
const captured = (body: unknown) => ({ status: 200, requestId: "req_pilot_test", jsonBase64: Buffer.from(JSON.stringify(body)).toString("base64") });
const clients: PrismaClient[] = [];
async function database() {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "findme-pilot-test-")), "pilot.sqlite");
  const db = new PrismaClient({ datasources: { db: { url: `file:${file.replaceAll("\\", "/")}` } } });
  clients.push(db); await applyTestSchema(db);
  return { db, ledger: pilotBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db))), store: new PrismaRetainedPurchaseStore(db) };
}
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await Promise.all(clients.splice(0).map(db => db.$disconnect())); });

describe("opt-in public style pilot", () => {
  it("defaults to a free preflight and performs no fetch", async () => {
    const sourceRoot = process.cwd(), testRoot = mkdtempSync(path.join(os.tmpdir(), "findme-pilot-dry-"));
    for (const source of ["public/demo/example-photo.jpg", localPatchBoardForVersion("sydney", 7)!.art]) {
      mkdirSync(path.dirname(path.join(testRoot, source)), { recursive: true }); copyFileSync(path.join(sourceRoot, source), path.join(testRoot, source));
    }
    // Read the real shared child-free style assets; isolate every output so a
    // later test can never overwrite or depend on the opt-in paid experiment.
    const makeStyle = style.buildBoardWizardIdentityStyle, makePeople = style.buildBoardPeopleStyle;
    vi.spyOn(style, "buildBoardWizardIdentityStyle").mockImplementation(() => makeStyle(sourceRoot));
    vi.spyOn(style, "buildBoardPeopleStyle").mockImplementation(board => makePeople(board, sourceRoot));
    const network = vi.fn(() => { throw new Error("Dry run must never make a network call"); });
    vi.stubGlobal("fetch", network);
    await expect(runPilot([], testRoot)).resolves.toMatchObject({ dryRun: true, paidCalls: 0, capUsd: 0.60, proposedImages: 3, proposedReviews: 3 });
    expect(network).not.toHaveBeenCalled();
  }, 60_000);

  it("enforces the inclusive ceiling inside concurrent real CAS reservations", async () => {
    const { ledger } = await database();
    const results = await Promise.allSettled(["a", "b"].map(requestKey => ledger.reserve(PILOT_WORLD, {
      requestKey, scope: "image", operationFingerprint: requestKey, reserveMicroUsd: 400_000,
    })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await ledger.audit(PILOT_WORLD)).reservedMicroUsd).toBe(400_000);
  });

  it("keeps a bounded raw image response durably before any image processing, and replays it", async () => {
    const { db, ledger, store } = await database();
    const wire = vi.fn(async () => new Response(JSON.stringify(good), { status: 200, headers: { "x-request-id": "req_pilot_test" } }));
    let processed = false;
    const invoke = async () => {
      const form = new FormData(); form.set("model", "gpt-image-2"); form.set("quality", "medium"); form.set("n", "1");
      const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", body: form });
      await response.json(); processed = true;
    };
    const request = { worldId: PILOT_WORLD, requestKey: "identity:1", scope: "identity" as const, operationFingerprint: "test-identity-v1", reserveMicroUsd: 150_000,
      buy: async () => { const raw = await captureIdentity(invoke, wire); const evidence = imageBill(raw); if (!evidence) throw new Error("Fixture must be priceable"); return { bytes: Buffer.from(JSON.stringify(raw)), evidence }; } };
    const first = await purchaseOnce({ ledger, store }, request);
    expect(first.kind).toBe("bought"); expect(processed).toBe(false);
    const retained = await new PrismaRetainedPurchaseStore(db).get(PILOT_WORLD, "identity:1");
    expect(JSON.parse(Buffer.from(JSON.parse(retained!.bytes.toString()).jsonBase64, "base64").toString())).toEqual(good);
    expect((await purchaseOnce({ ledger, store: new PrismaRetainedPurchaseStore(db) }, request)).kind).toBe("bought");
    expect(wire).toHaveBeenCalledTimes(1);
  });

  it("prices only consistent usage from the requested image model and labels it an estimate", () => {
    expect(imageBill(captured(good))).toMatchObject({ model: "gpt-image-2", costBasis: "conservative-upper-estimate" });
    expect(imageBill(captured({ ...good, model: "unexpected-model" }))).toBeNull();
    expect(imageBill(captured({ ...good, usage: { ...good.usage, input_tokens: 31 } }))).toBeNull();
    expect(imageBill(captured({ ...good, usage: undefined }))).toBeNull();
    expect(imageBill(captured({ ...good, usage: { ...good.usage, total_tokens: 900 } }))).toBeNull();
  });
});
