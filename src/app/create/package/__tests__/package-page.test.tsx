import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { he } from "@/i18n/dictionaries/he";
import { PACKAGES, PACKAGE_ORDER } from "@/domain/package";
import CreatePackagePage from "../page";
import { formatMoney } from "@/i18n";

const pricing = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, eligible: vi.fn() }));

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ availablePackages: async () => PACKAGE_ORDER.map(t => PACKAGES[t]), worldsForDraft: async () => ["journey", "magic", "time"].map(slug => ({ slug })) }));
vi.mock("@/services/generation/local-patch-world", () => ({ LOCAL_PATCH_STYLE: "local-patch-world-v1" }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => pricing.user, isAdminEmail: () => false }));
vi.mock("@/services/child-pricing.service", () => ({ childHasPaidWorld: pricing.eligible }));
vi.mock("@/i18n/server", () => ({ getCurrency: async () => "ILS", getI18n: async () => ({ t: he, locale: "he" }) }));
vi.mock("../../actions", () => ({ currentDraft: async () => ({ id: "draft", ownerId: "parent", familyChildId: "passport", childProfile: { displayName: "בר", originalPhotoAssetId: "photo" }, styleVersion: "local-patch-world-v1", packageTier: "ONE_WORLD" }) }));
vi.mock("../../CreateLayout", () => ({ CreateFrame: () => null }));
vi.mock("../PackagePicker", () => ({ PackagePicker: () => null }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { pricing.user = null; pricing.eligible.mockReset().mockResolvedValue(false); });

it("advertises 27 hides per new QA world before any scenes have been selected", async () => {
  vi.stubGlobal("React", React);
  const page = await CreatePackagePage();
  const options = page.props.children.props.options as { meta: string }[];
  expect(options).toHaveLength(3);
  expect(options[0]!.meta).toContain("27");
  expect(options[1]!.meta).toContain("54");
  expect(options[2]!.meta).toContain("81");
  expect(options[0]!.meta).not.toContain("45");
});

it.each([false, true])("shows the server-verified passport prices (eligible=%s)", async eligible => {
  vi.stubGlobal("React", React);
  pricing.user = { id: "parent", email: "parent@example.invalid" };
  pricing.eligible.mockResolvedValue(eligible);
  const page = await CreatePackagePage();
  const picker = page.props.children.props;
  expect(picker.options.map((o: { price: string }) => o.price)).toEqual((eligible ? [3000, 6000, 9000] : [3900, 6900, 9900]).map(p => formatMoney(p, "ILS", "he")));
  expect(picker.options[0].name).toBe(eligible ? he.home.pricing.additionalTitle : "הרפתקה ראשונה");
  expect(pricing.eligible).toHaveBeenCalledWith(undefined, { ownerId: "parent", familyChildId: "passport", excludeGameId: "draft" });
});

it("never offers a passport discount to a different signed-in account", async () => {
  vi.stubGlobal("React", React);
  pricing.user = { id: "another-parent", email: "other@example.invalid" };
  pricing.eligible.mockResolvedValue(true);
  const page = await CreatePackagePage();
  expect(page.props.children.props.options[0].price).toBe(formatMoney(3900, "ILS", "he"));
  expect(pricing.eligible).not.toHaveBeenCalled();
});
