import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("reviewed release tooling", () => {
  it("keeps mock application environment confined to the build step", () => {
    const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
    const beforeBuild = workflow.split("      - name: Production build and private-asset audit")[0]!;
    for (const key of ["APP_ENV", "APP_URL", "DATABASE_URL", "PAYMENT_PROVIDER", "GENERATION_PROVIDER", "SESSION_SECRET"]) expect(beforeBuild).not.toContain(`${key}:`);
    expect(workflow).toContain("          APP_ENV: development");
  });
  it("requires a clean commit on a freshly verified remote, while allowing detached release snapshots", () => {
    const root = mkdtempSync(path.join(tmpdir(), "findme-release-guard-"));
    const repo = path.join(root, "repo"), remote = path.join(root, "remote.git");
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
      git("init", "--bare", remote); git("init");
      git("config", "user.name", "Synthetic Review"); git("config", "user.email", "test@example.test");
      git("checkout", "-b", "codex/release-fixture"); git("remote", "add", "find-me", remote);
      writeFileSync(path.join(repo, ".gitignore"), ".vercel/\n");
      writeFileSync(path.join(repo, "guard.mjs"), readFileSync("scripts/deploy-qa-clean.mjs"));
      mkdirSync(path.join(repo, ".vercel"));
      const project = path.join(repo, ".vercel/project.json");
      const valid = { projectId: "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4", orgId: "team_2bLUDGyHayGB1UHIvcCBgyWh" };
      writeFileSync(project, JSON.stringify(valid));
      git("add", "."); git("commit", "-m", "synthetic base"); git("push", "find-me", "HEAD");
      const check = () => spawnSync(process.execPath, ["guard.mjs", "--check"], { cwd: repo, encoding: "utf8" });
      expect(check().status).toBe(0);
      writeFileSync(path.join(repo, "new.txt"), "fixture");
      expect(check().stderr).toContain("dirty release tree");
      git("add", "new.txt"); git("commit", "-m", "not pushed");
      expect(check().stderr).toContain("unpushed release commit");
      git("push", "find-me", "HEAD"); git("checkout", "--detach");
      const published = check(); expect(published.status).toBe(0);
      expect(JSON.parse(published.stdout).remoteBranches).toEqual(["find-me/codex/release-fixture"]);
      writeFileSync(path.join(repo, "new.txt"), "changed");
      expect(check().stderr).toContain("dirty release tree");
      writeFileSync(project, JSON.stringify({ ...valid, projectId: "wrong-project" }));
      expect(check().stderr).toContain("outside the dedicated");
    } finally {
      // Only this test's freshly allocated, validated temporary directory.
      if (path.dirname(root) === path.resolve(tmpdir()) && path.basename(root).startsWith("findme-release-guard-")) rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
