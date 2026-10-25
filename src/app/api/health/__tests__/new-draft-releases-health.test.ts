import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ environment: {} as Record<string, unknown> }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/env", () => ({ env: () => f.environment }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { $queryRaw: async () => [{ value: 1 }] } }), deliverWithProblemsOf: () => false }));
import { GET } from "../route";
beforeEach(() => { f.environment = { APP_ENV: "qa", STORAGE_PROVIDER: "db", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_PAINTER: "low-v1",
  LOCAL_PATCH_QUALITY_CHANNEL: "anthropic-batch-v1", LOCAL_PATCH_VISUAL_REVIEW: "dual-high-v3", GENERATION_PROVIDER: "openai",
  OPENAI_API_KEY: "synthetic", ANTHROPIC_API_KEY: "synthetic" }; });
const health = async () => { const response = await GET(new Request("https://qa.example.invalid/api/health")); return { status: response.status, body: await response.json() }; };

describe("health reports the painter new drafts are pinned to", () => {
  it("shows LOW in its qualified configuration", async () => {
    expect(await health()).toMatchObject({ status: 200, body: { ok: true, painter: { newGames: "low-v1", qualified: true } } });
  });
  it.each([{ LOCAL_PATCH_PROMPT_RELEASE: "v18" }, { LOCAL_PATCH_VISUAL_REVIEW: "dual-high-v1" }, { LOCAL_PATCH_VISUAL_REVIEW: "legacy" }])(
    "fails while LOW would refuse every new draft: %j", async changed => {
      Object.assign(f.environment, changed);
      expect(await health()).toMatchObject({ status: 503, body: { ok: false, painter: { newGames: "low-v1", qualified: false } } });
    });
  it("reports each content version's own quality by default, and outside QA", async () => {
    Object.assign(f.environment, { LOCAL_PATCH_PAINTER: "by-version", LOCAL_PATCH_QUALITY_CHANNEL: "sync" });
    expect(await health()).toMatchObject({ status: 200, body: { painter: { newGames: "by-version", qualified: true } } });
    Object.assign(f.environment, { APP_ENV: "production", LOCAL_PATCH_PAINTER: "low-v1" });
    expect((await health()).body.painter).toEqual({ newGames: "by-version", qualified: true });
  });
});

describe("health reports how new drafts' Opus quality questions are delivered", () => {
  it("shows Message Batches in its qualified, configured state", async () => {
    expect(await health()).toMatchObject({ status: 200, body: { ok: true, qualityChannel: { newGames: "anthropic-batch-v1", qualified: true, configured: true } } });
  });
  it("fails while every new draft would be refused, or its pinned games could not be served", async () => {
    Object.assign(f.environment, { LOCAL_PATCH_VISUAL_REVIEW: "dual-high-v1" });
    expect(await health()).toMatchObject({ status: 503, body: { qualityChannel: { qualified: false } } });
    Object.assign(f.environment, { LOCAL_PATCH_VISUAL_REVIEW: "dual-high-v3", ANTHROPIC_API_KEY: " " });
    expect(await health()).toMatchObject({ status: 503, body: { qualityChannel: { qualified: true, configured: false } } });
  });
  it("reports synchronous delivery by default and outside QA", async () => {
    Object.assign(f.environment, { LOCAL_PATCH_QUALITY_CHANNEL: "sync" });
    expect((await health()).body.qualityChannel).toEqual({ newGames: "sync", qualified: true, configured: true });
    Object.assign(f.environment, { APP_ENV: "production", LOCAL_PATCH_QUALITY_CHANNEL: "anthropic-batch-v1", LOCAL_PATCH_PAINTER: "by-version" });
    expect((await health()).body.qualityChannel).toEqual({ newGames: "sync", qualified: true, configured: true });
  });
});


describe('health reports the prospective Detective judge separately from historical policies',()=>{
 it('identifies one combined SOL LOW answer and the ordinary 4m cap for qualified new Detectives',async()=>{
  Object.assign(f.environment,{LOCAL_PATCH_LEAN:'lean-v1',LOCAL_PATCH_IDENTITY_SOURCE:'full-source-v1'});
  expect((await health()).body.visualReview.detectivesNewGames).toMatchObject({version:'detectives-operational/v1',reviewMode:'single-sol-medium/v1',model:'gpt-6.1-sol',effort:'medium',birthReviewMode:'single-sol-low/v1',birthEffort:'low',nativeHeadReturnEvidence:true,oneUsableAssessmentPerImage:true,normalImageAttemptLimit:3,worldCapMicroUsd:4000000,automaticBudgetExtension:false});
 });
 it.each([{APP_ENV:'production'},{LOCAL_PATCH_IDENTITY_SOURCE:'legacy'},{LOCAL_PATCH_LEAN:'off'},{STORAGE_PROVIDER:'local'}])('does not advertise the new Detective policy in an unqualified deployment: %j',async change=>{
  Object.assign(f.environment,{LOCAL_PATCH_LEAN:'lean-v1',LOCAL_PATCH_IDENTITY_SOURCE:'full-source-v1'},change);
  expect((await health()).body.visualReview.detectivesNewGames).toBeNull();
 });
});
