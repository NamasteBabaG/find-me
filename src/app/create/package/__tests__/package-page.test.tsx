import { expect, it, vi } from "vitest";
import CreatePackagePage from "../page";

const redirect = vi.hoisted(() => vi.fn((href: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { href }); }));
vi.mock("next/navigation", () => ({ redirect }));

it("sends an old package link to the worlds step of the same draft", async () => {
  await expect(CreatePackagePage({ searchParams: Promise.resolve({ draft: "draft-1" }) })).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenLastCalledWith("/create/scenes?draft=draft-1");
});

it("sends a package link without a draft to the worlds step", async () => {
  await expect(CreatePackagePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenLastCalledWith("/create/scenes");
});
