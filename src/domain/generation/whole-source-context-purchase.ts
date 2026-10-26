import { z } from "zod";
export const WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION = "whole-source-context-purchase/v1" as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const wholeSourceContextMarkerSchema = z.object({ version: z.literal(WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION),
  authorizationSha256: digest, rowId: z.string().min(1).max(160), originalRowSha256: digest,
  originalAttempts: z.literal(3), authorizedAttempt: z.literal(4), planSha256: digest }).strict();
export type WholeSourceContextMarker = z.infer<typeof wholeSourceContextMarkerSchema>;
export function wholeSourceContextMarker(row: { judgeJson: string | null }): WholeSourceContextMarker | null {
  try { const value = wholeSourceContextMarkerSchema.safeParse(JSON.parse(row.judgeJson ?? "null")?.wholeSourceContext);
    return value.success ? value.data : null; } catch { return null; }
}
/** A fourth cannot create a fifth, and an interruption keeps its fourth key. */
export function wholeSourceContextExhausted(row: { status: string; attempts: number; judgeJson: string | null }): boolean {
  return row.status === "FAILED" && row.attempts === 4 && !!wholeSourceContextMarker(row);
}
