// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { PackagePicker } from "../PackagePicker";

vi.mock("../../actions", () => ({ choosePackageAction: vi.fn() }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const options = [1, 2, 3].map(n => ({
  tier: String(n), name: `Package ${n}`, worldCount: n, boardCount: n * 9,
  meta: "Searches", price: "$1", popular: n === 2,
}));

describe("package continuation copy", () => {
  it("names summary only when every available world is already included", () => {
    const view = render(<I18nProvider locale="en" dict={en}><PackagePicker options={options} defaultTier="1" availableWorldCount={3} /></I18nProvider>);
    expect(view.getByRole("button", { name: en.create.package.next })).toBeTruthy();
    fireEvent.click(view.getAllByRole("radio")[2]!);
    expect(view.getByRole("button", { name: en.create.package.nextSummary })).toBeTruthy();
    fireEvent.click(view.getAllByRole("radio")[1]!);
    expect(view.getByRole("button", { name: en.create.package.next })).toBeTruthy();
  });
});
