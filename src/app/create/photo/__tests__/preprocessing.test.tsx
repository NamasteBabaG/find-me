// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { PhotoUploader } from "../PhotoUploader";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { navigateToSavedStep } from "../../saved-step-navigation";
vi.mock("../../saved-step-navigation", () => ({ navigateToSavedStep: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
vi.mock("next/navigation", () => ({ useRouter: () => router }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) }));
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() }));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
it.each(["draw", "encode", "network"])("reports %s failure correctly and releases the upload button", async kind => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage: () => { if (kind === "draw") throw Error("synthetic decode failure"); } }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => {
    if (kind === "encode") throw Error("synthetic encoder failure");
    callback(new Blob(["synthetic"], { type: "image/jpeg" }));
  });
  if (kind === "network") vi.mocked(fetch).mockRejectedValue(Error("synthetic network failure"));
  const view = render(<I18nProvider locale="en" dict={en}><PhotoUploader childName="Example" hasPhoto={false} rejectedCode={null} /></I18nProvider>);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["synthetic"], "sample.png", { type: "image/png" })] } });
  const img = view.container.querySelector(".cropper img")!;
  Object.defineProperties(img, { naturalWidth: { value: 100 }, naturalHeight: { value: 100 } });
  fireEvent.load(img);
  fireEvent.click(view.getByRole("checkbox"));
  fireEvent.click(view.getByRole("button", { name: new RegExp(en.create.photo.confirm) }));
  await waitFor(() => expect(view.getByText(kind === "network" ? en.create.photo.network : en.create.photo.unreadable)).toBeTruthy());
  expect((view.getByRole("button", { name: new RegExp(en.create.photo.confirm) }) as HTMLButtonElement).disabled).toBe(false);
  if (kind !== "network") expect(fetch).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(navigateToSavedStep).not.toHaveBeenCalled();
});

it("never warms a guarded step before upload and navigates once only after storage succeeds", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(cb => cb(new Blob(["synthetic"], { type: "image/jpeg" })));
  let finish!: (result: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const nextHref = "/creating/synthetic-paid-game";
  const view = render(<I18nProvider locale="en" dict={en}><PhotoUploader childName="Example" hasPhoto={false} rejectedCode={null} nextHref={nextHref} /></I18nProvider>);
  expect(router.prefetch).not.toHaveBeenCalled();
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["synthetic"], "sample.png", { type: "image/png" })] } });
  const img = view.container.querySelector(".cropper img")!;
  Object.defineProperties(img, { naturalWidth: { value: 100 }, naturalHeight: { value: 100 } });
  fireEvent.load(img);
  fireEvent.click(view.getByRole("checkbox"));
  const button = view.getByRole("button", { name: new RegExp(en.create.photo.confirm) });
  fireEvent.click(button);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(navigateToSavedStep).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  finish(new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
  await waitFor(() => expect(navigateToSavedStep).toHaveBeenCalledExactlyOnceWith(nextHref));
  expect(router.push).not.toHaveBeenCalled();
});

it("resumes a saved paid-game photo through its supplied route, not the new-order package step", () => {
  const view = render(<I18nProvider locale="en" dict={en}><PhotoUploader childName="Example" hasPhoto rejectedCode={null} nextHref="/creating/synthetic-paid-game" /></I18nProvider>);
  expect(view.getByRole("link", { name: new RegExp(en.common.continue) }).getAttribute("href")).toBe("/creating/synthetic-paid-game");
  expect(router.prefetch).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
