import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ lookup: vi.fn(), user: vi.fn(), access: vi.fn(), create: vi.fn(), choose: vi.fn(), cookie: vi.fn(), token: "draft-token" }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.access }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.lookup } } }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => f.token, setDraftCookie: f.cookie }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (fn: () => unknown) => fn() }));
vi.mock("@/services/create-flow.service", async importOriginal => ({ ...await importOriginal<typeof import("@/services/create-flow.service")>(), createDraft: f.create }));
vi.mock("@/services/family.service", () => ({ chooseDraftChild: f.choose }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`redirect:${url}`); } }));
import { currentDraft, saveNameAction } from "../actions";

beforeEach(() => {
  vi.clearAllMocks(); f.token = "draft-token"; f.access.mockResolvedValue(undefined); f.user.mockResolvedValue({ id: "owner" });
  f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: "owner", status: "PHOTO_APPROVED", childProfile: { displayName: "Example" }, scenes: [] });
});
it("reads an authorized editable draft and its relations in one query", async () => {
  expect(await currentDraft()).toMatchObject({ id: "draft", childProfile: { displayName: "Example" }, scenes: [] });
  expect(f.lookup).toHaveBeenCalledOnce(); expect(f.access).toHaveBeenCalledOnce();
  expect(f.lookup.mock.calls[0]![0].include).toEqual({ childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } });
});
it.each(["foreign", "locked", "no-cookie"])("still rejects a %s draft", async kind => {
  if (kind === "foreign") f.lookup.mockResolvedValue({ id: "draft", draftToken: "different", ownerId: "different", status: "DRAFT" });
  if (kind === "locked") f.lookup.mockResolvedValue({ id: "draft", draftToken: f.token, ownerId: "owner", status: "READY" });
  if (kind === "no-cookie") f.token = "";
  expect(await currentDraft()).toBeNull();
});
it("starts a fresh child's draft without fetching an empty draft again before the guarded mutation", async () => {
  f.create.mockResolvedValue({ gameId: "new-draft", draftToken: "new-token" }); f.choose.mockResolvedValue({ ok: true });
  const form = new FormData(); form.set("name", "Example"); form.set("ageYears", "8"); form.set("freshAdventure", "1");
  await expect(saveNameAction(null, form)).rejects.toThrow("redirect:/create/photo");
  expect(f.lookup).not.toHaveBeenCalled();
  expect(f.choose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ gameId: "new-draft", actorId: "owner", draftToken: "new-token", ageYears: 8 }));
});
