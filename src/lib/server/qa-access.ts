import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { qaAccessConfig, qaCookieName, qaCronAllowed, qaDeniedResponse, qaTokenFromRequest, validQaSession } from "@/lib/qa-access";

/** Server Actions re-check the cookie themselves; middleware is not the sole boundary. */
export async function requireQaAccess(): Promise<void> {
  const c = qaAccessConfig();
  if (!c.enabled) return;
  if (!(await validQaSession((await cookies()).get(qaCookieName(c))?.value, c))) redirect("/qa-access");
}

/** Route handlers reject before a database read, upload, payment, email, or render. */
export async function qaAccessDenied(req: Request, allowCron = false): Promise<Response | null> {
  const c = qaAccessConfig();
  if (!c.enabled) return null;
  if (allowCron && await qaCronAllowed(req, c)) return null;
  return await validQaSession(qaTokenFromRequest(req, c), c) ? null : qaDeniedResponse(c);
}
