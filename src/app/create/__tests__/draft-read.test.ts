import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ lookup: vi.fn(), intent: vi.fn(), user: vi.fn(), access: vi.fn(), create: vi.fn(), choose: vi.fn(), cookie: vi.fn(), token: "draft-token", enabled: true }));
vi.mock("@/lib/purchasing", async original => ({ ...await original<typeof import("@/lib/purchasing")>(), purchasingEnabled: () => f.enabled }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.access }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.lookup }, childWorldPurchase: { findFirst: f.intent } } }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => f.token, setDraftCookie: f.cookie }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (fn: () => unknown) => fn() }));
vi.mock("@/services/create-flow.service", async importOriginal => ({ ...await importOriginal<typeof import("@/services/create-flow.service")>(), createDraft: f.create }));
vi.mock("@/services/family.service", () => ({ chooseDraftChild: f.choose }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
import { choosePackageAction, chooseScenesAction, saveNameAction } from "../actions";
import { currentDraft } from "@/lib/server/current-draft";

beforeEach(() => {
  vi.clearAllMocks(); f.token = "draft-token"; f.access.mockResolvedValue(undefined); f.user.mockResolvedValue({ id: "owner" });
  f.enabled = true;
  f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: "owner", status: "PHOTO_APPROVED", childProfile: { displayName: "Example" }, scenes: [] });
  f.intent.mockResolvedValue({ ownerId: "owner", activeGameId: "draft" });
});
it.each(["fresh", "existing"])("prelaunch blocks %s child creation without saving names or drafts", async kind => {
  f.enabled = false;
  const form = new FormData(); form.set("name", "Synthetic"); form.set("ageYears", "8");
  if (kind === "fresh") form.set("freshAdventure", "1");
  expect(await saveNameAction(null, form)).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
  expect(f.lookup).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled(); expect(f.choose).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled();
});
it.each([choosePackageAction, chooseScenesAction])("prelaunch blocks saved-draft selection mutations", async action => {
  f.enabled = false;
  expect(await action(null, new FormData())).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
  expect(f.lookup).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
});
it("an explicit owned world draft keeps its target when another tab has changed the cookie", async () => {
  f.token = "other-tab-cookie";
  f.lookup.mockResolvedValue({ id: "selected-world", ownerId: "owner", familyChildId: "selected-child", draftToken: "original-token", status: "PACKAGE_SELECTED", scenes: [] });
  expect(await currentDraft("selected-world")).toMatchObject({ id: "selected-world" });
  expect(f.lookup.mock.calls[0]![0].where).toEqual({ id: "selected-world" });
  expect(f.intent).toHaveBeenCalledWith({ where: { activeGameId: "selected-world", ownerId: "owner", familyChildId: "selected-child" } });
});
it.each(["signed-out", "foreign-owner", "no-intent"])("an explicit draft rejects %s even with a matching cookie", async kind => {
  if (kind === "signed-out") f.user.mockResolvedValue(null);
  if (kind === "foreign-owner") f.user.mockResolvedValue({ id: "another-parent" });
  if (kind === "no-intent") f.intent.mockResolvedValue(null);
  expect(await currentDraft("draft")).toBeNull();
});
it("reads an authorized editable draft and its relations in one query", async () => {
  expect(await currentDraft()).toMatchObject({ id: "draft", childProfile: { displayName: "Example" }, scenes: [] });
  expect(f.lookup).toHaveBeenCalledOnce(); expect(f.access).toHaveBeenCalledOnce();
  expect(f.lookup.mock.calls[0]![0].include).toEqual({ childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } });
});
it.each(["foreign", "locked", "no-cookie", "deleted"])("still rejects a %s draft", async kind => {
  if (kind === "foreign") f.lookup.mockResolvedValue({ id: "draft", draftToken: "different", ownerId: "different", status: "DRAFT" });
  if (kind === "locked") f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: "owner", status: "READY" });
  if (kind === "no-cookie") f.token = "";
  if (kind === "deleted") f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: "owner", status: "DRAFT", deletedAt: new Date() });
  expect(await currentDraft()).toBeNull();
});
it("still permits an anonymous browser's matching editable cookie draft", async () => {
  f.user.mockResolvedValue(null);
  f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: null, status: "DRAFT", scenes: [] });
  expect(await currentDraft()).toMatchObject({ id: "draft" });
  expect(f.intent).not.toHaveBeenCalled();
});
it("an explicit owned continuation draft does not require the other tab's cookie", async () => {
  f.token = "";
  expect(await currentDraft("draft")).toMatchObject({ id: "draft" });
  expect(f.intent).toHaveBeenCalledOnce();
});
it("rejects at the QA gate before querying a private draft", async () => {
  f.access.mockRejectedValue(Error("qa denied"));
  await expect(currentDraft()).rejects.toThrow("qa denied");
  expect(f.lookup).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
});
it("starts a fresh child's draft without fetching an empty draft again before the guarded mutation", async () => {
  f.create.mockResolvedValue({ gameId: "new-draft", draftToken: "new-token" }); f.choose.mockResolvedValue({ ok: true });
  const form = new FormData(); form.set("name", "Example"); form.set("ageYears", "8"); form.set("freshAdventure", "1");
  await expect(saveNameAction(null, form)).rejects.toThrow("redirect:/create/photo");
  expect(f.lookup).not.toHaveBeenCalled();
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "new-draft", actorId: "owner", draftToken: "new-token", ageYears: 8 }));
});
