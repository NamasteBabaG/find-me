import type { JobHandler, JobName, JobPayloads, JobRunner } from "./types";

/**
 * Runs jobs on the next tick of the same Node process. Good enough for dev
 * and a small pilot; NOT for serverless production (the function may be
 * frozen after the response). See docs/ARCHITECTURE.md → Jobs.
 */
export class InProcessJobRunner implements JobRunner {
  readonly id = "in-process" as const;
  private handlers = new Map<JobName, JobHandler<JobName>>();
  private running = new Set<string>();

  register<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.set(name, handler as JobHandler<JobName>);
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);
    const key = `${name}:${JSON.stringify(payload)}`;
    if (this.running.has(key)) return; // already in flight — idempotent enqueue
    this.running.add(key);
    setTimeout(() => {
      handler(payload)
        .catch((err: unknown) => console.error(`❌ job ${name} failed`, err))
        .finally(() => this.running.delete(key));
    }, 0);
  }
}
