// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import PlayError from "@/app/play/error";
import PassportError from "@/app/passport/error";

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([PlayError, PassportError])("recovers shared routes in place, without exposing raw errors or website exits", Boundary => {
  const reset = vi.fn(), dict = getDict("en");
  const view = render(<I18nProvider locale="en" dict={dict}><Boundary error={Object.assign(new Error("private provider detail"), { digest: "12345" })} reset={reset} /></I18nProvider>);
  expect(view.container.querySelector("a[href]")).toBeNull();
  expect(view.container.textContent).toContain("12345");
  expect(view.container.textContent).not.toContain("private provider detail");
  expect(view.container.textContent).not.toContain("payment");
  fireEvent.click(screen.getByRole("button", { name: dict.appError.retry }));
  expect(reset).toHaveBeenCalledOnce();
});
