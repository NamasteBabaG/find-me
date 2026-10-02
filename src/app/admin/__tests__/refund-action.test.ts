import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refund: vi.fn(), revalidate: vi.fn(), container: {}, actor: { type: "ADMIN", id: "synthetic-admin" } }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => {} }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.actor }));
vi.mock("@/services/container", () => ({ getContainer: () => mocks.container }));
vi.mock("@/services/order.service", () => ({ refundOrder: mocks.refund }));
import { refundAction } from "../actions";

beforeEach(() => { vi.clearAllMocks(); });
function form() { const fd = new FormData(); fd.set("gameId", "synthetic-game"); fd.set("orderId", "synthetic-order"); return fd; }
describe("admin refund feedback", () => {
  it("reports an unconfirmed refund instead of silently returning", async () => {
    mocks.refund.mockResolvedValue({ ok: false });
    await expect(refundAction(form())).rejects.toThrow("REDIRECT:/admin/orders/synthetic-game?refund=review");
    expect(mocks.refund).toHaveBeenCalledWith(mocks.container, "synthetic-order", mocks.actor);
  });
  it("reports recorded success only after the service confirms it", async () => {
    mocks.refund.mockResolvedValue({ ok: true });
    await expect(refundAction(form())).rejects.toThrow("REDIRECT:/admin/orders/synthetic-game?refund=recorded");
  });
  it("requires reconciliation after an uncertain provider exception", async () => {
    mocks.refund.mockRejectedValue(new Error("synthetic uncertain provider result"));
    await expect(refundAction(form())).rejects.toThrow("REDIRECT:/admin/orders/synthetic-game?refund=review");
  });
});
