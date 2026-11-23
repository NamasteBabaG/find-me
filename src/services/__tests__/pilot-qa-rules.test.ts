import { describe, expect, it, vi } from "vitest";
import { CRON_HEARTBEAT_FRESH_MS, CRON_HEARTBEAT_ID, backgroundWorkRunning, recordCronHeartbeat } from "../jobs-heartbeat.service";
import { OFFERED_WORLD_SLUGS, WORLDS_PER_ORDER, isOfferedWorld } from "@/domain/offering";
import { CHILD_AGES, CHILD_AGE_MAX, NEW_CHILD_AGES, NEW_CHILD_AGE_MIN, newChildAgeAllowed, validChildAge } from "@/domain/child-appearance";
import { allWorlds } from "../../../content/worlds";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";

/** One row in memory, shaped like the audit table's upsert/findUnique. */
function auditStore() {
  const rows = new Map<string, { id: string; actorType: string; metaJson: string | null }>();
  return {
    rows,
    auditLog: {
      upsert: vi.fn(async ({ where, update, create }: { where: { id: string }; update: { metaJson: string }; create: { id: string; actorType: string; metaJson: string } }) => {
        const row = rows.get(where.id);
        const next = row ? { ...row, ...update } : { id: create.id, actorType: create.actorType, metaJson: create.metaJson };
        rows.set(where.id, next);
        return next;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
    },
  };
}

describe("pilot QA P1-2: the window may close only while the scheduled tick runs", () => {
  it("is false with no heartbeat, true just after one, and false again once it is older than three minutes", async () => {
    const db = auditStore(), now = 1_800_000_000_000;
    expect(await backgroundWorkRunning(db as never, now)).toBe(false);
    await recordCronHeartbeat(db as never, now);
    expect(db.rows.get(CRON_HEARTBEAT_ID)?.actorType).toBe("SYSTEM");
    expect(await backgroundWorkRunning(db as never, now + 60_000)).toBe(true);
    expect(await backgroundWorkRunning(db as never, now + CRON_HEARTBEAT_FRESH_MS)).toBe(false);
    // One row, rewritten: a later run moves it forward.
    await recordCronHeartbeat(db as never, now + CRON_HEARTBEAT_FRESH_MS);
    expect(db.rows.size).toBe(1);
    expect(await backgroundWorkRunning(db as never, now + CRON_HEARTBEAT_FRESH_MS + 1_000)).toBe(true);
  });
  it("never promises on a broken row, a future time, a foreign writer or a missing database", async () => {
    const db = auditStore(), now = 1_800_000_000_000;
    db.rows.set(CRON_HEARTBEAT_ID, { id: CRON_HEARTBEAT_ID, actorType: "SYSTEM", metaJson: "{not json" });
    expect(await backgroundWorkRunning(db as never, now)).toBe(false);
    db.rows.set(CRON_HEARTBEAT_ID, { id: CRON_HEARTBEAT_ID, actorType: "SYSTEM", metaJson: JSON.stringify({ version: "jobs-cron-heartbeat/v1", at: now + 60_000 }) });
    expect(await backgroundWorkRunning(db as never, now)).toBe(false);
    db.rows.set(CRON_HEARTBEAT_ID, { id: CRON_HEARTBEAT_ID, actorType: "USER", metaJson: JSON.stringify({ version: "jobs-cron-heartbeat/v1", at: now }) });
    expect(await backgroundWorkRunning(db as never, now)).toBe(false);
    const broken = { auditLog: { findUnique: async () => { throw Error("db down"); }, upsert: async () => { throw Error("db down"); } } };
    expect(await backgroundWorkRunning(broken as never, now)).toBe(false);
    await expect(recordCronHeartbeat(broken as never, now)).resolves.toBeUndefined();
  });
});

describe("pilot QA P1-3: one approved offering", () => {
  it("sells exactly the approved worlds, one per order, and every approved world exists in the catalog", () => {
    expect(OFFERED_WORLD_SLUGS).toEqual(["journey", "kingdom"]);
    expect(WORLDS_PER_ORDER).toBe(1);
    const catalog = allWorlds().map(world => world.slug);
    for (const slug of OFFERED_WORLD_SLUGS) expect(catalog).toContain(slug);
    expect(isOfferedWorld("timetravel")).toBe(false);
  });
});

describe("pilot QA P2-4: one age range for a new character", () => {
  it("offers 4 to 10 to a new character while every recorded age from 2 stays valid", () => {
    expect(NEW_CHILD_AGES).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(NEW_CHILD_AGES.every(age => (CHILD_AGES as readonly number[]).includes(age))).toBe(true);
    for (const age of [2, 3]) { expect(validChildAge(age)).toBe(true); expect(newChildAgeAllowed(age)).toBe(false); }
    for (const age of [4, 10]) expect(newChildAgeAllowed(age)).toBe(true);
    for (const age of [1, 11, 4.5, "6"]) expect(newChildAgeAllowed(age)).toBe(false);
  });
  it("says the same range wherever a parent reads it: the home pill, the FAQ and the age error", () => {
    const range = [String(NEW_CHILD_AGE_MIN), String(CHILD_AGE_MAX)];
    for (const text of [he.home.hero.pill, en.home.hero.pill, he.errors.INVALID_CHILD_AGE, en.errors.INVALID_CHILD_AGE]) {
      for (const n of range) expect(text).toContain(n);
      expect(text).not.toMatch(/\b2\b/);
    }
  });
});
