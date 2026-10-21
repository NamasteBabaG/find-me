import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
const f = vi.hoisted(() => ({ admin: true, pending: false, deferrals: 0, locale: "he", plan: vi.fn(), begin: vi.fn(), held: null as null | { id: string }, retry: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin ? { id: "synthetic-admin" } : null }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { auditLog: { findUnique: async () => null } }, synthetic: true }) }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: f.locale === "he" ? he : en }) }));
vi.mock("@/services/generation/identity-source-revision", () => ({ IDENTITY_SOURCE_REVISION_CONFIRMATION: "repair-this-world-reference-from-full-source-v1", planIdentitySourceRevision: f.plan, IDENTITY_SOURCE_RETRY_CONFIRMATION: "retry-the-same-bound-reference-operation-v1" }));
vi.mock("@/services/generation/identity-source-revision-state", () => ({ identityRevisionPending: async () => f.pending, identityRevisionHeldOf: async () => f.held, identityRevisionDeferralsOf: async () => f.deferrals, identityRevisionDiagnosticCode: () => "source-contract", identityRevisionPausedOf: async () => false }));
vi.mock("../../actions", () => ({ beginIdentitySourceRevisionAction: f.begin, retryIdentitySourceRevisionAction: f.retry }));
import { IdentitySourceRevisionForm } from "./IdentitySourceRevisionForm";
beforeAll(() => vi.stubGlobal("React", React)); afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { f.admin = true; f.pending = false; f.deferrals = 0; f.held = null; f.locale = "he"; f.plan.mockReset().mockResolvedValue({ planSha256: "a".repeat(64),
  committedMicroUsd: 1_798_509, unknownMicroUsd: 1_000_000, capMicroUsd: 4_000_000, privatePhotoId: "private-photo-must-never-render" }); f.begin.mockReset(); });
describe("reference-repair authorization is a source-bound admin operation", () => {
  it.each(["he", "en"])("shows only one explicit %s operation, its real ledger and plan digest, with no page-load mutation", async locale => {
    f.locale = locale;
    const html = renderToStaticMarkup((await IdentitySourceRevisionForm({ gameId: "game-synthetic" }))!);
    for (const text of ['$1.80', '$1.00', '$4.00', 'name="planSha256"', 'name="gameId"', 'value="repair-this-world-reference-from-full-source-v1"', 'required=""']) expect(html).toContain(text);
    expect(html).not.toContain("private-photo-must-never-render"); expect(f.begin).not.toHaveBeenCalled();
    expect(html.match(/type="submit"/g)).toHaveLength(1);
  });
  it("reads nothing without an administrator", async () => { f.admin = false; expect(await IdentitySourceRevisionForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.plan).not.toHaveBeenCalled(); });
  it("shows an existing authorization without creating another plan or submit button", async () => {
    f.pending = true; const html = renderToStaticMarkup((await IdentitySourceRevisionForm({ gameId: "game-synthetic" }))!);
    expect(html).not.toContain('type="submit"'); expect(f.plan).not.toHaveBeenCalled(); expect(f.begin).not.toHaveBeenCalled();
  });
  it("does not offer an ineligible paid-world mutation", async () => { f.plan.mockRejectedValue(Error("synthetic source drift")); expect(await IdentitySourceRevisionForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.begin).not.toHaveBeenCalled(); });
});


it("offers a service retry bound only to the exact retained diagnosis, with no page-load mutation or private record text", async () => {
  f.pending = true; f.held = { id: "held-synthetic" };
  const html = renderToStaticMarkup((await IdentitySourceRevisionForm({ gameId: "game-synthetic" }))!);
  expect(html).toContain('name="heldId" value="held-synthetic"'); expect(html).toContain('value="retry-the-same-bound-reference-operation-v1"');
  expect(html.match(/type="submit"/g)).toHaveLength(1); expect(f.retry).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
});


it("surfaces repeated scheduled deferrals without asking the parent to retry or mutating the operation", async () => {
  f.pending = true; f.deferrals = 4;
  const html = renderToStaticMarkup((await IdentitySourceRevisionForm({ gameId: "game-synthetic" }))!);
  expect(html).toContain("כמה סבבים מתוזמנים"); expect(html).toContain("(4)"); expect(html).not.toContain('type="submit"'); expect(f.begin).not.toHaveBeenCalled();
});


it("shows the full unpainted inventory rather than only the rows already created", async () => {
  f.plan.mockResolvedValue({ planSha256: "a".repeat(64), committedMicroUsd: 1_798_509, unknownMicroUsd: 1_000_000, capMicroUsd: 4_000_000,
    completion: { newPicturesStillNeeded: 20, currentCanonicalReviewsStillNeeded: 27 } });
  const html = renderToStaticMarkup((await IdentitySourceRevisionForm({ gameId: "game-synthetic" }))!);
  expect(html).toContain("ציורים שעדיין נדרשים"); expect(html).toContain("<b>20</b>"); expect(html).toContain("<b>27</b>"); expect(html).toContain("אין בתוכנית הבטחה");
});
