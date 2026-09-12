import { describe, expect, it } from "vitest";
import { creationProgress, type CreationSignals } from "../creation-progress";

/**
 * The bar the parent watches. It has to come from the pipeline's own facts —
 * a character that exists, a hiding spot that is painted — and it has to move
 * during the long middle, because that is where the old screen stood still.
 */
const base: CreationSignals = { status: "PAID", characterReady: false, spotsDone: 0, spotsTotal: 27 };

describe("creation progress", () => {
  it("moves through a healthy run without ever going backwards", () => {
    const run: CreationSignals[] = [
      { ...base, status: "PAID" },
      { ...base, status: "AVATAR_GENERATING" },
      { ...base, status: "AVATAR_GENERATING", characterReady: true },
      { ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 0 },
      { ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 9 },
      { ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 26 },
      { ...base, status: "SCENES_COMPOSING", characterReady: true, spotsDone: 27 },
      { ...base, status: "QA_PENDING", characterReady: true, spotsDone: 27 },
      { ...base, status: "APPROVED", characterReady: true, spotsDone: 27 },
      { ...base, status: "READY", characterReady: true, spotsDone: 27 },
    ];
    let last = -1;
    for (const s of run) {
      const p = creationProgress(s).percent;
      expect(p, `${s.status} ${s.spotsDone}/${s.spotsTotal}`).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(creationProgress(run[0]!).percent).toBeGreaterThan(0);
    expect(last).toBe(100);
  });

  it("spends most of the bar on the hiding spots, and moves with every one", () => {
    const at = (n: number) => creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: n }).percent;
    expect(at(0)).toBe(20);
    expect(at(27)).toBe(84);
    // Twenty-seven spots at a minute each is the wait; the bar has to be seen moving through it.
    for (let n = 1; n <= 27; n++) expect(at(n)).toBeGreaterThanOrEqual(at(n - 1));
    expect(at(14) - at(13)).toBeGreaterThan(0);
  });

  it("marks the character milestone the moment the drawing exists", () => {
    const before = creationProgress({ ...base, status: "AVATAR_GENERATING" });
    const after = creationProgress({ ...base, status: "AVATAR_GENERATING", characterReady: true });
    expect(before.milestones.character).toBe("active");
    expect(before.current).toBe("character");
    expect(after.milestones.character).toBe("done");
    expect(after.milestones.hiding).toBe("active");
    expect(after.current).toBe("hiding");
  });

  it("reads the status when the counters have nothing to say", () => {
    // A game composed and waiting for QA has every spot done, whatever the count says.
    const qa = creationProgress({ ...base, status: "QA_PENDING", characterReady: false, spotsDone: 0, spotsTotal: 0 });
    expect(qa.milestones).toEqual({ photo: "done", character: "done", hiding: "done", assemble: "done", check: "active" });
    expect(qa.percent).toBe(96);
  });

  it("is done only at READY and DELIVERED, and failed only at a dead end", () => {
    expect(creationProgress({ ...base, status: "READY" })).toMatchObject({ done: true, failed: false, percent: 100, current: null });
    expect(creationProgress({ ...base, status: "DELIVERED" }).done).toBe(true);
    expect(creationProgress({ ...base, status: "APPROVED" }).done).toBe(false);
    // A snag the next tick retries is not a dead end: the bar keeps what was earned.
    const snag = creationProgress({ ...base, status: "GENERATION_FAILED", characterReady: true, spotsDone: 5 });
    expect(snag.state).toBe("retrying");
    expect(snag.failed).toBe(false);
    expect(snag.percent).toBeGreaterThan(20);
    expect(creationProgress({ ...base, status: "REFUNDED" })).toMatchObject({ state: "failed", failed: true, current: null });
    expect(creationProgress({ ...base, status: "NEEDS_NEW_PHOTO" }).state).toBe("needs_new_photo");
    expect(creationProgress({ ...base, status: "QA_PENDING" }).state).toBe("awaiting_review");
    expect(creationProgress({ ...base, status: "TARGETS_GENERATING" }).state).toBe("working");
    expect(creationProgress({ ...base, status: "MANUAL_REVIEW" }).failed).toBe(false);
  });

  it("never divides by zero or runs past the end", () => {
    expect(creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 3, spotsTotal: 0 }).percent).toBe(20);
    expect(creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 40, spotsTotal: 27 }).percent).toBe(84);
  });

  it.each(["QA_PENDING", "MANUAL_REVIEW", "READY", "DELIVERED", "GENERATION_FAILED"] as const)("does not mistake fixed %s enrollment for completed assembly or an automatic retry", status => {
    const progress = creationProgress({ ...base, status, characterReady: true, fixedAssemblyReady: false });
    expect(progress).toMatchObject({ percent: 20, state: "awaiting_review", done: false, current: "hiding" });
    expect(progress.milestones).toMatchObject({ character: "done", hiding: "active", assemble: "todo", check: "todo" });
  });
  it("counts only completed fixed spots, not the held status", () => {
    const at = (spotsDone: number) => creationProgress({ ...base, status: "QA_PENDING", characterReady: true, fixedAssemblyReady: false, spotsDone });
    expect(at(9).percent).toBe(41);
    expect(at(27)).toMatchObject({ percent: 84, current: "assemble", done: false });
    expect(creationProgress({ ...base, status: "QA_PENDING", fixedAssemblyReady: false })).toMatchObject({ percent: 4, current: "character" });
    expect(creationProgress({ ...base, status: "DELETED", fixedAssemblyReady: false })).toMatchObject({ failed: true, state: "failed", done: false });
  });
  it("allows a staged fixed world to advance through manual review to ready", () => {
    expect(creationProgress({ ...base, status: "MANUAL_REVIEW", fixedAssemblyReady: true })).toMatchObject({ percent: 96, done: false });
    expect(creationProgress({ ...base, status: "READY", fixedAssemblyReady: true })).toMatchObject({ percent: 100, done: true });
  });
  it("keeps a stopped wizard at its actual zero or partial placements, not MANUAL_REVIEW's 96%", () => {
    const at = (spotsDone: number) => creationProgress({ ...base, status: "MANUAL_REVIEW", characterReady: true,
      spotsDone, fixedAssemblyReady: false, boardWizardState: "held" });
    expect(at(0)).toMatchObject({ percent: 20, state: "held", done: false, failed: false, current: "hiding",
      milestones: { photo: "done", character: "done", hiding: "todo", assemble: "todo", check: "todo" } });
    expect(at(12)).toMatchObject({ percent: 48, state: "held", milestones: { hiding: "todo", assemble: "todo", check: "todo" } });
    expect(at(27)).toMatchObject({ percent: 84, state: "held", current: "assemble", milestones: { hiding: "done", assemble: "todo", check: "todo" } });
  });
  it.each(["review-required", "unavailable"] as const)("does not pretend an unassembled %s wizard is still working", boardWizardState => {
    expect(creationProgress({ ...base, status: "MANUAL_REVIEW", fixedAssemblyReady: false, boardWizardState }))
      .toMatchObject({ percent: 4, state: "held", done: false, milestones: { character: "todo", assemble: "todo" } });
  });
  it.each([undefined, true])("never infers complete wizard assembly from status or inconsistent proof (%s)", fixedAssemblyReady => {
    expect(creationProgress({ ...base, status: "MANUAL_REVIEW", characterReady: true, boardWizardState: "held", fixedAssemblyReady }))
      .toMatchObject({ percent: 20, state: "held", milestones: { hiding: "todo", assemble: "todo", check: "todo" } });
  });
  it("keeps a healthy incomplete wizard active and distinguishes completed assembly awaiting review", () => {
    expect(creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 9,
      fixedAssemblyReady: false, boardWizardState: "running" })).toMatchObject({ percent: 41, state: "working", milestones: { hiding: "active", assemble: "todo" } });
    expect(creationProgress({ ...base, status: "MANUAL_REVIEW", characterReady: true, spotsDone: 27,
      fixedAssemblyReady: true, boardWizardState: "review-required" })).toMatchObject({ percent: 96, state: "awaiting_review", done: false });
  });
});

describe("a world waiting for a person", () => {
  /**
   * Parking is not a stage and it is not a failure: the work that was done is
   * still done, it simply cannot continue until somebody looks. A screen that
   * kept calling this "working" would tell a parent their game is being made
   * while nobody is making it - and would keep asking for another slice.
   */
  it("is held, not working, whatever the status says", () => {
    const working = creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 9, spotsTotal: 27 });
    expect(working.state).toBe("working");
    const parked = creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 9, spotsTotal: 27, operatorHold: true });
    expect(parked.state).toBe("held");
    // And the work already done is not taken away from it.
    expect(parked.percent).toBe(working.percent);
    expect(parked.done).toBe(false);
  });

  it("leaves a world nobody is waiting on exactly as it was", () => {
    for (const hold of [undefined, false] as const) {
      expect(creationProgress({ ...base, status: "TARGETS_GENERATING", characterReady: true, spotsDone: 9, spotsTotal: 27, operatorHold: hold }).state).toBe("working");
    }
  });
});
