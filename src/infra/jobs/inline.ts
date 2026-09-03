import type { JobHandler, JobName, JobPayloads, JobRunner } from "./types";

/**
 * Runs the job inside the request that enqueued it (awaits it). For serverless
 * hosts where nothing survives the response — fine for the mock pipeline and a
 * pilot; a durable queue replaces it later behind the same interface.
 */
export class InlineJobRunner implements JobRunner {
  readonly id = "in-process" as const;
  private handlers = new Map<JobName, JobHandler<JobName>>();

  register<N extends JobName>(name: N, handler: JobHandler<N>): void {
    this.handlers.set(name, handler as JobHandler<JobName>);
  }

  async enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);
    try {
      await handler(payload);
    } catch (err) {
      console.error(`❌ job ${name} failed`, err);
    }
  }
}
