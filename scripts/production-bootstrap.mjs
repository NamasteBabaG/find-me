/** Offline, fresh-project production bootstrap preparation. No DB connections,
 * credentials, customer rows, provider calls or Prisma client generation.
 * Actual SQL execution belongs to the reviewed, exact-project Supabase runner. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_PROJECT_REF = "pazdlpginuhnobeedzyn";
export const PRODUCTION_SCHEMA = "app";
export const RUNTIME_ROLE = "findme_runtime";
export const OWNER_ROLE = "findme_owner";
const VERSION = "findme-production-bootstrap/v1";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const quoted = value => `"${value.replaceAll('"', '""')}"`;
const columnsOf = value => [...value.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map(row => row[1]);
const actions = { CASCADE: "c", RESTRICT: "r", "NO ACTION": "a", "SET NULL": "n", "SET DEFAULT": "d" };
const normalizeDefault = value => value === null ? null : value.trim().replace(/::text$/, "").replace(/^(CURRENT_TIMESTAMP|TRUE|FALSE)$/i, item => item.toLowerCase());
const sortedObject = rows => Object.fromEntries(rows.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));

/** No production target is inferred from a URL, .env, current directory, QA
 * configuration, display name or Vercel's deployment target. */
export function guardProductionBootstrap(target) {
  if (target?.projectRef !== PRODUCTION_PROJECT_REF || target?.schema !== PRODUCTION_SCHEMA || target?.appEnv !== "production") {
    throw Error("Production bootstrap requires the approved project ref, schema app and APP_ENV production");
  }
  return { projectRef: PRODUCTION_PROJECT_REF, schema: PRODUCTION_SCHEMA, appEnv: "production" };
}

/** The schema-only diff cannot contact a database: cwd is an empty temporary
 * directory and its only datasource is an unreachable synthetic localhost URL.
 * Run the installed CLI directly, with a small environment, never npx/download.
 * No generated Prisma client or node_modules engine file is rewritten. */
export function generatePostgresDdl(root = process.cwd()) {
  const source = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  if ((source.match(/provider\s*=\s*"sqlite"/g) ?? []).length !== 1 || /@@map\(|@map\(|@@schema\(/.test(source)) {
    throw Error("Production bootstrap needs review for a changed Prisma datasource/mapping contract");
  }
  const scratchParent = path.resolve(tmpdir());
  const scratch = mkdtempSync(path.join(scratchParent, "findme-production-schema-"));
  try {
    const schemaPath = path.join(scratch, "schema.prisma");
    writeFileSync(schemaPath, source.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"'));
    const safeEnv = Object.fromEntries(["PATH", "SystemRoot", "TEMP", "TMP"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    const ddl = execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema-datamodel", schemaPath, "--script"], {
      cwd: scratch, encoding: "utf8", timeout: 60_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...safeEnv, DATABASE_URL: "postgresql://synthetic:PASSWORD@127.0.0.1:1/synthetic?schema=app", CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    }).replace(/\r\n/g, "\n");
    return { sourceSha256: sha256(source), source, ddl };
  } catch {
    // Prisma errors can include paths/environment; do not echo them wholesale.
    throw Error("Offline installed Prisma PostgreSQL schema diff failed; no database was contacted");
  } finally {
    const resolved = path.resolve(scratch);
    if (path.dirname(resolved) !== scratchParent || !path.basename(resolved).startsWith("findme-production-schema-")) throw Error("Refusing an unexpected bootstrap scratch cleanup target");
    rmSync(resolved, { recursive: true, force: true });
  }
}

/** A narrowly accepted CREATE-only grammar. Reject future unsupported SQL
 * rather than accidentally leave a table unqualified or unchecked. */
export function qualifyBootstrapDdl(raw, source) {
  const modelNames = [...source.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm)].map(row => row[1]);
  if (!modelNames.length || new Set(modelNames).size !== modelNames.length) throw Error("Invalid Prisma model list");
  let ddl = raw.replace(/--[^\n]*/g, "").trim();
  // Prisma versions may emit either public-qualified or unqualified names.
  ddl = ddl.replace(/CREATE SCHEMA(?: IF NOT EXISTS)? "(?:public|app)";\s*/g, "").replaceAll('"public".', '"app".');
  ddl = ddl.replace(/\b(CREATE TABLE|ALTER TABLE|REFERENCES) "(\w+)"/g, (_, verb, table) => `${verb} "app"."${table}"`)
    .replace(/\bON "(\w+)"/g, (_, table) => `ON "app"."${table}"`);
  const statements = ddl.split(";").map(value => value.trim()).filter(Boolean);
  for (const statement of statements) {
    if (!/^(CREATE TABLE "app"\."\w+" \([\s\S]+\)|CREATE (?:UNIQUE )?INDEX "\w+" ON "app"\."\w+"\([^;]+\)|ALTER TABLE "app"\."\w+" ADD CONSTRAINT "\w+" FOREIGN KEY \([^;]+\) REFERENCES "app"\."\w+"\([^;]+\) ON DELETE (?:CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT) ON UPDATE (?:CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT))$/.test(statement)) {
      throw Error("Unsupported production bootstrap DDL statement; review is required");
    }
  }
  const tables = [...ddl.matchAll(/CREATE TABLE "app"\."(\w+)"/g)].map(row => row[1]);
  if (JSON.stringify([...tables].sort()) !== JSON.stringify([...modelNames].sort())) throw Error("DDL does not cover the complete current Prisma schema");
  return `${statements.join(";\n\n")};\n`;
}

export function bootstrapMetadata(ddl) {
  const tableEntries = [], columns = [], indexes = [], constraints = [];
  for (const match of ddl.matchAll(/CREATE TABLE "app"\."(\w+)" \(([\s\S]*?)\n\)/g)) {
    const table = match[1], lines = match[2].split("\n").map(line => line.trim()).filter(Boolean);
    tableEntries.push([table, true]);
    for (const line of lines) {
      const column = /^"(\w+)" (TEXT|INTEGER|BOOLEAN|BYTEA|TIMESTAMP\(3\))( NOT NULL)?(?: DEFAULT (.+?))?,?$/.exec(line);
      if (column) {
        const type = column[2] === "TIMESTAMP(3)" ? "timestamp(3) without time zone" : column[2].toLowerCase();
        columns.push([`${table}.${column[1]}`, { type, nullable: !column[3], default: normalizeDefault(column[4] ?? null), identity: "", generated: "" }]);
        continue;
      }
      const pk = /^CONSTRAINT "(\w+)" PRIMARY KEY \((.+)\),?$/.exec(line);
      if (!pk) throw Error(`Unsupported bootstrap table definition: ${table}`);
      const keys = columnsOf(pk[2]);
      constraints.push([`${table}.${pk[1]}`, { kind: "p", columns: keys, targetSchema: null, targetTable: null, targetColumns: [], deleteAction: null, updateAction: null, validated: true, deferrable: false, deferred: false }]);
      indexes.push([`${table}.${pk[1]}`, indexMetadata(keys, true, true)]);
    }
  }
  for (const match of ddl.matchAll(/CREATE (UNIQUE )?INDEX "(\w+)" ON "app"\."(\w+)"\((.+)\);/g)) {
    indexes.push([`${match[3]}.${match[2]}`, indexMetadata(columnsOf(match[4]), Boolean(match[1]), false)]);
  }
  for (const match of ddl.matchAll(/ALTER TABLE "app"\."(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \((.+)\) REFERENCES "app"\."(\w+)"\((.+)\) ON DELETE (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT) ON UPDATE (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT);/g)) {
    constraints.push([`${match[1]}.${match[2]}`, { kind: "f", columns: columnsOf(match[3]), targetSchema: "app", targetTable: match[4], targetColumns: columnsOf(match[5]), deleteAction: actions[match[6]], updateAction: actions[match[7]], validated: true, deferrable: false, deferred: false }]);
  }
  if (!tableEntries.length || tableEntries.length !== constraints.filter(([, value]) => value.kind === "p").length) throw Error("Every bootstrap table must have a verified primary key");
  for (const rows of [tableEntries, columns, indexes, constraints]) if (new Set(rows.map(([key]) => key)).size !== rows.length) throw Error("Duplicate bootstrap metadata identity");
  return { tables: sortedObject(tableEntries), columns: sortedObject(columns), indexes: sortedObject(indexes), constraints: sortedObject(constraints) };
}

function indexMetadata(keys, unique, primary) {
  return { columns: keys, unique, primary, valid: true, ready: true, live: true, immediate: true, method: "btree", partial: false, expression: false, nullsNotDistinct: false, keyCount: keys.length, columnCount: keys.length, options: keys.map(() => 0) };
}

function preflightSql() {
  return `-- Execute ONLY with Supabase project_id ${PRODUCTION_PROJECT_REF}; SQL cannot infer the project ref from its database name.
DO $bootstrap_preflight$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN RAISE EXCEPTION 'Expected privileged Supabase postgres executor'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='app') THEN RAISE EXCEPTION 'Fresh bootstrap refuses an existing app schema'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='findme_runtime') THEN RAISE EXCEPTION 'Fresh bootstrap refuses an existing runtime role'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='findme_owner') THEN RAISE EXCEPTION 'Fresh bootstrap refuses an existing owner role'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','qa') AND c.relkind='r' AND c.relname IN ('Game','User','FileBlob','Order')) THEN
    RAISE EXCEPTION 'Fresh bootstrap refuses an application/QA namespace on this project';
  END IF;
END
$bootstrap_preflight$;
`;
}

export function prepareBootstrap({ projectRef, schema, appEnv, sourceSha256, ddl }) {
  guardProductionBootstrap({ projectRef, schema, appEnv });
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw Error("Invalid bootstrap source hash");
  const metadata = bootstrapMetadata(ddl), tables = Object.keys(metadata.tables);
  const marker = `${VERSION};project=${PRODUCTION_PROJECT_REF};source=${sourceSha256}`;
  const policies = tables.map(table => `ALTER TABLE "app".${quoted(table)} ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app".${quoted(table)} FORCE ROW LEVEL SECURITY;
CREATE POLICY "findme_server_runtime" ON "app".${quoted(table)} FOR ALL TO "findme_runtime" USING (true) WITH CHECK (true);`).join("\n");
  const preflight = preflightSql();
  const bootstrap = `-- ${marker}
-- Fresh empty project only. No COPY/INSERT/customer data, credentials or LOGIN password.
-- Runtime authorization remains in application services. These policies permit only the private DB role, never API users.
BEGIN;
${preflight}
CREATE ROLE "findme_owner" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE "findme_runtime" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- PG17 gives the non-superuser creator ADMIN automatically. Re-granting ADMIN
-- back to that grantor can fail 0LP01; only SET is needed for guarded bootstrap.
DO $bootstrap_role_set$
BEGIN
  IF NOT pg_catalog.pg_has_role(current_user,'findme_owner','SET') THEN
    GRANT "findme_owner" TO "postgres" WITH SET TRUE;
  END IF;
  IF NOT pg_catalog.pg_has_role(current_user,'findme_runtime','SET') THEN
    GRANT "findme_runtime" TO "postgres" WITH SET TRUE;
  END IF;
END
$bootstrap_role_set$;
ALTER ROLE "findme_runtime" SET search_path = app, pg_catalog;
GRANT CONNECT ON DATABASE "postgres" TO "findme_runtime";
CREATE SCHEMA "app" AUTHORIZATION "findme_owner";
SET LOCAL ROLE "findme_owner";
COMMENT ON SCHEMA "app" IS ${literal(marker)};
REVOKE ALL ON SCHEMA "app" FROM PUBLIC, anon, authenticated, service_role;
-- Global defaults of our NEW owner role only; do not change Supabase postgres defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE "findme_owner" REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE "findme_owner" REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE "findme_owner" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
${ddl}
REVOKE ALL ON ALL TABLES IN SCHEMA "app" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "app" FROM PUBLIC, anon, authenticated, service_role;
${policies}
GRANT USAGE ON SCHEMA "app" TO "findme_runtime";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "app" TO "findme_runtime";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "app" TO "findme_runtime";
COMMIT;
`;
  const verify = verificationSql(metadata, marker);
  const manifest = { version: VERSION, projectRef, schema, runtimeRole: RUNTIME_ROLE, ownerRole: OWNER_ROLE, sourceSha256,
    ddlSha256: sha256(ddl), preflightSha256: sha256(preflight), bootstrapSha256: sha256(bootstrap), verificationSha256: sha256(verify),
    tables: tables.length, columns: Object.keys(metadata.columns).length, indexes: Object.keys(metadata.indexes).length,
    primaryKeys: Object.values(metadata.constraints).filter(row => row.kind === "p").length,
    foreignKeys: Object.values(metadata.constraints).filter(row => row.kind === "f").length, metadata };
  return { preflight, bootstrap, verify, manifest };
}

function verificationSql(expected, marker) {
  return `-- Metadata only; safe before and after separate credential provisioning. Never selects application rows or passwords.
-- Exact Supabase project_id ${PRODUCTION_PROJECT_REF}, schema app, Prisma source marker ${marker}.
DO $bootstrap_verify$
DECLARE expected jsonb := ${literal(JSON.stringify(expected))}::jsonb; actual jsonb; runtime_oid oid; owner_oid oid;
BEGIN
  IF current_database() <> 'postgres' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
  IF (SELECT pg_catalog.obj_description(oid,'pg_namespace') FROM pg_catalog.pg_namespace WHERE nspname='app') IS DISTINCT FROM ${literal(marker)} THEN RAISE EXCEPTION 'Source/project schema marker mismatch'; END IF;
  SELECT jsonb_build_object(
    'tables',coalesce((SELECT jsonb_object_agg(c.relname,true) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r'),'{}'::jsonb),
    'columns',coalesce((SELECT jsonb_object_agg(c.relname||'.'||a.attname,jsonb_build_object('type',pg_catalog.format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,
      'default',CASE WHEN pg_catalog.pg_get_expr(d.adbin,d.adrelid) ~* '^(CURRENT_TIMESTAMP|TRUE|FALSE)$' THEN lower(pg_catalog.pg_get_expr(d.adbin,d.adrelid)) ELSE regexp_replace(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'::text$','') END,
      'identity',a.attidentity::text,'generated',a.attgenerated::text))
      FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='app' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),'{}'::jsonb),
    'indexes',coalesce((SELECT jsonb_object_agg(t.relname||'.'||c.relname,jsonb_build_object(
      'columns',ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num,position) JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num WHERE k.position<=i.indnkeyatts ORDER BY k.position),
      'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'immediate',i.indimmediate,'method',am.amname::text,
      'partial',i.indpred IS NOT NULL,'expression',i.indexprs IS NOT NULL,'nullsNotDistinct',coalesce((to_jsonb(i)->>'indnullsnotdistinct')::boolean,false),
      'keyCount',i.indnkeyatts::int,'columnCount',i.indnatts::int,'options',to_jsonb(i.indoption::smallint[])))
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace JOIN pg_catalog.pg_am am ON am.oid=c.relam
      WHERE n.nspname='app' AND t.relkind='r'),'{}'::jsonb),
    'constraints',coalesce((SELECT jsonb_object_agg(t.relname||'.'||c.conname,jsonb_build_object('kind',c.contype::text,
      'columns',ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,position) JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.position),
      'targetSchema',tn.nspname::text,'targetTable',tt.relname::text,'targetColumns',ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,position) JOIN pg_catalog.pg_attribute a ON a.attrelid=tt.oid AND a.attnum=k.num ORDER BY k.position),
      'deleteAction',CASE WHEN c.contype='f' THEN c.confdeltype::text ELSE NULL END,'updateAction',CASE WHEN c.contype='f' THEN c.confupdtype::text ELSE NULL END,
      'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred))
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
      LEFT JOIN pg_catalog.pg_class tt ON tt.oid=c.confrelid LEFT JOIN pg_catalog.pg_namespace tn ON tn.oid=tt.relnamespace WHERE n.nspname='app' AND t.relkind='r'),'{}'::jsonb)
  ) INTO actual;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Application schema metadata differs from the complete pinned Prisma source'; END IF;
  SELECT oid INTO runtime_oid FROM pg_catalog.pg_roles WHERE rolname='findme_runtime' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit;
  IF runtime_oid IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=runtime_oid) THEN RAISE EXCEPTION 'Runtime role is privileged or inherits another role'; END IF;
  SELECT oid INTO owner_oid FROM pg_catalog.pg_roles WHERE rolname='findme_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit;
  IF owner_oid IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=owner_oid)
    OR (SELECT nspowner FROM pg_catalog.pg_namespace WHERE nspname='app') IS DISTINCT FROM owner_oid THEN RAISE EXCEPTION 'Private owner/schema authority is wrong'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator') AND
      (pg_catalog.pg_has_role(oid,runtime_oid,'MEMBER') OR pg_catalog.pg_has_role(oid,owner_oid,'MEMBER'))) THEN RAISE EXCEPTION 'API role can assume private database authority'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole=owner_oid AND defaclnamespace=0 AND defaclobjtype='f') OR
    EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
      WHERE d.defaclrole=owner_oid AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname='app'))
      AND (a.grantee=0 OR a.grantee IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')))) THEN RAISE EXCEPTION 'Private owner default privileges expose future objects'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind NOT IN ('r','i'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app') THEN RAISE EXCEPTION 'Unexpected app view/sequence/function outside the source contract'; END IF;
  IF NOT pg_catalog.has_schema_privilege('findme_runtime','app','USAGE') OR pg_catalog.has_schema_privilege('findme_runtime','app','CREATE') OR pg_catalog.has_database_privilege('findme_runtime','postgres','CREATE') OR pg_catalog.has_schema_privilege('findme_runtime','public','CREATE') THEN RAISE EXCEPTION 'Runtime schema/database authority is wrong'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') AND pg_catalog.has_schema_privilege(r.oid,'app','USAGE')) THEN RAISE EXCEPTION 'API schema access must be absent'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND
    (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR c.relowner<>owner_oid OR
      NOT pg_catalog.has_table_privilege(runtime_oid,c.oid,'SELECT') OR NOT pg_catalog.has_table_privilege(runtime_oid,c.oid,'INSERT') OR
      NOT pg_catalog.has_table_privilege(runtime_oid,c.oid,'UPDATE') OR NOT pg_catalog.has_table_privilege(runtime_oid,c.oid,'DELETE') OR
      pg_catalog.has_table_privilege(runtime_oid,c.oid,'TRUNCATE,REFERENCES,TRIGGER') OR
      EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) OR
      (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)<>1 OR
      NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND p.polname='findme_server_runtime' AND p.polcmd='*' AND p.polpermissive AND p.polroles=ARRAY[runtime_oid]
        AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)='true' AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='true'))) THEN RAISE EXCEPTION 'Application table ownership/RLS/grants mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','qa') AND c.relkind='r' AND pg_catalog.has_table_privilege(runtime_oid,c.oid,'SELECT,INSERT,UPDATE,DELETE')) THEN RAISE EXCEPTION 'Runtime role has data access outside app'; END IF;
END
$bootstrap_verify$;
SELECT 'app' AS schema,${literal(marker)} AS source_marker,
  (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r') AS tables,
  (SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='findme_runtime') AS runtime_login;
`;
}

export function verifyBootstrapArtifacts(root, directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"));
  guardProductionBootstrap({ ...manifest, appEnv: "production" });
  const source = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  if (manifest.version !== VERSION || manifest.sourceSha256 !== sha256(source)
      || manifest.preflightSha256 !== sha256(readFileSync(path.join(directory, "preflight.sql")))
      || manifest.bootstrapSha256 !== sha256(readFileSync(path.join(directory, "bootstrap.sql")))
      || manifest.verificationSha256 !== sha256(readFileSync(path.join(directory, "verify.sql")))) throw Error("Production bootstrap source/artifact hash mismatch");
  return manifest;
}

function main(args) {
  const mode = args.shift(), flags = {};
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!['--project-ref','--schema','--app-env','--output'].includes(key) || !value || value.startsWith('--') || flags[key]) throw Error("Expected explicit production bootstrap arguments");
    flags[key] = value;
  }
  if (!['--prepare','--verify-artifacts'].includes(mode) || !flags['--output']) throw Error("Use --prepare or --verify-artifacts with explicit --project-ref --schema --app-env --output");
  const target = guardProductionBootstrap({ projectRef: flags['--project-ref'], schema: flags['--schema'], appEnv: flags['--app-env'] });
  const root = process.cwd(), output = path.resolve(root, flags['--output']);
  const allowed = path.join(root, "output", "production-bootstrap");
  if (output !== allowed && !output.startsWith(`${allowed}${path.sep}`)) throw Error("Bootstrap artifacts must remain inside output/production-bootstrap");
  let manifest;
  if (mode === '--verify-artifacts') manifest = verifyBootstrapArtifacts(root, output);
  else {
    const generated = generatePostgresDdl(root), ddl = qualifyBootstrapDdl(generated.ddl, generated.source);
    const prepared = prepareBootstrap({ ...target, sourceSha256: generated.sourceSha256, ddl });
    mkdirSync(output, { recursive: true });
    for (const [name, content] of [['preflight.sql',prepared.preflight],['bootstrap.sql',prepared.bootstrap],['verify.sql',prepared.verify],['manifest.json',`${JSON.stringify(prepared.manifest,null,2)}\n`]]) writeFileSync(path.join(output,name),content);
    manifest = verifyBootstrapArtifacts(root, output);
  }
  console.log(JSON.stringify({ preparedOnly: true, projectRef: manifest.projectRef, schema: manifest.schema, sourceSha256: manifest.sourceSha256,
    bootstrapSha256: manifest.bootstrapSha256, tables: manifest.tables, indexes: manifest.indexes, foreignKeys: manifest.foreignKeys }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : "Production bootstrap preparation failed"); process.exitCode = 1; }
}
