export type JobName = "generate-game";

export interface JobPayloads {
  "generate-game": { gameId: string };
}

export type JobHandler<N extends JobName> = (payload: JobPayloads[N]) => Promise<void>;

/**
 * Background work. Handlers must be idempotent: a job may run twice.
 * Dev: in-process. Prod: swap for Trigger.dev / Inngest with the same interface.
 */
export interface JobRunner {
  readonly id: "in-process" | "trigger" | "inngest";
  register<N extends JobName>(name: N, handler: JobHandler<N>): void;
  enqueue<N extends JobName>(name: N, payload: JobPayloads[N]): Promise<void>;
}
