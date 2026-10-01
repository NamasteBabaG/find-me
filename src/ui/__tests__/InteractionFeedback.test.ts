// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { bindPressFeedback } from "../InteractionFeedback";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
it("makes a quick click visible through pending state, skips disabled controls, and cleans up", () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button><span>Continue</span></button><button disabled>Unavailable</button>';
  const stop = bindPressFeedback(document.body), button = document.querySelector("button")!;
  button.firstElementChild!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  button.disabled = true; // asynchronous action began after the captured click
  vi.advanceTimersByTime(100);
  expect(button.dataset.pressFeedback).toBe("true");
  vi.advanceTimersByTime(100);
  expect(button.dataset.pressFeedback).toBeUndefined();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(button.dataset.pressFeedback).toBeUndefined();
  button.disabled = false;
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(button.dataset.pressFeedback).toBe("true");
  stop();
  expect(button.dataset.pressFeedback).toBeUndefined();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(button.dataset.pressFeedback).toBeUndefined();
});
