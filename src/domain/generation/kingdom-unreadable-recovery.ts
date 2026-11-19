/**
 * kingdom-unreadable-recovery/v1 (kingdom-generation/v6 only). A completed review answer that cannot be read
 * (schema, binding, a neighbor marked "unsure", an uncertain crown...) is missing evidence, not a verdict on the
 * picture. The same pixels are asked once more; if that answer is unreadable too, the picture is treated as an
 * ordinary refusal and repainted within its normal attempts. A world never parks on an unreadable answer while it
 * can still paint. The marker lives in the receipt the board review writes, so the decision is a pure reading.
 */
export const KINGDOM_UNREADABLE_RECOVERY = "kingdom-unreadable-recovery/v1" as const;
/** Paid questions about one image before an unreadable answer is treated as a refusal of that image. */
export const KINGDOM_UNREADABLE_QUESTIONS_PER_IMAGE = 2;
/** The refusal fault an image gets after its questions were all unreadable. */
export const KINGDOM_UNREADABLE_FAULT = "review-unreadable";
/** The code of an unreadable round in its image's evidence log (never a transport fault). */
export const KINGDOM_UNREADABLE_LOG_CODE = "unreadable-answer";
/** Direction added to the re-ask, so the model knows why it is asked again. */
export const KINGDOM_UNREADABLE_DIRECTION = "\nUNREADABLE ANSWER RECOVERY: the previous answer about these exact unchanged pixels could not be read, "
  + "not refused. Answer every required field in the exact schema. A registered non-target box that does not isolate one person "
  + "is invalid-registration with status unsure, remnants unsure, no AFTER and occluder null; a real visible defect is still reported as a defect.";
