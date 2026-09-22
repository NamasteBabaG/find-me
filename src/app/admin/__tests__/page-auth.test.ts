import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ admin: null as null | { id: string }, container: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); } }));
vi.mock("@/services/container", () => ({ getContainer: f.container }));
vi.mock("@/lib/env", () => ({ isLiveShop: () => false }));
import Costs from "../costs/page";
import Orders from "../orders/page";
import Order from "../orders/[gameId]/page";
import Scenes from "../scenes/page";
import Scene from "../scenes/[slug]/page";
import Outbox from "../../dev/outbox/page";
import { requireAdmin } from "@/lib/server/require-admin";

beforeEach(() => { f.admin = null; f.container.mockReset(); });
describe("admin pages independently guard their data reads", () => {
  it.each([
    ["costs", () => Costs()],
    ["orders", () => Orders({ searchParams: Promise.resolve({}) })],
    ["order", () => Order({ params: Promise.resolve({ gameId: "synthetic" }), searchParams: Promise.resolve({}) })],
    ["catalog", () => Scenes()],
    ["scene", () => Scene({ params: Promise.resolve({ slug: "synthetic" }) })],
    ["mailbox", () => Outbox()],
  ] as const)("%s refuses a non-admin before accessing application data", async (_name, run) => {
    await expect(run()).rejects.toThrow("NOT_FOUND");
    expect(f.container).not.toHaveBeenCalled();
  });
  it("admits a verified administrator", async () => {
    f.admin = { id: "synthetic-admin" };
    expect(await requireAdmin()).toEqual(f.admin);
  });
});
