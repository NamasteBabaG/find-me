/** Fail a bounded integration test before it spends its time budget on a loop. */
export function testProgressGuard(initial: object) {
  let previous = JSON.stringify(initial);
  let stalledTurns = 0;
  return (current: object, pending: boolean) => {
    const signature = JSON.stringify(current);
    const progressed = signature !== previous;
    stalledTurns = progressed ? 0 : stalledTurns + 1;
    previous = signature;
    if (pending && stalledTurns >= 2) {
      throw new Error(`Test made no progress for ${stalledTurns} consecutive turns: ${signature}`);
    }
    return { progressed, stalledTurns };
  };
}
