import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
const f = vi.hoisted(() => ({ admin: true, locale: "he", plan: vi.fn(), grant: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin ? { id: "synthetic-admin" } : null }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: f.locale === "he" ? he : en }) }));
vi.mock("@/services/generation/lean-capacity-recovery", () => ({ planLeanCapacityRecovery: f.plan }));
vi.mock("../../actions", () => ({ authorizeLeanCapacityRecoveryAction: f.grant }));
import { LeanCapacityRecoveryForm } from "./LeanCapacityRecoveryForm";
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { f.admin = true; f.locale = "he"; f.grant.mockReset(); f.plan.mockReset().mockResolvedValue({
  binding: { committedMicroUsd: 5_200_000, reservedMicroUsd: 3_000_000 }, planSha256: "a".repeat(64) }); });
it.each(["he", "en"])("shows a truthful %s capacity request without changing the world on page load", async locale => {
  f.locale = locale;
  const html = renderToStaticMarkup(await LeanCapacityRecoveryForm({ gameId: "synthetic-world" }));
  const p = locale === "he" ? he.adminIdentityRevision : en.adminIdentityRevision;
  expect(html).toContain(p.capacityRecoveryTitle); expect(html).toContain(p.capacityRecoveryConfirm);
  expect(html).toContain("5.20"); expect(html).toContain("3.00"); expect(html).toContain("12.00");
  expect(html).toContain('type="checkbox"'); expect(html).toContain('required=""');
  expect(html).toContain('name="planSha256"'); expect(html).not.toContain("snapshotJson");
  expect(f.grant).not.toHaveBeenCalled();
});
it("hides the form without an administrator or without a current eligible plan", async () => {
  f.admin = false; expect(await LeanCapacityRecoveryForm({ gameId: "synthetic-world" })).toBeNull(); expect(f.plan).not.toHaveBeenCalled();
  f.admin = true; f.plan.mockRejectedValue(Error("synthetic accounting hold"));
  expect(await LeanCapacityRecoveryForm({ gameId: "synthetic-world" })).toBeNull(); expect(f.grant).not.toHaveBeenCalled();
});
