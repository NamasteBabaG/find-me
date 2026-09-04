import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No tracked file may contain a real credential.
 *
 * This exists because one did: a live Supabase password reached a public
 * repository inside a commit made with `git add -A`, which swept up a file
 * nobody had read. A test is the right place for it — `npm run check` runs
 * before every commit, and unlike a hook it cannot be skipped or go
 * uninstalled on another machine.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");

/** Patterns that are a secret by construction, not by looking secret. */
const SECRETS: Array<{ name: string; re: RegExp }> = [
  // A database URL with anything other than an obvious placeholder as the password.
  { name: "database URL with a password", re: /postgres(?:ql)?:\/\/[^:\s"']+:(?!\[|YOUR|PASSWORD|password|\*{3}|xxx|<)[^@\s"']{6,}@/ },
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "Supabase service-role or publishable key", re: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

/** Binary and vendored files: nothing hand-written, and reading them is pointless. */
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".ico", ".mp3", ".wav", ".woff", ".woff2", ".ttf", ".db", ".pdf"]);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

describe("tracked files carry no credentials", () => {
  it("finds no secret in anything git is tracking", () => {
    const found: string[] = [];
    for (const rel of trackedFiles()) {
      if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue;
      const file = path.join(ROOT, rel);
      if (!existsSync(file) || statSync(file).size > 2 * 1024 * 1024) continue;
      // This test's own patterns are not findings.
      if (rel.endsWith("no-secrets.test.ts")) continue;
      const text = readFileSync(file, "utf-8");
      for (const { name, re } of SECRETS) {
        const hit = re.exec(text);
        if (hit) found.push(`${rel}: ${name} (…${hit[0].slice(-12)})`);
      }
    }
    expect(found, `Tracked files contain credentials:\n  ${found.join("\n  ")}\n\nRotate the credential first — removing the line does not remove it from git history.`).toEqual([]);
  });

  it("recognises a real credential and ignores a placeholder", () => {
    const dbUrl = SECRETS[0]!.re;
    expect(dbUrl.test('DATABASE_URL="postgresql://postgres:hunter2hunter2@db.abc.supabase.co:5432/postgres"')).toBe(true);
    expect(dbUrl.test('DATABASE_URL="postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0.pooler.supabase.com:6543/postgres"')).toBe(false);
    expect(dbUrl.test('DATABASE_URL="postgresql://user:PASSWORD@host:5432/db"')).toBe(false);
    expect(dbUrl.test('DATABASE_URL="file:./dev.db"')).toBe(false);
    expect(SECRETS[1]!.re.test("sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456")).toBe(true);
  });
});
