import { createHash } from "node:crypto";

/** A separate, protected foundation deployment. This is not a shop launch. */
export const PRODUCTION_PRELAUNCH_VERSION = "findme-production-prelaunch/v1";
export const PRODUCTION_PRELAUNCH_TARGET = Object.freeze({
  projectId: "prj_b2zHHVVG9B6ypJUsmXXUg3Uf62jG", teamId: "team_2bLUDGyHayGB1UHIvcCBgyWh",
  name: "find-me-production", projectRef: "pazdlpginuhnobeedzyn", schema: "app", runtimeRole: "findme_runtime",
});
export const PRELAUNCH_ENVIRONMENT = Object.freeze({
  APP_ENV: "production", APP_URL: "https://find-me-production.vercel.app", PURCHASING_ENABLED: "off",
  GENERATION_ENABLED: "off", GENERATION_PROVIDER: "mock", PAYMENT_PROVIDER: "mock", EMAIL_PROVIDER: "console",
  STORAGE_PROVIDER: "db", ANALYTICS_PROVIDER: "none", QA_AUTO_APPROVE: "false", QA_DELIVER_WITH_PROBLEMS: "false",
  QA_BOARD_CONDITIONED_WIZARD: "false", LOCAL_PATCH_PLAYER_REVIEW: "off", ADMIN_EMAILS: "",
});
const FRESH_MS = 15 * 60_000;
const deny = reason => { throw Error(`Refusing production-prelaunch deployment: ${reason}`); };
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sha = value => createHash("sha256").update(value).digest("hex");

function object(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) deny(`invalid sanitized ${label} metadata`);
}

export function productionPrelaunchMode(args) {
  if (!Array.isArray(args) || args.length !== 3 || !["--check", "--deploy"].includes(args[0])
    || args[1] !== "--preflight" || typeof args[2] !== "string" || !args[2].trim()) {
    deny("use --check|--deploy --preflight <sanitized evidence.json>; extra deploy arguments are forbidden");
  }
  return { mode: args[0], preflightPath: args[2] };
}

export function assertProductionProjectLink(link) {
  if (!link || link.projectId !== PRODUCTION_PRELAUNCH_TARGET.projectId || link.orgId !== PRODUCTION_PRELAUNCH_TARGET.teamId
    || link.projectName !== PRODUCTION_PRELAUNCH_TARGET.name) deny("checkout is not linked to the dedicated production project");
}

/** The caller supplies freshly captured cloud metadata, never credentials.
 * An offline DDL manifest is deliberately not live database evidence. This
 * validates an operator preflight; it does not query or configure any cloud. */
export function assertProductionPrelaunchProof(proof, { commit, schemaSource, now = Date.now() }) {
  object(proof, ["version", "observedAt", "releaseCommit", "project", "environment", "credentialsConfigured", "database"], "preflight");
  if (proof.version !== PRODUCTION_PRELAUNCH_VERSION || !/^[a-f0-9]{40}$/.test(commit) || proof.releaseCommit !== commit) deny("preflight is not bound to this exact release commit");
  const observedAt = Date.parse(proof.observedAt);
  if (typeof proof.observedAt !== "string" || !Number.isFinite(observedAt) || !Number.isFinite(now)
    || now - observedAt > FRESH_MS || observedAt - now > 30_000) deny("preflight cloud observation is stale or in the future");
  const project = proof.project;
  object(project, ["id", "teamId", "name", "paused", "ssoProtection", "autoAssignCustomDomains", "nodeVersion", "regions", "domains"], "project");
  if (project.id !== PRODUCTION_PRELAUNCH_TARGET.projectId || project.teamId !== PRODUCTION_PRELAUNCH_TARGET.teamId
    || project.name !== PRODUCTION_PRELAUNCH_TARGET.name || project.paused !== false) deny("wrong or paused cloud project");
  object(project.ssoProtection, ["deploymentType"], "protection");
  if (project.ssoProtection.deploymentType !== "all" || project.autoAssignCustomDomains !== false) deny("every deployment must be protected and automatic custom-domain assignment disabled");
  if (project.nodeVersion !== "24.x" || !Array.isArray(project.regions) || project.regions.length !== 1 || project.regions[0] !== "fra1") deny("cloud runtime differs from the approved prelaunch configuration");
  if (!Array.isArray(project.domains) || project.domains.some(domain => {
    object(domain, ["name"], "domain");
    return typeof domain.name !== "string" || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/.test(domain.name);
  })) deny("custom/public domains are outside this prelaunch deployment");
  object(proof.environment, Object.keys(PRELAUNCH_ENVIRONMENT), "environment");
  for (const [key, required] of Object.entries(PRELAUNCH_ENVIRONMENT)) {
    if (proof.environment[key] !== required) deny(`safe ${key} setting is missing or changed`);
  }
  object(proof.credentialsConfigured, ["database", "session", "cron"], "credential presence");
  if (["database", "session", "cron"].some(key => proof.credentialsConfigured[key] !== true)) deny("required independent credential presence is unverified");
  const database = proof.database;
  object(database, ["version", "projectRef", "schema", "runtimeRole", "sourceSha256", "schemaVerified", "runtimeRoleVerified", "allTablesRlsVerified", "connectionIdentity", "runtimeProbeVerified"], "database");
  if (database.version !== "findme-production-database-live/v1" || database.projectRef !== PRODUCTION_PRELAUNCH_TARGET.projectRef
    || database.schema !== PRODUCTION_PRELAUNCH_TARGET.schema || database.runtimeRole !== PRODUCTION_PRELAUNCH_TARGET.runtimeRole
    || !digest(database.sourceSha256) || typeof schemaSource !== "string" || database.sourceSha256 !== sha(schemaSource)
    || database.schemaVerified !== true || database.runtimeRoleVerified !== true || database.allTablesRlsVerified !== true) {
    deny("live isolated schema, restricted runtime role and all-table RLS must match the current schema source");
  }
  // Capture using the exact DATABASE_URL stored for this Vercel project's
  // production environment, not an independently supplied admin/QA connection.
  // Privately establish its Supabase project identity, query current_database(),
  // current_user, current_schema() and app's source marker through that runtime
  // credential, and complete the authorized synthetic runtime probe. Only this
  // sanitized witness is retained; never include the URL/password or their hash.
  const connection = database.connectionIdentity;
  object(connection, ["vercelProjectId", "vercelEnvironment", "projectRef", "schema", "database", "currentUser", "sourceSha256"], "runtime connection identity");
  if (connection.vercelProjectId !== PRODUCTION_PRELAUNCH_TARGET.projectId || connection.vercelEnvironment !== "production"
    || connection.projectRef !== PRODUCTION_PRELAUNCH_TARGET.projectRef || connection.schema !== PRODUCTION_PRELAUNCH_TARGET.schema
    || connection.database !== "postgres" || connection.currentUser !== PRODUCTION_PRELAUNCH_TARGET.runtimeRole
    || connection.sourceSha256 !== database.sourceSha256 || database.runtimeProbeVerified !== true) {
    deny("the configured production database credential must verify the approved runtime connection and synthetic probe");
  }
  return { version: PRODUCTION_PRELAUNCH_VERSION, projectId: project.id, commit, preflightSha256: sha(JSON.stringify(proof)) };
}

export function productionPrelaunchDeployArgs(commit, preflightSha256) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !digest(preflightSha256)) deny("invalid release identity");
  const args = ["deploy", "--prod", "--skip-domain", "--yes", "--no-wait", "--scope", PRODUCTION_PRELAUNCH_TARGET.teamId,
    "--meta", `releaseCommit=${commit}`, "--meta", `prelaunchGuard=${PRODUCTION_PRELAUNCH_VERSION}`, "--meta", `preflightSha256=${preflightSha256}`];
  // Nonsecret overrides are intentionally fixed, for build and runtime alike.
  // This tool cannot be used to enable purchasing or a billed provider.
  for (const [key, value] of Object.entries({ ...PRELAUNCH_ENVIRONMENT, APP_COMMIT: commit })) {
    args.push("--env", `${key}=${value}`, "--build-env", `${key}=${value}`);
  }
  return args;
}
