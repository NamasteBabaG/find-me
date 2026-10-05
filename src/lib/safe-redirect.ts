/** Keep a user-supplied return path on this origin, including WHATWG URL normalization. */
export function safeLocalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid") return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Dot-segment normalization can turn /a/..//host into a protocol-relative
    // destination. Validate the value that the navigation sink will receive.
    return path.startsWith("//") || path.includes("\\") ? fallback : path;
  } catch {
    return fallback;
  }
}

/** Return context is navigation only; the destination repeats its owner checks. */
export function familySignInHref(next: string | null | undefined, error?: "expired"): string {
  const query = new URLSearchParams();
  if (error) query.set("error", error);
  query.set("next", safeLocalPath(next, "/family"));
  return `/family?${query}`;
}
