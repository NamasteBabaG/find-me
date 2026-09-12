import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ admin: { id: "admin" } as { id: string } | null, candidate: vi.fn(), resume: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/local-patch-repair-resume", () => ({ LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION: "authorize-one-post-normal-repair-per-failed-hide", localPatchRepairResumeForm: f.candidate }));
vi.mock("../../actions", () => ({ resumeLocalPatchRepairsAction: f.resume }));
import { LocalPatchRepairResumeForm } from "./LocalPatchRepairResumeForm";
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { f.admin = { id: "admin" }; f.candidate.mockReset().mockResolvedValue({ failedHides: 7 }); f.resume.mockReset(); });
describe("local-patch single-game repair form", () => {
  it("renders one explicit paid-repair confirmation and never authorizes on page load", async () => {
    const html = renderToStaticMarkup(await LocalPatchRepairResumeForm({ gameId: "game-synthetic" }));
    expect(html).toContain('name="gameId" value="game-synthetic"');
    expect(html).toContain('type="checkbox"'); expect(html).toContain('required=""');
    expect(html).toContain("7 מחבואים"); expect(html).toContain("חיוב API נוסף");
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(f.candidate).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, "game-synthetic");
    expect(f.resume).not.toHaveBeenCalled();
  });
  it("hides the control for an ineligible game", async () => {
    f.candidate.mockResolvedValue(null);
    expect(await LocalPatchRepairResumeForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.resume).not.toHaveBeenCalled();
  });
  it("does not even inspect eligibility without an administrator", async () => {
    f.admin = null;
    expect(await LocalPatchRepairResumeForm({ gameId: "game-synthetic" })).toBeNull(); expect(f.candidate).not.toHaveBeenCalled();
  });
});
