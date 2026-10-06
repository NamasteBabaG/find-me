import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { passingQaCiRun } from "./qa-ci-proof.mjs";
import { assertProductionPrelaunchProof, assertProductionProjectLink, productionPrelaunchDeployArgs,
  productionPrelaunchMode, PRODUCTION_PRELAUNCH_TARGET } from "./production-prelaunch-proof.mjs";

/** Explicit prelaunch-only deployment. No alias promotion, schema mutation,
 * secret loading, cloud provisioning or public-launch mode lives here. */
export function runProductionPrelaunch({ args = process.argv.slice(2), cwd = process.cwd(),
  read = readFileSync, execute = execFileSync, now = Date.now, platform = process.platform, print = value => console.log(JSON.stringify(value)) } = {}) {
  const input = productionPrelaunchMode(args);
  const readJson = relative => {
    try { return JSON.parse(read(path.resolve(cwd, relative), "utf8")); }
    catch { throw Error("Refusing production-prelaunch deployment: required sanitized metadata is missing or invalid"); }
  };
  const git = (...commandArgs) => execute("git", commandArgs, { cwd, encoding: "utf8" }).trim();
  const projectLink = () => assertProductionProjectLink(readJson(".vercel/project.json"));
  const clean = () => {
    if (git("status", "--porcelain", "--untracked-files=all")) throw Error("Refusing a dirty production release tree");
  };
  projectLink(); clean();
  const commit = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Cannot identify production prelaunch release commit");
  const proof = () => assertProductionPrelaunchProof(readJson(input.preflightPath), { commit, schemaSource: read(path.resolve(cwd, "prisma/schema.prisma"), "utf8"), now: now() });
  proof();
  git("fetch", "--prune", "find-me");
  const remoteBranches = git("for-each-ref", "--format=%(refname:short)", "--contains", commit, "refs/remotes/find-me/")
    .split(/\r?\n/).filter(branch => branch && branch !== "find-me/HEAD");
  if (!remoteBranches.length) throw Error("Refusing an unpushed production prelaunch release commit");
  const runs = JSON.parse(execute(platform === "win32" ? "gh.exe" : "gh", ["run", "list", "--repo", "NamasteBabaG/find-me", "--workflow", "quality.yml", "--commit", commit,
    "--limit", "20", "--json", "databaseId,headSha,workflowName,status,conclusion"], { cwd, encoding: "utf8" }));
  const ciRun = passingQaCiRun(runs, commit);
  // Recheck after remote/CI reads: neither a changed checkout/link nor an
  // expired observation can ride an earlier passing decision into deployment.
  projectLink(); clean();
  if (git("rev-parse", "HEAD") !== commit) throw Error("Production prelaunch HEAD changed during verification");
  const approved = proof();
  print({ target: PRODUCTION_PRELAUNCH_TARGET.name, commit, ciRun, remoteBranches, protected: true, purchasing: "off", generation: "off", preflightSha256: approved.preflightSha256 });
  if (input.mode === "--deploy") {
    execute(platform === "win32" ? "vercel.cmd" : "vercel", productionPrelaunchDeployArgs(commit, approved.preflightSha256), {
      cwd, stdio: "inherit", shell: platform === "win32",
      env: { ...process.env, VERCEL_PROJECT_ID: PRODUCTION_PRELAUNCH_TARGET.projectId, VERCEL_ORG_ID: PRODUCTION_PRELAUNCH_TARGET.teamId },
    });
  }
  return approved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runProductionPrelaunch();
