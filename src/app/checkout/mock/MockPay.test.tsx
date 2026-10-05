import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict, tf } from "@/i18n";

const f = vi.hoisted(() => ({ fetch: vi.fn(), state: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  // Exercise the component's real asynchronous event handlers without a DOM
  // navigation shim. The state setter is still observed on rejected requests.
  useState: (initial: unknown) => [initial, f.state],
}));
vi.mock("@/i18n/client", () => ({ useI18n: () => ({ t: getDict("en"), tf }) }));
import { MockPay } from "./MockPay";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", f.fetch);
  vi.stubGlobal("window", { location: { href: "/checkout/mock?orderId=stored-order" } });
  f.fetch.mockResolvedValue({ json: async () => ({ ok: true }) });
});
afterEach(() => vi.unstubAllGlobals());

function buttonProps(node: unknown, variant: string): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(child => buttonProps(child, variant)).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  if (node.props.variant === variant && typeof node.props.onClick === "function") return node.props;
  return buttonProps(node.props.children, variant);
}

function form(cancelUrl: string, declinedUrl: string) {
  return MockPay({ orderId: "stored-order", successUrl: "/creating/stored-game", cancelUrl, declinedUrl, amountLabel: "₪39" });
}

async function activate(tree: ReturnType<typeof MockPay>, kind: "PAID" | "FAILED" | "CANCELLED") {
  if (kind === "PAID") {
    const preventDefault = vi.fn();
    tree.props.onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.fetch).toHaveBeenCalledOnce());
  } else {
    const props = buttonProps(tree, kind === "FAILED" ? "danger" : "ghost")!;
    await (props.onClick as () => Promise<void>)();
  }
}

describe("mock payment button return destinations", () => {
  for (const destinations of [
    { label: "draft creator", cancelUrl: "/checkout?cancelled=1", declinedUrl: "/checkout?declined=1" },
    { label: "authenticated owner", cancelUrl: "/checkout/close?game=stored-game", declinedUrl: "/checkout/close?game=stored-game" },
  ]) {
    it.each(["PAID", "FAILED", "CANCELLED"] as const)(`${destinations.label}: %s navigates only after accepted payment API response`, async kind => {
      let accept!: (response: { json: () => Promise<{ ok: boolean }> }) => void;
      f.fetch.mockReturnValue(new Promise(resolve => { accept = resolve; }));
      const tree = form(destinations.cancelUrl, destinations.declinedUrl);
      const activation = activate(tree, kind);
      expect(window.location.href).toBe("/checkout/mock?orderId=stored-order");
      expect(f.fetch).toHaveBeenCalledWith("/api/dev/mock-pay", expect.objectContaining({
        method: "POST", body: JSON.stringify({ orderId: "stored-order", kind }),
      }));
      accept({ json: async () => ({ ok: true }) });
      await activation;
      const expected = kind === "PAID" ? "/creating/stored-game" : kind === "FAILED" ? destinations.declinedUrl : destinations.cancelUrl;
      await vi.waitFor(() => expect(window.location.href).toBe(expected));
    });
  }

  it("uses the explicit declined destination even when cancellation contains no replaceable flag", async () => {
    await activate(form("/checkout/close?game=stored-game", "/checkout?declined=1"), "FAILED");
    expect(window.location.href).toBe("/checkout?declined=1");
  });

  it("stays on payment when the server rejects cancellation", async () => {
    f.fetch.mockResolvedValue({ json: async () => ({ ok: false, body: "unavailable" }) });
    await activate(form("/checkout?cancelled=1", "/checkout?declined=1"), "CANCELLED");
    expect(window.location.href).toBe("/checkout/mock?orderId=stored-order");
    expect(f.state).toHaveBeenCalledWith(tf(getDict("en").create.mock.rejected, { body: "unavailable" }));
    expect(f.state).toHaveBeenLastCalledWith(null);
  });

  it("stays on payment on a transport failure", async () => {
    f.fetch.mockRejectedValue(Error("synthetic network failure"));
    await activate(form("/checkout?cancelled=1", "/checkout?declined=1"), "FAILED");
    expect(window.location.href).toBe("/checkout/mock?orderId=stored-order");
    expect(f.state).toHaveBeenCalledWith(tf(getDict("en").create.mock.rejected, { body: "network" }));
  });
});
