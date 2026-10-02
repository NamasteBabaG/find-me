import { describe, expect, it, vi } from "vitest";
import { inspectMagicLink } from "../auth.service";
import type { Container } from "../container";
import { hashToken } from "@/lib/ids";

describe("read-only magic-link account inspection", () => {
  function fixture(override: Record<string, unknown> = {}) {
    const findUnique = vi.fn().mockResolvedValue({ usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { email: "synthetic@example.invalid" }, ...override });
    const transaction = vi.fn(() => { throw new Error("Inspection must never mutate authentication state"); });
    return { c: { db: { magicLinkToken: { findUnique }, $transaction: transaction } } as unknown as Container, findUnique, transaction };
  }
  it("returns only the confirmed account email without burning a token or opening a session", async () => {
    const { c, findUnique, transaction } = fixture();
    expect(await inspectMagicLink(c, "synthetic-token")).toEqual({ email: "synthetic@example.invalid" });
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken("synthetic-token") } }));
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([{ usedAt: new Date() }, { expiresAt: new Date(Date.now() - 1_000) }])("rejects used or expired links (%j)", async override => {
    const { c, transaction } = fixture(override);
    expect(await inspectMagicLink(c, "synthetic-token")).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("rejects missing, empty and oversized tokens without writes", async () => {
    const { c, findUnique } = fixture();
    expect(await inspectMagicLink(c, "")).toBeNull();
    expect(await inspectMagicLink(c, "x".repeat(257))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    findUnique.mockResolvedValue(null);
    expect(await inspectMagicLink(c, "unknown-token")).toBeNull();
  });
});
