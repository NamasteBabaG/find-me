// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { formatMoney, tf } from "@/i18n";
import { WORLD_PRICES, priceFor } from "@/domain/package";
import { Pricing } from "../sections";

vi.mock("../Reveal", () => ({ Reveal: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("homepage pricing", () => {
  it.each(["en", "he"] as const)("tells one price story in %s: the first world, then each additional world", locale => {
    const t = locale === "he" ? he : en;
    const view = render(<Pricing t={t} locale={locale} currency="ILS" allowedTiers={["ONE_WORLD"]} />);
    // One offer, not a ladder of package cards to compare.
    expect(view.container.querySelectorAll(".offer")).toHaveLength(1);
    expect(view.container.querySelector(".plan")).toBeNull();
    const prices = [...view.container.querySelectorAll(".offer__price")].map(price => price.textContent);
    expect(prices).toEqual([formatMoney(WORLD_PRICES.ILS.first, "ILS", locale), formatMoney(WORLD_PRICES.ILS.additional, "ILS", locale)]);
    const links = view.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/create");
    expect(links[0]!.textContent).toBe(t.home.pricing.start);
  });

  it("adds a bundle link only when the purchase policy explicitly allows its tier", () => {
    const view = render(<Pricing t={en} locale="en" currency="USD" allowedTiers={["ONE_WORLD", "TWO_WORLDS"]} />);
    const links = view.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[1]!.textContent).toBe(tf(en.home.pricing.bundle, { count: 2, price: formatMoney(priceFor("TWO_WORLDS", "USD"), "USD", "en") }));
  });

  it("offers no purchase link when the authoritative policy has no available tiers", () => {
    const view = render(<Pricing t={en} locale="en" currency="USD" allowedTiers={[]} />);
    expect(view.queryAllByRole("link")).toHaveLength(0);
  });
});
