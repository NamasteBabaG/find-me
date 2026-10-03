// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { Pricing } from "../sections";

vi.mock("../Reveal", () => ({ Reveal: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div> }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("homepage package availability", () => {
  it.each(["en", "he"] as const)("offers only the authorized single-world purchase in %s", locale => {
    const t = locale === "he" ? he : en;
    const view = render(<Pricing t={t} locale={locale} currency="ILS" allowedTiers={["ONE_WORLD"]} />);
    const purchaseLinks = view.getAllByRole("link");
    expect(purchaseLinks).toHaveLength(1);
    expect(purchaseLinks[0]!.getAttribute("href")).toBe("/create");
    const cards = view.container.querySelectorAll(".plan");
    expect(cards).toHaveLength(3);
    expect(cards[0]!.querySelector("a")).not.toBeNull();
    expect(cards[1]!.querySelector("a")).toBeNull();
    expect(cards[2]!.querySelector("a")).toBeNull();
    expect(view.getAllByText(t.home.pricing.soon)).toHaveLength(2);
    expect(view.container.querySelector(".plan__ribbon")).toBeNull();
  });

  it("shows a bundle CTA only when the purchase policy explicitly allows its tier", () => {
    const view = render(<Pricing t={en} locale="en" currency="USD" allowedTiers={["ONE_WORLD", "TWO_WORLDS"]} />);
    expect(view.getAllByRole("link")).toHaveLength(2);
    const cards = view.container.querySelectorAll(".plan");
    expect(cards[1]!.querySelector("a")).not.toBeNull();
    expect(cards[2]!.querySelector("a")).toBeNull();
    expect(view.getAllByText(en.home.pricing.soon)).toHaveLength(1);
  });

  it("offers no purchase CTA when the authoritative policy has no available tiers", () => {
    const view = render(<Pricing t={en} locale="en" currency="USD" allowedTiers={[]} />);
    expect(view.queryAllByRole("link")).toHaveLength(0);
  });
});
