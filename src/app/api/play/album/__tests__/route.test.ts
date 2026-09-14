import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../../../lib/test-schema";
import { adventureFixture } from "../../../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../../../domain/adventure/compose";

/**
 * The album route: the owner is the session, never the body or the play link.
 * No session is 401, another person's session is 403, and the same find sent
 * twice is recorded once.
 */
const rig = vi.hoisted(() => ({ db: null as unknown as PrismaClient, user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => rig.user }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: rig.db }) }));

import { GET, POST } from "../route";

let scratch: string;
const owner = { id: "album-route-owner", email: "owner@example.invalid" };
const stranger = { id: "album-route-stranger", email: "stranger@example.invalid" };
const fixture = adventureFixture(5);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const gameId = config.gameId;
const url = `http://findme.test/api/play/album?gameId=${gameId}`;
const post = (body: unknown) => POST(new Request("http://findme.test/api/play/album", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const find = (targetId: string) => ({ gameId, event: { kind: "target-found", boardSlug: "pilot-test", targetId, variant: "A" } });

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-album-route-"));
  rig.db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(rig.db);
  await rig.db.user.createMany({ data: [owner, stranger] });
  await rig.db.game.create({ data: { id: gameId, ownerId: owner.id, status: "DELIVERED", configJson: JSON.stringify(config) } });
}, 30_000);
afterAll(async () => {
  await rig.db?.$disconnect();
  if (scratch && path.basename(scratch).startsWith("findme-album-route-")) await rm(scratch, { recursive: true, force: true });
});
beforeEach(() => { rig.user = owner; });

describe("/api/play/album", () => {
  it("refuses without a session and refuses another person's session", async () => {
    rig.user = null;
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await post(find("hide-1"))).status).toBe(401);
    rig.user = stranger;
    expect((await GET(new Request(url))).status).toBe(403);
    expect((await post(find("hide-1"))).status).toBe(403);
    expect((await post({ gameId: "no-such-game", event: find("hide-1").event })).status).toBe(403);
  });

  it("records the owner's find once, whatever the browser retries, and reads it back", async () => {
    const first = await post(find("hide-1"));
    expect(first.status).toBe(200);
    const a = await first.json();
    expect(a.changed).toBe(true);
    expect(a.revision).toBe(1);
    const again = await post(find("hide-1"));
    const b = await again.json();
    expect(b.changed).toBe(false);
    expect(b.revision).toBe(1);
    expect(b.progress.finds).toHaveLength(1);
    const read = await (await GET(new Request(url))).json();
    expect(read.progress.finds).toEqual([{ boardSlug: "pilot-test", targetId: "hide-1", variant: "A" }]);
    expect(read.changed).toBe(false);
  });

  it("rejects malformed bodies and unknown events without touching the album", async () => {
    expect((await post({ gameId })).status).toBe(200);
    expect((await post({ gameId, event: { kind: "target-found", boardSlug: "pilot-test", targetId: "invented", variant: "A" } })).status).toBe(400);
    expect((await post({ gameId, event: { kind: "sold-a-star" } })).status).toBe(400);
    expect((await post({ gameId, ownerId: "attacker", event: find("hide-2").event })).status).toBe(400);
    expect((await POST(new Request("http://findme.test/api/play/album", { method: "POST", body: "{" }))).status).toBe(400);
    const read = await (await GET(new Request(url))).json();
    expect(read.progress.finds).toHaveLength(1);
  });
});
