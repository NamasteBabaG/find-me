import { z } from 'zod';
import { SINGLE_VISUAL_REVIEW_VERSION } from './single-visual-review';
export const DETECTIVES_OPERATIONAL_RELEASE = 'detectives-operational/v1' as const;
export const SOURCE_BODY_BIRTH_VERSION = 'source-body-from-birth/v1' as const;
export type DetectivesOperationalRelease = typeof DETECTIVES_OPERATIONAL_RELEASE;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const detectivesOperationalReceiptSchema = z.object({ version: z.literal(DETECTIVES_OPERATIONAL_RELEASE), gameId: id, worldId: z.string(), sourceFamilySha256: digest, sourcePlacementManifestSha256: digest, sourceBodyManifestSha256: digest, reviewMode: z.literal(SINGLE_VISUAL_REVIEW_VERSION), model: z.literal('gpt-6.1-sol'), effort: z.literal('low'), initialTier: z.literal('flex'), oneUsableAssessmentPerImage: z.literal(true), normalImageAttemptLimit: z.literal(3), worldCapMicroUsd: z.literal(4000000), automaticBudgetExtension: z.literal(false), authorizationSha256: digest }).strict();
export type DetectivesOperationalReceipt = z.infer<typeof detectivesOperationalReceiptSchema>;
export const sourceBodyBirthMarkerSchema = z.object({ version: z.literal(SOURCE_BODY_BIRTH_VERSION), policySha256: digest, manifestSha256: digest, rowId: id, hideId: id, attempt: z.number().int().min(1).max(3) }).strict();
export type SourceBodyBirthMarker = z.infer<typeof sourceBodyBirthMarkerSchema>;
export function sourceBodyBirthMarker(row: {
    judgeJson: string | null;
}): SourceBodyBirthMarker | null { try {
    const p = sourceBodyBirthMarkerSchema.safeParse(JSON.parse(row.judgeJson ?? 'null')?.sourceBodyBirth);
    return p.success ? p.data : null;
}
catch {
    return null;
} }
export function detectivesOperationalQualified(v: {
    appEnv?: string;
    promptRelease?: string;
    identitySource?: string;
    reviewRelease?: string;
    leanRelease?: string;
}) { return v.appEnv === 'qa' && v.promptRelease === 'v19' && v.identitySource === 'full-source-v1' && v.reviewRelease === 'local-patch-dual-high/v3' && v.leanRelease === 'local-patch-lean/v1'; }
