// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { he } from "@/i18n/dictionaries/he";
import { CreatingStatus } from "../[gameId]/CreatingStatus";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const answer = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

it("says at once that the QA sign-in ran out, with a way back to this game", async () => {
  vi.stubGlobal("fetch", answer(401, { ok: false, code: "QA_ACCESS_REQUIRED" }));
  const view = render(<I18nProvider locale="he" dict={he}><CreatingStatus gameId="game_1" childName="נועה" isAdmin={false} /></I18nProvider>);
  await waitFor(() => expect(view.getByText(he.create.creating.qaSignedOut)).toBeTruthy());
  expect(view.getByRole("link", { name: he.create.creating.qaSignIn }).getAttribute("href")).toBe("/qa-access?next=%2Fcreating%2Fgame_1");
});

it("keeps quiet about a passing server error, and never calls it a sign-in", async () => {
  vi.stubGlobal("fetch", answer(500, { ok: false }));
  const view = render(<I18nProvider locale="he" dict={he}><CreatingStatus gameId="game_1" childName="נועה" isAdmin={false} /></I18nProvider>);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(view.queryByText(he.create.creating.qaSignedOut)).toBeNull();
});
