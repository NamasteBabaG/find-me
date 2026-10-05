/** Bound parent/report requests too: a dead connection must offer a retry. */
export async function friendRequest(path: string, body: object) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 404 || response.status === 403 ? "unavailable" : "network");
    return await response.json();
  } finally { clearTimeout(timer); }
}
