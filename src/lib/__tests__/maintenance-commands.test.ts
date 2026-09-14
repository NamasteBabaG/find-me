import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts as Record<string, string>;

// Execute only the read-only preflight, never Prisma or a schema mutation.
const guard = (url: string, ...args: string[]) => spawnSync(process.execPath, [tsx, "scripts/guard-db-target.ts", ...args], {
  cwd: root, env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 10_000,
});
const scratch: string[] = [];
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function guardEnvFile(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "findme-maintenance-env-"));
  scratch.push(dir);
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
  }
  const environment = { ...process.env }; delete environment.DATABASE_URL;
  return spawnSync(process.execPath, [tsx, path.join(root, "scripts/guard-db-target.ts")], {
    cwd: dir, env: environment, encoding: "utf8", timeout: 10_000,
  });
}

describe("maintenance entry points", () => {
  it("traces only this checkout instead of inferring an ancestor from its lockfile", () => {
    expect(nextConfig.outputFileTracingRoot).toBe(root);
  });

  it.each(["setup", "db:push", "db:push:postgres", "db:reset"])("%s guards the target before any Prisma operation", name => {
    expect(scripts[name]?.startsWith("npm run db:guard && ")).toBe(true);
  });

  it("checks tracked scripts with one tsconfig, never a private work directory", () => {
    const config = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8"));
    expect(config.include).toContain("scripts/**/*.ts");
    expect(config.include).toContain("content/**/*.ts");
    expect(config.include.some((entry: string) => entry.startsWith("work/"))).toBe(false);
    expect(config.compilerOptions.noUnusedLocals).toBe(true);
    expect(config.compilerOptions.noUnusedParameters).toBe(true);
    expect(scripts.check).toBe("tsc --noEmit && vitest run");
    expect(scripts["check:work"]).toBe("npm run typecheck");
  });

  it.each(["", "garbage", "https://example.invalid/db", "mysql://example.invalid/db", "file:", " file:./dev.db", "file:./dev.db\n"])("refuses invalid/unsupported target %j", url => {
    const result = guard(url);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL");
  });

  it("accepts only a real local file scheme or an explicitly named Postgres schema", () => {
    for (const url of ["file:./dev.db", "postgresql://localhost:5432/findme?schema=qa", "postgres://127.0.0.1:5432/findme?schema=qa"]) {
      const result = guard(url);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
    }
  });

  it.each(["", "?schema=", "?schema=qa&schema=public", "?schema=public&schema=qa", "?schema=public"])("refuses missing, ambiguous or public schema %j", query => {
    const result = guard(`postgresql://db.example.invalid/findme${query}`);
    expect(result.status).toBe(1);
  });

  it("requires an explicitly named public schema even with the operator override", () => {
    expect(guard("postgresql://db.example.invalid/findme", "--allow-public").status).toBe(1);
    expect(guard("postgresql://db.example.invalid/findme?schema=public", "--allow-public").status).toBe(0);
  });

  it("reads quoted/BOM dotenv values and the Prisma-local fallback without connecting", () => {
    expect(guardEnvFile({ ".env": "\uFEFFDATABASE_URL='file:./dev.db'\n" }).status).toBe(0);
    expect(guardEnvFile({ "prisma/.env": 'DATABASE_URL="file:./dev.db"\n' }).status).toBe(0);
  });

  it("refuses conflicting dotenv targets and interpolation rather than checking the wrong database", () => {
    expect(guardEnvFile({ ".env": "DATABASE_URL=file:./one.db", "prisma/.env": "DATABASE_URL=file:./two.db" }).status).toBe(1);
    expect(guardEnvFile({ ".env": "DATABASE_URL=\u0024{OTHER_DATABASE}" }).status).toBe(1);
    expect(guardEnvFile({}).status).toBe(1);
  });

  it("never prints credentials on refusal", () => {
    const password = "synthetic-maintenance-password";
    const target = new URL("postgresql://db.example.invalid/findme");
    target.username = "tester";
    target.password = password;
    const result = guard(target.href);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(password);
  });

  it("the source tree has no tracked private work inputs", () => {
    // This is an inventory assertion, not a scan/print of credential values.
    const tracked = execFileSync("git", ["ls-files", "--", "work", ".env", ".env.local", ".env.production", ".env.development", ".env.qa"], { cwd: root, encoding: "utf8" });
    expect(tracked.trim()).toBe("");
    const privateNames = [".env.production", ".env.preview", ".env.test", ".env.qa"];
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--", ...privateNames], { cwd: root, encoding: "utf8" });
    expect(ignored.trim().split(/\r?\n/)).toEqual(privateNames);
  });
});
