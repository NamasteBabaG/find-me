import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { he } from "@/i18n/dictionaries/he";
import { PACKAGES, PACKAGE_ORDER } from "@/domain/package";
import CreatePackagePage from "../page";
import { formatMoney } from "@/i18n";

const pricing = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, eligible: vi.fn(), packageTier: "ONE_WORLD" as string | null }));

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ availablePackages: async () => PACKAGE_ORDER.map(t => PACKAGES[t]), worldsForDraft: async () => ["journey", "magic", "time"].map(slug => ({ slug })), sceneVersionForLevel: () => 12,
  searchLevelTerms: async () => ({ asked: false, required: false, stale: false, openPayment: false, detectives: false }) }));
vi.mock("@/services/generation/local-patch-world", () => ({ LOCAL_PATCH_STYLE: "local-patch-world-v1" }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => pricing.user, isAdminEmail: () => false }));
vi.mock("@/services/child-pricing.service", () => ({ childHasPaidWorld: pricing.eligible }));
vi.mock("@/i18n/server", () => ({ getCurrency: async () => "ILS", getI18n: async () => ({ t: he, locale: "he" }) }));
vi.mock("@/lib/server/current-draft", () => ({ currentDraft: async () => ({ id: "draft", ownerId: "parent", familyChildId: "passport", childProfile: { displayName: "בר", originalPhotoAssetId: "photo" }, styleVersion: "local-patch-world-v1", packageTier: pricing.packageTier }) }));
vi.mock("../../CreateLayout", () => ({ CreateFrame: () => null }));
vi.mock("../PackagePicker", () => ({ PackagePicker: () => null }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => { pricing.user = null; pricing.packageTier = "ONE_WORLD"; pricing.eligible.mockReset().mockResolvedValue(false); });

it("advertises 27 hides per new QA world before any scenes have been selected", async () => {
  vi.stubGlobal("React", React);
  pricing.packageTier = null;
  const page = await CreatePackagePage({ searchParams: Promise.resolve({}) });
  const options = page.props.children.props.options as { meta: string }[];
  expect(options).toHaveLength(3);
  // The same price per world: a fresh draft starts on one world, with no recommended bundle.
  expect(page.props.children.props.defaultTier).toBe("ONE_WORLD");
  expect(options.some(o => "popular" in o)).toBe(false);
  expect(options[0]!.meta).toContain("27");
  expect(options[1]!.meta).toContain("54");
  expect(options[2]!.meta).toContain("81");
  expect(options[0]!.meta).not.toContain("45");
});

it.each([false, true])("shows the same world price whether or not the passport already owns a world (owns=%s)", async eligible => {
  vi.stubGlobal("React", React);
  pricing.user = { id: "parent", email: "parent@example.invalid" };
  pricing.eligible.mockResolvedValue(eligible);
  const page = await CreatePackagePage({ searchParams: Promise.resolve({}) });
  const picker = page.props.children.props;
  expect(picker.options.map((o: { price: string }) => o.price)).toEqual([2900, 5800, 8700].map(p => formatMoney(p, "ILS", "he")));
  expect(picker.continuationNote).toBe(he.home.pricing.addLater.replace("{price}", formatMoney(2900, "ILS", "he")));
  // Owning a world now changes only the name of the next one.
  expect(picker.options[0].name).toBe(eligible ? he.home.pricing.additionalTitle : "הרפתקה ראשונה");
  expect(pricing.eligible).toHaveBeenCalledWith(undefined, { ownerId: "parent", familyChildId: "passport", excludeGameId: "draft" });
});

it("never reads another account's passport, even for a name", async () => {
  vi.stubGlobal("React", React);
  pricing.user = { id: "another-parent", email: "other@example.invalid" };
  pricing.eligible.mockResolvedValue(true);
  const page = await CreatePackagePage({ searchParams: Promise.resolve({}) });
  expect(page.props.children.props.options[0].price).toBe(formatMoney(2900, "ILS", "he"));
  expect(page.props.children.props.options[0].name).toBe("הרפתקה ראשונה");
  expect(pricing.eligible).not.toHaveBeenCalled();
});
