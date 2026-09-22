/** Runtime only: migrations keep their own connection settings. Never log this URL. */
export function boundedRuntimeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw || !/^postgres(ql)?:\/\//.test(raw)) return raw;
  const url = new URL(raw);
  // Prisma 6's socket timeout is otherwise unbounded. A lost DB connection
  // must fail before the host kills a 300-second generation request.
  for (const [key, ceiling] of Object.entries({ connect_timeout: 10, pool_timeout: 10, socket_timeout: 30 })) {
    const configured = Number(url.searchParams.get(key));
    url.searchParams.set(key, String(Number.isFinite(configured) && configured > 0 ? Math.min(configured, ceiling) : ceiling));
  }
  return url.toString();
}
