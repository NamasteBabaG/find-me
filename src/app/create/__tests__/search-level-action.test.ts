import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ lookup: vi.fn(), user: vi.fn(), create: vi.fn(), choose: vi.fn(), terms: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/purchasing", async original => ({ ...await original<typeof import("@/lib/purchasing")>(), purchasingEnabled: () => true }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => undefined }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.lookup }, childWorldPurchase: { findFirst: async () => null } } }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => "draft-token", setDraftCookie: f.cookie }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "he" }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (fn: () => unknown) => fn() }));
vi.mock("@/services/create-flow.service", async importOriginal => ({ ...await importOriginal<typeof import("@/services/create-flow.service")>(),
  createDraft: f.create, searchLevelTerms: f.terms }));
vi.mock("@/services/family.service", () => ({ chooseDraftChild: f.choose }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
import { saveNameAction } from "../actions";

const form = (level?: string) => {
  const data = new FormData(); data.set("name", "Synthetic"); data.set("ageYears", "8"); data.set("familyChildId", "");
  if (level !== undefined) data.set("searchLevel", level);
  return data;
};
const terms = (asked: boolean, detectives: boolean) => ({ asked, required: asked, stale: false, openPayment: false, detectives });
beforeEach(() => {
  vi.clearAllMocks();
  f.user.mockResolvedValue(null);
  f.lookup.mockResolvedValue({ id: "draft", draftToken: "draft-token", ownerId: null, status: "DRAFT", styleVersion: "local-patch-world-v1", childProfile: null, scenes: [] });
  f.create.mockResolvedValue({ gameId: "new-draft", draftToken: "new-token" });
  f.choose.mockResolvedValue({ ok: true });
  f.terms.mockResolvedValue(terms(true, true));
});

it("keeps a legacy form's meaning: no field, nothing asked, the level is left alone", async () => {
  f.terms.mockResolvedValue(terms(false, false));
  await expect(saveNameAction(null, form())).rejects.toThrow("redirect:/create/photo");
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ageYears: 8, searchLevel: undefined }));
});

it("refuses a sent Detectives answer that cannot be sold now, even where the cards are no longer asked", async () => {
  f.terms.mockResolvedValue(terms(false, false));
  expect(await saveNameAction(null, form("detectives"))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
  f.lookup.mockResolvedValue(null);
  expect(await saveNameAction(null, form("detectives"))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
  expect(f.choose).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled();
});

it("keeps a sent Explorers answer even where the cards are no longer asked", async () => {
  f.terms.mockResolvedValue(terms(false, false));
  await expect(saveNameAction(null, form("explorers"))).rejects.toThrow("redirect:/create/photo");
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ searchLevel: "explorers" }));
});

it.each([undefined, "", "hard", "מגלים"])("requires a closed-list answer where the cards are asked (%j)", async level => {
  expect(await saveNameAction(null, form(level))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
  expect(f.choose).not.toHaveBeenCalled();
});

it("never saves Detectives where it cannot be sold", async () => {
  f.terms.mockResolvedValue(terms(true, false));
  expect(await saveNameAction(null, form("detectives"))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
  expect(f.choose).not.toHaveBeenCalled();
});

it("asks with the draft's own terms and saves the answer with the exact age", async () => {
  await expect(saveNameAction(null, form("explorers"))).rejects.toThrow("redirect:/create/photo");
  expect(f.terms).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "draft", styleVersion: "local-patch-world-v1" }));
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "draft", ageYears: 8, searchLevel: "explorers" }));
  expect(f.create).not.toHaveBeenCalled();
});

describe("a saved draft whose child is changed in the form", () => {
  // The first child's draft predates the cards; a new draft would be asked.
  beforeEach(() => {
    f.user.mockResolvedValue({ id: "synthetic-parent", email: "synthetic-parent@example.invalid" });
    f.lookup.mockResolvedValue({ id: "legacy", draftToken: "draft-token", ownerId: "synthetic-parent", status: "DRAFT", styleVersion: "local-patch-world-v1",
      searchLevel: null, childProfileId: "legacy-profile", familyChildId: "old-child", childProfile: { id: "legacy-profile" }, scenes: [] });
    f.terms.mockImplementation(async (_c: unknown, draft: unknown) => terms(!draft, true));
  });
  const forChild = (familyChildId: string, level?: string) => { const data = form(level); data.set("familyChildId", familyChildId); return data; };

  it.each(["new-child", ""])("starts a new draft for another child (%j) on a new draft's terms", async other => {
    expect(await saveNameAction(null, forChild(other))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
    expect(f.terms).toHaveBeenCalledWith(expect.anything(), null);
    expect(f.create).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled();
    await expect(saveNameAction(null, forChild(other, "explorers"))).rejects.toThrow("redirect:/create/photo");
    expect(f.create).toHaveBeenCalledWith(expect.anything(), "synthetic-parent", "he", { askSearchLevel: true });
    expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "new-draft", familyChildId: other || null, searchLevel: "explorers" }));
  });

  it("continues the draft for its own child on the draft's terms, with no answer needed", async () => {
    await expect(saveNameAction(null, forChild("old-child"))).rejects.toThrow("redirect:/create/photo");
    expect(f.terms).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "legacy" }));
    expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "legacy", familyChildId: "old-child", searchLevel: undefined }));
    expect(f.create).not.toHaveBeenCalled();
  });
});

it("pins a new draft to the question it was asked, and checks the answer before creating it", async () => {
  f.lookup.mockResolvedValue(null);
  expect(await saveNameAction(null, form())).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
  expect(f.terms).toHaveBeenCalledWith(expect.anything(), null);
  expect(f.create).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled();
  await expect(saveNameAction(null, form("detectives"))).rejects.toThrow("redirect:/create/photo");
  expect(f.create).toHaveBeenCalledWith(expect.anything(), null, "he", { askSearchLevel: true });
  f.terms.mockResolvedValue(terms(false, false)); f.create.mockClear();
  await expect(saveNameAction(null, form())).rejects.toThrow("redirect:/create/photo");
  expect(f.create).toHaveBeenCalledWith(expect.anything(), null, "he", { askSearchLevel: false });
});
