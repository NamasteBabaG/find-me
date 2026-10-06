import { env } from "./env";
import { flowError } from "@/i18n/errors";

/** A production launch gate, independent of the generation spend switch. */
export function purchasingEnabled(): boolean {
  const e = env();
  return e.APP_ENV !== "production" || e.PURCHASING_ENABLED === "on";
}

export const purchasingClosed = () => flowError("PURCHASING_CLOSED", "רכישת משחק אישי עדיין לא פתוחה. אפשר לשחק בהדגמה.");
