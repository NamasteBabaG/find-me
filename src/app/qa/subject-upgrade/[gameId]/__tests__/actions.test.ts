import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ appEnv: "qa", user: { id: "owner-synthetic", email: "synthetic@example.invalid" } as { id: string; email: string } | null,
  ownerId: "owner-synthetic", origin: "https://qa.example.invalid", site: "same-origin", grant: true,
  apply: vi.fn(), qaAccess: vi.fn(), spend: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => f.qaAccess() }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => f.user }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: f.origin, host: "qa.example.invalid", "sec-fetch-site": f.site }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("not-found"); }, redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: async () => ({ ownerId: f.ownerId }) } } }) }));
vi.mock("@/services/generation/board-conditioned-wizard", () => ({ assertGenerationSpendAllowed: async () => { f.spend(); if (!f.grant) throw Error("tester-refused"); } }));
vi.mock("@/services/generation/subject-upgrade", () => ({ applySubjectUpgrade: (...args: unknown[]) => f.apply(...args) }));
import { applyOwnedQaSubjectUpgrade } from "../actions";
const data = () => { const fd = new FormData(); fd.set("gameId", "game-synthetic"); fd.set("planSha256", "a".repeat(64)); return fd; };
beforeEach(() => {
  f.appEnv = "qa"; f.user = { id: "owner-synthetic", email: "synthetic@example.invalid" }; f.ownerId = "owner-synthetic";
  f.origin = "https://qa.example.invalid"; f.site = "same-origin"; f.grant = true;
  f.apply.mockReset(); f.qaAccess.mockReset(); f.spend.mockReset();
});
describe("owned QA subject upgrade entry point", () => {
  it.each(["production", "development"])("does nothing outside QA (%s)", async appEnv => {
    f.appEnv = appEnv; await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("not-found"); expect(f.apply).not.toHaveBeenCalled();
  });
  it("requires a signed-in owner, never the draft capability alone", async () => {
    f.user = null; await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("not-found");
    f.user = { id: "another-synthetic", email: "another@example.invalid" };
    await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("not-found"); expect(f.apply).not.toHaveBeenCalled();
  });
  it("refuses cross-origin requests and duplicate or malformed inputs before apply", async () => {
    f.origin = "https://outside.invalid"; await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("not-found");
    f.origin = "https://qa.example.invalid"; f.site = "cross-site";
    await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("not-found"); f.site = "same-origin";
    const duplicate = data(); duplicate.append("gameId", "other"); await expect(applyOwnedQaSubjectUpgrade(duplicate)).rejects.toThrow("not-found");
    const malformed = data(); malformed.set("planSha256", "not-a-plan"); await expect(applyOwnedQaSubjectUpgrade(malformed)).rejects.toThrow("not-found");
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("keeps the existing tester/spend gate", async () => {
    f.grant = false; await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("tester-refused"); expect(f.apply).not.toHaveBeenCalled();
  });
  it("records the authenticated owner as USER and returns to the existing game", async () => {
    await expect(applyOwnedQaSubjectUpgrade(data())).rejects.toThrow("redirect:/creating/game-synthetic");
    expect(f.qaAccess).toHaveBeenCalledOnce(); expect(f.spend).toHaveBeenCalledOnce();
    expect(f.apply).toHaveBeenCalledWith(expect.anything(), { gameId: "game-synthetic", ownerId: "owner-synthetic", operatorId: "owner-synthetic",
      actorType: "USER", expectedPlanSha256: "a".repeat(64) });
  });
});
