"use client";

import { useEffect, useRef, useState } from "react";

/** Failure-triggered, demo-only gate check. No polling, asset downloads,
 * credential access or private-media prefetch. A normal sign-in in a new tab
 * lets this reader retain its page and recover when focus returns. */
export function useQaImageRecovery(enabled: boolean, onRecovered: () => void) {
  const [signInRequired, setSignInRequired] = useState(false);
  const recover = useRef(onRecovered);
  recover.current = onRecovered;
  useEffect(() => {
    if (!enabled) { setSignInRequired(false); return; }
    let disposed = false, pending = false, denied = false;
    let controller: AbortController | undefined;
    async function check() {
      if (pending || disposed) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 5000);
      try {
        // Do NOT infer auth from redirect:manual + 3xx: browsers can expose
        // redirects as opaque responses with status 0, not the HTTP status.
        const response = await fetch("/api/qa-access/status", {
          credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 401 && (await response.json()).code === "QA_ACCESS_REQUIRED") {
          if (!disposed) { denied = true; setSignInRequired(true); }
        } else if (response.status === 204 && denied) {
          denied = false; setSignInRequired(false); recover.current();
        }
      } catch { /* Network/config failures are not proof of an expired session. */ }
      finally { clearTimeout(timeout); pending = false; }
    }
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; controller?.abort(); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", visible); };
  }, [enabled]);
  return enabled && signInRequired;
}
