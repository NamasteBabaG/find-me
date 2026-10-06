import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const helperUrl = pathToFileURL(path.resolve("scripts/production-prelaunch-proof.mjs")).href;
const commandUrl = pathToFileURL(path.resolve("scripts/deploy-production-prelaunch.mjs")).href;
const commit = "a".repeat(40), observedAt = "2026-10-06T09:00:00.000Z";
const schemaSource = "model Synthetic { id String @id }\n";
const environment: Record<string, string> = {
  APP_ENV: "production", APP_URL: "https://find-me-production.vercel.app", PURCHASING_ENABLED: "off", GENERATION_ENABLED: "off",
  GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console", STORAGE_PROVIDER: "db", ANALYTICS_PROVIDER: "none",
  QA_AUTO_APPROVE: "false", QA_DELIVER_WITH_PROBLEMS: "false", QA_BOARD_CONDITIONED_WIZARD: "false", LOCAL_PATCH_PLAYER_REVIEW: "off", ADMIN_EMAILS: "",
};
function fixture() {
  return { version: "findme-production-prelaunch/v1", observedAt, releaseCommit: commit,
    project: { id: "prj_b2zHHVVG9B6ypJUsmXXUg3Uf62jG", teamId: "team_2bLUDGyHayGB1UHIvcCBgyWh", name: "find-me-production", paused: false,
      ssoProtection: { deploymentType: "all" }, autoAssignCustomDomains: false, nodeVersion: "24.x", regions: ["fra1"], domains: [{ name: "find-me-production.vercel.app" }] },
    environment: { ...environment }, credentialsConfigured: { database: true, session: true, cron: true },
    database: { version: "findme-production-database-live/v1", projectRef: "pazdlpginuhnobeedzyn", schema: "app", runtimeRole: "findme_runtime",
      sourceSha256: createHash("sha256").update(schemaSource).digest("hex"), schemaVerified: true, runtimeRoleVerified: true, allTablesRlsVerified: true,
      connectionIdentity: { vercelProjectId: "prj_b2zHHVVG9B6ypJUsmXXUg3Uf62jG", vercelEnvironment: "production", projectRef: "pazdlpginuhnobeedzyn",
        schema: "app", database: "postgres", currentUser: "findme_runtime", sourceSha256: createHash("sha256").update(schemaSource).digest("hex") }, runtimeProbeVerified: true } };
}
const passing = { databaseId: 42, headSha: commit, workflowName: "Quality gate", status: "completed", conclusion: "success" };

/** Real guard functions/command orchestrator, with every CLI and filesystem
 * read supplied in memory. No remote, cloud, DB, secrets or provider is read. */
function evaluate(operation: "proof" | "run" | "args", options: Record<string, unknown> = {}) {
  const input = { operation, proof: fixture(), commit, now: observedAt, schemaSource, mode: "--check", runs: [passing], ...options };
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import {assertProductionPrelaunchProof,productionPrelaunchDeployArgs} from ${JSON.stringify(helperUrl)};
    import {runProductionPrelaunch} from ${JSON.stringify(commandUrl)};
    const input=JSON.parse(process.argv[1]),calls=[],printed=[];
    let afterCi=false,statusReads=0,headReads=0;
    const now=()=>Date.parse(input.now)+(afterCi&&input.expireAfterCi?16*60_000:0);
    const read=(file)=>{
      if(file.endsWith('project.json'))return JSON.stringify({projectId:afterCi&&input.changedLinkAfterCi?'wrong':input.linkProjectId??input.proof.project.id,orgId:input.proof.project.teamId,projectName:input.proof.project.name});
      if(file.endsWith('schema.prisma'))return input.schemaSource;
      if(file.endsWith('preflight.json'))return JSON.stringify(input.proof);
      throw Error('Unexpected filesystem read');
    };
    const execute=(command,args,options)=>{
      calls.push({command,args,...(command==='vercel'?{projectId:options.env.VERCEL_PROJECT_ID,orgId:options.env.VERCEL_ORG_ID}: {})});
      if(command==='git'){
        if(args[0]==='status'){statusReads++;return input.dirty||statusReads>1&&input.dirtyAfterCi?' M source.ts':'';}
        if(args[0]==='rev-parse'){headReads++;return headReads>1&&input.changedHeadAfterCi?'b'.repeat(40):input.commit;}
        if(args[0]==='fetch')return '';
        if(args[0]==='for-each-ref')return input.unpushed?'':'find-me/codex/prelaunch';
      }
      if(command==='gh'){afterCi=true;return JSON.stringify(input.runs);}
      if(command==='vercel')return '';
      throw Error('Unexpected external command');
    };
    try {
      const result=input.operation==='proof'?assertProductionPrelaunchProof(input.proof,{commit:input.commit,schemaSource:input.schemaSource,now:now()}):
        input.operation==='args'?productionPrelaunchDeployArgs(input.commit,'c'.repeat(64)):
        runProductionPrelaunch({args:input.args??[input.mode,'--preflight','preflight.json'],cwd:'/synthetic',read,execute,now,platform:'linux',print:value=>printed.push(value)});
      console.log(JSON.stringify({ok:true,result,calls,printed}));
    }catch(error){console.log(JSON.stringify({ok:false,error:error.message,calls,printed}));}
  `, JSON.stringify(input)], { encoding: "utf8", timeout: 10_000, windowsHide: true });
  expect(child.error).toBeUndefined(); expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as { ok: boolean; error?: string; result: Record<string, unknown> | string[];
    calls: Array<{ command: string; args: string[]; projectId?: string; orgId?: string }>; printed: Array<Record<string, unknown>> };
}

describe("closed production foundation deployment", () => {
  it("accepts fresh protected metadata and a live schema bound to the current source", () => {
    const result = evaluate("proof");
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ commit, projectId: fixture().project.id, version: "findme-production-prelaunch/v1" });
    expect((result.result as Record<string, unknown>).preflightSha256).toMatch(/^[a-f0-9]{64}$/);
    const noAlias = fixture(); noAlias.project.domains = [];
    expect(evaluate("proof", { proof: noAlias }).ok).toBe(true);
  });

  it.each([
    "wrong-version", "wrong-commit", "wrong-project", "wrong-team", "wrong-name", "paused", "production-only-protection", "no-protection",
    "automatic-custom-domains", "custom-domain", "wrong-node", "wrong-region", "qa-database", "qa-schema", "admin-role", "offline-manifest",
    "changed-schema", "unverified-schema", "unverified-role", "unverified-rls", "missing-session",
  ])("refuses %s before executing any CLI", kind => {
    const proof = fixture();
    if (kind === "wrong-version") proof.version = "future";
    if (kind === "wrong-commit") proof.releaseCommit = "b".repeat(40);
    if (kind === "wrong-project") proof.project.id = "qa-project";
    if (kind === "wrong-team") proof.project.teamId = "another-team";
    if (kind === "wrong-name") proof.project.name = "find-me-qa";
    if (kind === "paused") proof.project.paused = true;
    if (kind === "production-only-protection") proof.project.ssoProtection.deploymentType = "prod_deployment_urls_and_all_previews";
    if (kind === "no-protection") proof.project.ssoProtection.deploymentType = "";
    if (kind === "automatic-custom-domains") proof.project.autoAssignCustomDomains = true;
    if (kind === "custom-domain") proof.project.domains = [{ name: "findmeworlds.com" }];
    if (kind === "wrong-node") proof.project.nodeVersion = "22.x";
    if (kind === "wrong-region") proof.project.regions = ["iad1"];
    if (kind === "qa-database") proof.database.projectRef = "qa-project-reference";
    if (kind === "qa-schema") proof.database.schema = "qa";
    if (kind === "admin-role") proof.database.runtimeRole = "postgres";
    if (kind === "offline-manifest") proof.database.version = "findme-production-bootstrap/v1";
    if (kind === "changed-schema") proof.database.sourceSha256 = "b".repeat(64);
    if (kind === "unverified-schema") proof.database.schemaVerified = false;
    if (kind === "unverified-role") proof.database.runtimeRoleVerified = false;
    if (kind === "unverified-rls") proof.database.allTablesRlsVerified = false;
    if (kind === "missing-session") proof.credentialsConfigured.session = false;
    const result = evaluate("proof", { proof });
    expect(result.ok).toBe(false); expect(result.calls).toEqual([]);
  });

  it.each(["PURCHASING_ENABLED", "GENERATION_ENABLED", "GENERATION_PROVIDER", "PAYMENT_PROVIDER", "EMAIL_PROVIDER", "STORAGE_PROVIDER", "APP_ENV", "QA_AUTO_APPROVE", "QA_DELIVER_WITH_PROBLEMS"])("refuses changed %s", key => {
    const proof = fixture(); proof.environment[key] = "unsafe";
    expect(evaluate("run", { proof, mode: "--deploy" }).calls.every(call => call.command !== "vercel")).toBe(true);
    expect(evaluate("proof", { proof }).ok).toBe(false);
  });

  it.each(["vercel-project", "vercel-environment", "supabase-project", "schema", "database", "privileged-role", "source", "probe"])("refuses a wrong credential-bound runtime %s despite correct independent schema metadata", kind => {
    const proof = fixture();
    if (kind === "vercel-project") proof.database.connectionIdentity.vercelProjectId = "qa-vercel-project";
    if (kind === "vercel-environment") proof.database.connectionIdentity.vercelEnvironment = "preview";
    if (kind === "supabase-project") proof.database.connectionIdentity.projectRef = "qa-project-reference";
    if (kind === "schema") proof.database.connectionIdentity.schema = "qa";
    if (kind === "database") proof.database.connectionIdentity.database = "other";
    if (kind === "privileged-role") proof.database.connectionIdentity.currentUser = "postgres";
    if (kind === "source") proof.database.connectionIdentity.sourceSha256 = "b".repeat(64);
    if (kind === "probe") proof.database.runtimeProbeVerified = false;
    const result = evaluate("run", { proof, mode: "--deploy" });
    expect(result.ok).toBe(false); expect(result.calls.every(call => call.command !== "vercel")).toBe(true);
  });

  it.each(["connectionIdentity", "runtimeProbeVerified"])("credential presence alone cannot replace missing %s evidence", key => {
    const proof = fixture();
    delete (proof.database as Record<string, unknown>)[key];
    const result = evaluate("proof", { proof });
    expect(result.ok).toBe(false); expect(result.calls).toEqual([]);
  });

  it("rejects secret material inside connection evidence without echoing it", () => {
    const proof = fixture();
    const sensitive = "synthetic-sensitive-runtime-credential";
    Object.assign(proof.database.connectionIdentity, { password: sensitive });
    const result = evaluate("proof", { proof });
    expect(result.ok).toBe(false); expect(result.error).not.toContain(sensitive); expect(result.calls).toEqual([]);
  });

  it.each(["2026-10-06T08:44:59.999Z", "2026-10-06T09:00:30.001Z", "not-a-date"])("requires a recent real observation: %s", observed => {
    const proof = fixture(); proof.observedAt = observed;
    expect(evaluate("proof", { proof }).ok).toBe(false);
  });

  it("rejects accidental secret/connection metadata without echoing its value", () => {
    const proof = fixture(); proof.environment.DATABASE_URL = "synthetic-sensitive-value-must-not-be-printed";
    const result = evaluate("proof", { proof });
    expect(result.ok).toBe(false); expect(result.error).not.toContain(proof.environment.DATABASE_URL);
  });

  it("check mode still refreshes pushed and exact-CI evidence, but never deploys", () => {
    const result = evaluate("run");
    expect(result.ok).toBe(true);
    expect(result.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "git", args: ["fetch", "--prune", "find-me"] }),
      expect.objectContaining({ command: "gh", args: expect.arrayContaining(["quality.yml", "--commit", commit]) }),
    ]));
    expect(result.calls.some(call => call.command === "vercel")).toBe(false);
  });

  it.each(["dirty", "unpushed", "changedHeadAfterCi", "changedLinkAfterCi", "dirtyAfterCi", "expireAfterCi"])("cannot deploy after %s", issue => {
    const result = evaluate("run", { [issue]: true, mode: "--deploy" });
    expect(result.ok).toBe(false); expect(result.calls.some(call => call.command === "vercel")).toBe(false);
  });

  it.each([[], [{ ...passing, status: "in_progress" }], [{ ...passing, headSha: "b".repeat(40) }], [{ ...passing, conclusion: "failure" }, passing]].map(runs => ({ runs })))("cannot deploy without latest completed exact-CI proof ($runs)", ({ runs }) => {
    const result = evaluate("run", { runs, mode: "--deploy" });
    expect(result.ok).toBe(false); expect(result.calls.some(call => call.command === "vercel")).toBe(false);
  });

  it("pins every build/runtime flag off/mock and the exact target, never promoting an alias", () => {
    const result = evaluate("run", { mode: "--deploy" });
    expect(result.ok).toBe(true);
    const deployment = result.calls.filter(call => call.command === "vercel");
    expect(deployment).toHaveLength(1);
    const call = deployment[0]!;
    expect(call.args.slice(0, 5)).toEqual(["deploy", "--prod", "--skip-domain", "--yes", "--no-wait"]);
    expect(call.projectId).toBe(fixture().project.id); expect(call.orgId).toBe(fixture().project.teamId);
    for (const [key, value] of Object.entries({ ...environment, APP_COMMIT: commit })) {
      for (const flag of ["--env", "--build-env"]) expect(call.args.some((arg, index) => arg === flag && call.args[index + 1] === `${key}=${value}`)).toBe(true);
    }
    expect(call.args).not.toEqual(expect.arrayContaining(["promote", "alias", "--prebuilt"]));
    expect(JSON.stringify(result.printed)).not.toContain("DATABASE_URL");
  });

  it("rejects extra command arguments rather than exposing a launch override", () => {
    const result = evaluate("run", { args: ["--deploy", "--preflight", "preflight.json", "--env", "PURCHASING_ENABLED=on"] });
    expect(result.ok).toBe(false); expect(result.calls).toEqual([]);
  });
});
