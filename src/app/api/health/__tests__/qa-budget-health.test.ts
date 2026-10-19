import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ environment: {} as Record<string, unknown> }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/env", () => ({ env: () => f.environment }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { $queryRaw: async () => [{value:1}] } }), deliverWithProblemsOf: () => false }));
import { GET } from "../route";
beforeEach(() => { f.environment = { APP_ENV: "qa", STORAGE_PROVIDER: "db", LOCAL_PATCH_PROMPT_RELEASE: "v19",
  LOCAL_PATCH_VISUAL_REVIEW: "dual-high-v3", OPENAI_API_KEY: "synthetic", ANTHROPIC_API_KEY: "synthetic" }; });
describe("health reports deployment config using its pinned-review contract", () => {
  it("shows the new QA six-dollar policy for the deploy flag, with both HIGH judges", async () => {
    const response = await GET(new Request("https://qa.example.invalid/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.worldBudget).toEqual({ newQaPolicy: { version: "local-patch:new-qa-world-six-dollar/v1", capMicroUsd: 6_000_000 }, historicalDefaultCapMicroUsd: 5_000_000 });
    expect(body.visualReview.quality).toEqual({ model: "claude-opus-5-5", effort: "high" });
    expect(body.visualReview.continuity).toEqual({ model: "gpt-6.1-sol", effort: "high" });
  });
  it.each([{APP_ENV:"production"}, {APP_ENV:"development"}, {STORAGE_PROVIDER:"local"},
    {LOCAL_PATCH_PROMPT_RELEASE:"v15"}, {LOCAL_PATCH_VISUAL_REVIEW:"dual-high-v1"}])("does not advertise a new grant outside its exact QA contract: %j", async changed => {
    Object.assign(f.environment, changed);
    const body = await (await GET(new Request("https://qa.example.invalid/api/health"))).json();
    expect(body.worldBudget).toEqual({ newQaPolicy:null, historicalDefaultCapMicroUsd:5_000_000 });
  });
  it("says whether new drafts are pinned lean, and fails health when lean cannot run (local-patch-lean/v1)", async () => {
    const health = async () => { const response = await GET(new Request("https://qa.example.invalid/api/health")); return { status: response.status, body: await response.json() }; };
    expect((await health()).body.lean).toEqual({ newGames: "off", qualified: true, configured: true });
    Object.assign(f.environment, { LOCAL_PATCH_LEAN: "lean-v1", GENERATION_PROVIDER: "openai" });
    expect(await health()).toMatchObject({ status: 200, body: { ok: true, lean: { newGames: "lean-v1", qualified: true, configured: true, worldCapMicroUsd: 4_000_000 } } });
    Object.assign(f.environment, { LOCAL_PATCH_PROMPT_RELEASE: "v18" });
    expect(await health()).toMatchObject({ status: 503, body: { ok: false, lean: { qualified: false } } });
    Object.assign(f.environment, { LOCAL_PATCH_PROMPT_RELEASE: "v19", OPENAI_API_KEY: "" });
    expect(await health()).toMatchObject({ status: 503, body: { ok: false, lean: { configured: false } } });
  });
});
