import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSerialPoll } from "../serial-poll";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("status polling", () => {
  it("never overlaps a slow request, including visibility refreshes", async () => {
    let finish!: (again: boolean) => void;
    const poll = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const runner = startSerialPoll({ poll, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    runner.refresh(); runner.refresh();
    expect(poll).toHaveBeenCalledTimes(1);
    finish(true); await flush();
    await vi.advanceTimersByTimeAsync(2499); expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(poll).toHaveBeenCalledTimes(2);
    runner.stop(); finish(false); await flush();
  });
  it("does not poll a finished game again, even on visibility change", async () => {
    const poll = vi.fn().mockResolvedValue(false);
    const runner = startSerialPoll({ poll, onError: vi.fn() });
    await flush(); runner.refresh(); await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1); runner.stop();
  });
  it("retries a failed status read without parallel requests", async () => {
    const error = vi.fn(); const poll = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(false);
    const runner = startSerialPoll({ poll, onError: error });
    await flush(); expect(error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500); expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000); expect(poll).toHaveBeenCalledTimes(2); runner.stop();
  });
  it("aborts a stalled read at the deadline, then retries", async () => {
    const error = vi.fn();
    const poll = vi.fn((signal: AbortSignal) => new Promise<boolean>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))));
    const runner = startSerialPoll({ poll, onError: error });
    await vi.advanceTimersByTimeAsync(15_000); expect(error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500); expect(poll).toHaveBeenCalledTimes(2);
    runner.stop(); await flush(); expect(error).toHaveBeenCalledTimes(1);
  });
  it("cleanup aborts the current read and cannot schedule another", async () => {
    let finish!: (again: boolean) => void; let signal!: AbortSignal;
    const error = vi.fn(); const poll = vi.fn((s: AbortSignal) => { signal = s; return new Promise<boolean>((resolve) => { finish = resolve; }); });
    const runner = startSerialPoll({ poll, onError: error });
    runner.stop(); expect(signal.aborted).toBe(true);
    finish(true); await flush(); runner.refresh(); await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(1); expect(error).not.toHaveBeenCalled();
  });
});
