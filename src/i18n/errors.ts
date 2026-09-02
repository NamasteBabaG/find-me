import type { Dictionary } from "./dictionaries/en";
import { tf } from "./index";

/**
 * Services return machine-readable error codes (+ a Hebrew fallback reason);
 * the UI renders them in the visitor's language.
 */
export type FlowErrorCode =
  | "DRAFT_LOCKED"
  | "DRAFT_NOT_FOUND"
  | "NAME_TOO_SHORT"
  | "NEED_NAME"
  | "PHOTO_FIRST"
  | "UNKNOWN_PACKAGE"
  | "PACKAGE_UNAVAILABLE"
  | "PICK_PACKAGE_FIRST"
  | "WRONG_SCENE_COUNT"
  | "SCENE_UNAVAILABLE"
  | "PREVIOUS_STEPS"
  | "INVALID_EMAIL"
  | "SCENES_INCOMPLETE"
  | "TOO_LARGE"
  | "BAD_TYPE"
  | "TOO_SMALL"
  | "UNREADABLE"
  | "NO_FILE"
  | "UPLOAD_FAILED";

export interface FlowError {
  ok: false;
  code: FlowErrorCode;
  /** Hebrew fallback, mainly for logs/admin. */
  reason: string;
  params?: Record<string, string | number>;
}

export type FlowResult = { ok: true } | FlowError;

export function flowError(code: FlowErrorCode, reason: string, params?: Record<string, string | number>): FlowError {
  return { ok: false, code, reason, params };
}

export function errorText(t: Dictionary, err: { code?: string; reason?: string; params?: Record<string, string | number> } | null | undefined): string {
  if (!err) return "";
  const template = err.code ? t.errors[err.code] : undefined;
  return template ? tf(template, err.params ?? {}) : (err.reason ?? "");
}
