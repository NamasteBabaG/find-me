import { expect, it } from "vitest";
import { testProgressGuard } from "../test-progress";

it("stops an unchanged pending assembler on its second idle turn", () => {
  const snapshot = { configuredBoards: 0, concludedBoards: 9, renders: 31, reviews: 33 };
  const guard = testProgressGuard(snapshot);
  expect(guard(snapshot, true)).toEqual({ progressed: false, stalledTurns: 1 });
  expect(() => guard(snapshot, true)).toThrow("no progress for 2 consecutive turns");
});

it("allows finite assembly progress, resets an idle turn, and accepts terminal completion", () => {
  const first = { configuredBoards: 0, concludedBoards: 8, renders: 31, reviews: 33 };
  const next = { ...first, concludedBoards: 9 };
  const guard = testProgressGuard(first);
  guard(first, true);
  expect(guard(next, true)).toEqual({ progressed: true, stalledTurns: 0 });
  expect(guard(next, true)).toEqual({ progressed: false, stalledTurns: 1 });
  expect(() => guard(next, false)).not.toThrow();
});
