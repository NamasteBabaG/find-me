import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Run from a clean release worktree with its own .vercel/project.json.
// Never promotes an alias: inspect the build and privacy audit before promote.
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectId !== "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4" || project.orgId !== "team_2bLUDGyHayGB1UHIvcCBgyWh") {
  throw Error("Refusing deployment outside the dedicated find-me-qa project");
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=all")) throw Error("Refusing a dirty release tree; commit intended changes and deploy a clean snapshot");
const commit = git("rev-parse", "HEAD");
if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Cannot identify release commit");
// Refresh remote evidence: stale local remote-tracking refs are not proof that
// another machine can reproduce this release. Detached clean snapshots are OK.
git("fetch", "--prune", "find-me");
const remoteBranches = git("for-each-ref", "--format=%(refname:short)", "--contains", commit, "refs/remotes/find-me/")
  .split(/\r?\n/).filter(branch => branch && branch !== "find-me/HEAD");
if (!remoteBranches.length) throw Error("Refusing an unpushed release commit; push it to find-me before deployment");
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ target: "find-me-qa", commit, remoteBranches, clean: true }));
} else if (process.argv.includes("--deploy")) {
  execFileSync(process.platform === "win32" ? "vercel.cmd" : "vercel", ["deploy", "--prod", "--skip-domain", "--yes", "--no-wait",
    "--meta", `releaseCommit=${commit}`, "--env", `APP_COMMIT=${commit}`, "--build-env", `APP_COMMIT=${commit}`,
  ], { stdio: "inherit", shell: process.platform === "win32" });
} else {
  throw Error("Use --check or --deploy; alias promotion is a separate verified step");
}
