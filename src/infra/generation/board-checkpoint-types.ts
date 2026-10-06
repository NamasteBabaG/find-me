import type { WorldChargeEvidence } from "../../domain/generation/world-budget";
import type { FixedSourceResult } from "./openai-fixed-source";
import type { ObservedBoardPoseSource, BoardPoseObservationReceipt, BoardPoseCompletenessDeferral } from "./board-pose-observer";

type GeneratedSource = Extract<FixedSourceResult, { kind: "generated" }>;

/** Immutable transport/checkpoint data shared by the orchestrator and its DB
 * adapter. Kept beside provider interfaces so reading a checkpoint never imports
 * the board-generation use case or its compositor. */
export interface BoardMeasurement {
  sheetSha256: string;
  fingerprint: string;
  status: "ok" | "uncertain" | "invalid";
  sources: ObservedBoardPoseSource[] | null;
  evidence: WorldChargeEvidence;
  receipt?: BoardPoseObservationReceipt;
  /** Cells whose visible completeness only the destination can settle. Optional
   * so measurements checkpointed before 9 September 2026 still load unchanged. */
  completenessDeferred?: BoardPoseCompletenessDeferral[];
}

export interface BoardConditionedCheckpointStore {
  /** Durable immutable put-if-absent. Same key with changed bytes must fail. */
  putSource(worldId: string, boardId: string, source: GeneratedSource): Promise<void>;
  getSource(worldId: string, boardId: string): Promise<GeneratedSource | null>;
  putMeasurement(worldId: string, boardId: string, result: BoardMeasurement, measurementAttempt?: 1 | 2): Promise<void>;
  getMeasurement(worldId: string, boardId: string, measurementAttempt?: 1 | 2): Promise<BoardMeasurement | null>;
}
