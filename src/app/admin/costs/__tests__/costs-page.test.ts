import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ rows: [] as Array<{ gameId: string; childName: string; priceMinor: number; currency: "USD"; generationCents: number | null; attempts: number; marginPct: number | null }> }));
vi.mock("@/services/admin.service", () => ({ costDashboard: async () => fixture.rows }));
vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
import CostsPage from "../page";
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const row = (id: string, generationCents: number | null) => ({ gameId: id, childName: "Synthetic", priceMinor: 1500, currency: "USD" as const, generationCents, attempts: 0, marginPct: null });
describe("admin unknown-cost rendering", () => {
  it("renders unknown rows without inventing a zero bill or averaging them in", async () => {
    fixture.rows = [row("known", 100), row("unknown", null)];
    const html = renderToStaticMarkup(await CostsPage());
    expect(html).toContain("עלות לא זמינה"); expect(html).toContain("עלות ידועה בלבד");
    expect(html).toContain("ממוצע למשחקים עם עלות ידועה");
    expect(html).toContain("לא נכללים בסכום ובממוצע");
    expect(html).not.toContain("NaN"); expect(html).not.toContain("Infinity");
    expect(html).not.toMatch(/0\.50/);
  });
  it("all-unknown costs have no numeric total or mean", async () => {
    fixture.rows = [row("unknown", null)];
    const html = renderToStaticMarkup(await CostsPage());
    expect(html).toContain("לא זמין"); expect(html).not.toMatch(/0\.00|NaN|Infinity/);
  });
  it("genuine known zero remains zero and is not labelled unknown", async () => {
    fixture.rows = [row("zero", 0)];
    const html = renderToStaticMarkup(await CostsPage());
    expect(html).not.toContain("עלות לא זמינה"); expect(html).not.toContain("עלות ידועה בלבד");
    expect(html).toContain("ממוצע:");
  });
});
