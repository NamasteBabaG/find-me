/**
 * Who may cause the image model to be paid, and how much per day.
 *
 * A QA box is a production build with a pretend till and a real painter: it
 * takes no money and spends real money, at a public URL. Anyone who found it
 * could open a draft, "pay" with the sandbox, and put renders on the project's
 * account. So on a box like that, spend is allowed only for the listed
 * testers — checked where the money would start (checkout, the sandbox till,
 * the pipeline), not on a button. Development and the real shop are not gated
 * here: the first pays nothing, the second is paid.
 */
export interface SpendGuard {
  appEnv: "development" | "qa" | "production";
  /** The painter is a real, billed model. */
  realGeneration: boolean;
  /** Lower-cased emails allowed to cause spend on a QA box. */
  testers: readonly string[];
}

export function spendAllowedFor(guard: SpendGuard, email: string | null | undefined): boolean {
  if (guard.appEnv !== "qa" || !guard.realGeneration) return true;
  if (!email) return false;
  return guard.testers.includes(email.trim().toLowerCase());
}

/** Zero or unset means no ceiling. */
export function underDailyCeiling(spentCents: number, ceilingCents: number | null | undefined): boolean {
  if (!ceilingCents || ceilingCents <= 0) return true;
  return spentCents < ceilingCents;
}
