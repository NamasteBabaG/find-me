import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { he } from "@/i18n/dictionaries/he";
import { PACKAGES, PACKAGE_ORDER } from "@/domain/package";
import CreatePackagePage from "../page";

vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/create-flow.service", () => ({ availablePackages: async () => PACKAGE_ORDER.map(t => PACKAGES[t]), worldsForDraft: async () => ["journey", "magic", "time"].map(slug => ({ slug })) }));
vi.mock("@/services/generation/local-patch-world", () => ({ LOCAL_PATCH_STYLE: "local-patch-world-v1" }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getCurrency: async () => "ILS", getI18n: async () => ({ t: he, locale: "he" }) }));
vi.mock("../../actions", () => ({ currentDraft: async () => ({ childProfile: { displayName: "בר", originalPhotoAssetId: "photo" }, styleVersion: "local-patch-world-v1", packageTier: "ONE_WORLD" }) }));
vi.mock("../../CreateLayout", () => ({ CreateFrame: () => null }));
vi.mock("../PackagePicker", () => ({ PackagePicker: () => null }));
afterEach(() => vi.unstubAllGlobals());

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
