import { describe, expect, it } from "vitest";
import { boundedRuntimeDatabaseUrl } from "../runtime-url";
function syntheticUrl(query = "") {
  const url = new URL("postgresql://example.test:6543/postgres");
  url.username = "fixture";
  url.password = "synthetic@pw";
  url.search = query;
  return url;
}
describe("runtime DB timeouts", () => {
  it("leaves local SQLite and unset URLs untouched", () => {
    expect(boundedRuntimeDatabaseUrl(undefined)).toBeUndefined();
    expect(boundedRuntimeDatabaseUrl("file:./synthetic.db")).toBe("file:./synthetic.db");
  });
  it("adds bounded waits without losing pooler/schema or credentials", () => {
    const original = syntheticUrl("schema=qa&pgbouncer=true&connection_limit=2&sslmode=require");
    const bounded = new URL(boundedRuntimeDatabaseUrl(original.toString())!);
    expect(bounded.username).toBe(original.username); expect(bounded.password).toBe(original.password);
    for (const [key, value] of original.searchParams) expect(bounded.searchParams.get(key)).toBe(value);
    expect(bounded.searchParams.get("socket_timeout")).toBe("30");
    expect(bounded.searchParams.get("connect_timeout")).toBe("10");
    expect(bounded.searchParams.get("pool_timeout")).toBe("10");
  });
  it.each(["0", "999", "invalid", "-1"])("caps unbounded/invalid query waits: %s", timeout => {
    expect(new URL(boundedRuntimeDatabaseUrl(syntheticUrl(`socket_timeout=${timeout}`).toString())!).searchParams.get("socket_timeout")).toBe("30");
  });
  it("preserves stricter operator limits", () => {
    expect(new URL(boundedRuntimeDatabaseUrl(syntheticUrl("socket_timeout=4").toString())!).searchParams.get("socket_timeout")).toBe("4");
  });
});
