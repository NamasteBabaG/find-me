import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ lookup: vi.fn(), user: vi.fn(), create: vi.fn(), choose: vi.fn(), choice: vi.fn(), cookie: vi.fn() }));
vi.mock("@/lib/purchasing", async original => ({ ...await original<typeof import("@/lib/purchasing")>(), purchasingEnabled: () => true }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => undefined }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.lookup }, childWorldPurchase: { findFirst: async () => null } } }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => "draft-token", setDraftCookie: f.cookie }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "he" }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (fn: () => unknown) => fn() }));
vi.mock("@/services/create-flow.service", async importOriginal => ({ ...await importOriginal<typeof import("@/services/create-flow.service")>(),
  createDraft: f.create, searchLevelQuestion: f.choice }));
vi.mock("@/services/family.service", () => ({ chooseDraftChild: f.choose }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
import { saveNameAction } from "../actions";

const form = (level?: string) => {
  const data = new FormData(); data.set("name", "Synthetic"); data.set("ageYears", "8"); data.set("familyChildId", "");
  if (level !== undefined) data.set("searchLevel", level);
  return data;
};
beforeEach(() => {
  vi.clearAllMocks();
  f.user.mockResolvedValue(null);
  f.lookup.mockResolvedValue({ id: "draft", draftToken: "draft-token", ownerId: null, status: "DRAFT", styleVersion: "local-patch-world-v1", childProfile: null, scenes: [] });
  f.create.mockResolvedValue({ gameId: "new-draft", draftToken: "new-token" });
  f.choose.mockResolvedValue({ ok: true });
  f.choice.mockResolvedValue({ shown: true, detectives: true });
});

it("leaves the level alone when the cards were not asked, whatever the form says", async () => {
  f.choice.mockResolvedValue({ shown: false, detectives: false });
  await expect(saveNameAction(null, form("detectives"))).rejects.toThrow("redirect:/create/photo");
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ageYears: 8, searchLevel: undefined }));
});

it.each([undefined, "", "hard", "מגלים"])("requires a closed-list answer when the cards were asked (%j)", async level => {
  expect(await saveNameAction(null, form(level))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
  expect(f.choose).not.toHaveBeenCalled();
});

it("never saves Detectives where it cannot be sold", async () => {
  f.choice.mockResolvedValue({ shown: true, detectives: false });
  expect(await saveNameAction(null, form("detectives"))).toMatchObject({ ok: false, code: "SEARCH_LEVEL_UNAVAILABLE" });
  expect(f.choose).not.toHaveBeenCalled();
});

it("asks with the draft's own engine and saves the answer with the exact age", async () => {
  await expect(saveNameAction(null, form("explorers"))).rejects.toThrow("redirect:/create/photo");
  expect(f.choice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "draft", styleVersion: "local-patch-world-v1" }));
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "draft", ageYears: 8, searchLevel: "explorers" }));
});

it("checks the answer before a new draft is created", async () => {
  f.lookup.mockResolvedValue(null);
  expect(await saveNameAction(null, form())).toMatchObject({ ok: false, code: "SEARCH_LEVEL_REQUIRED" });
  expect(f.choice).toHaveBeenCalledWith(expect.anything(), null);
  expect(f.create).not.toHaveBeenCalled();
  expect(f.cookie).not.toHaveBeenCalled();
});
