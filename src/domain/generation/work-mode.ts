/** A narrower operator turn, never new spending authority or a new question.
 * Existing assessments use their ordinary keys, policies and complete reserves. */
export const REVIEW_EXISTING_WORK_MODE = 'review-existing/v1' as const;
export type GenerationWorkMode = 'normal' | typeof REVIEW_EXISTING_WORK_MODE;

export function generationWorkMode(value: unknown): GenerationWorkMode {
  if (value === undefined || value === 'normal') return 'normal';
  if (value === REVIEW_EXISTING_WORK_MODE) return value;
  throw Error('GENERATION_WORK_MODE: unsupported mode');
}
