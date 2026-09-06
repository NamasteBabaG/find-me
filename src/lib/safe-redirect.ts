/** Keep a user-supplied return path on this origin, including WHATWG URL normalization. */
export function safeLocalPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || value.length > 4096 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
