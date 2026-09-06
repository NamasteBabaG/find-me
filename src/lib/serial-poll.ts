/** One status read at a time; stop permanently when poll returns false. */
export function startSerialPoll(options: {
  poll: (signal: AbortSignal) => Promise<boolean>;
  onError: () => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  let disposed = false;
  let settled = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const refresh = async () => {
    if (disposed || settled || inFlight) return;
    clearTimeout(timer);
    inFlight = true;
    controller = new AbortController();
    const active = controller;
    const deadline = setTimeout(() => active.abort(), options.timeoutMs ?? 15_000);
    try {
      settled = !(await options.poll(active.signal));
    } catch {
      if (!disposed) options.onError();
    } finally {
      clearTimeout(deadline);
      inFlight = false;
      if (!disposed && !settled) timer = setTimeout(() => void refresh(), options.intervalMs ?? 2500);
    }
  };
  void refresh();
  return {
    refresh: () => void refresh(),
    stop: () => { disposed = true; clearTimeout(timer); controller?.abort(); },
  };
}
