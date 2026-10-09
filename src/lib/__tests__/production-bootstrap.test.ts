import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const moduleUrl = pathToFileURL(path.join(root, "scripts/production-bootstrap.mjs")).href;
const target = { projectRef: "pazdlpginuhnobeedzyn", schema: "app", appEnv: "production" };
const source = `model User {\n id String @id\n email String @unique\n}\nmodel Game {\n id String @id\n ownerId String?\n}`;
const ddl = `CREATE SCHEMA IF NOT EXISTS "app";
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bytes" BYTEA,
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
`;
function run(code: string, input: unknown = null, cwd = root) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", `import * as bootstrap from ${JSON.stringify(moduleUrl)}; const input=JSON.parse(process.argv[1]); ${code}`, JSON.stringify(input)], {
    cwd, encoding: "utf8", timeout: 15_000, windowsHide: true,
    env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      DATABASE_URL: "invalid-test-no-network", APP_ENV: "qa", PRIVATE_CANARY: "synthetic-must-not-print" },
  });
}
function successful(code: string, input: unknown = null) {
  const result = run(code, input);
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toContain("synthetic-must-not-print");
  return JSON.parse(result.stdout);
}

describe("offline production bootstrap", () => {
  it("imports without reading a local environment/project or opening a DB", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "findme-bootstrap-import-test-"));
    const result = run("console.log(JSON.stringify(bootstrap.guardProductionBootstrap(input)))", target, scratch);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(target);
  });

  it.each([
    { ...target, projectRef: "vvqjmaubdjndmjvcfxve" },
    { ...target, projectRef: undefined },
    { ...target, schema: "public" },
    { ...target, schema: "qa" },
    { ...target, schema: "app;DROP SCHEMA qa" },
    { ...target, appEnv: "qa" },
  ])("refuses an unapproved or inferred target: %j", changed => {
    const result = run("bootstrap.guardProductionBootstrap(input)", changed);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  it("qualifies every table, index and FK and preserves metadata relevant to deletion", () => {
    const result = successful("const ddl=bootstrap.qualifyBootstrapDdl(input.ddl,input.source); console.log(JSON.stringify({ddl,metadata:bootstrap.bootstrapMetadata(ddl)}))", { ddl, source });
    expect(result.ddl).toContain('CREATE TABLE "app"."User"');
    expect(result.ddl).toContain('ON "app"."User"("email")');
    expect(result.ddl).toContain('REFERENCES "app"."User"("id") ON DELETE SET NULL');
    expect(result.ddl).not.toContain("CREATE SCHEMA");
    expect(result.metadata.columns["Game.bytes"]).toEqual({ type: "bytea", nullable: true, default: null, identity: "", generated: "" });
    expect(result.metadata.columns["Game.createdAt"].default).toBe("current_timestamp");
    expect(result.metadata.constraints["Game.Game_ownerId_fkey"]).toMatchObject({ targetSchema: "app", deleteAction: "n", updateAction: "c", targetColumns: ["id"] });
    expect(result.metadata.indexes["User.User_email_key"]).toMatchObject({ unique: true, columns: ["email"], primary: false });
  });

  it.each([
    ["missing current model", ddl.replace(/CREATE TABLE "Game" \([\s\S]*?\);/, "")],
    ["additional unexpected model", `${ddl}\nCREATE TABLE "Extra" (\n "id" TEXT NOT NULL,\n CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")\n);`],
    ["customer copying", `${ddl}\nCOPY "qa"."User" TO STDOUT;`],
    ["destructive SQL", `${ddl}\nDROP SCHEMA "qa" CASCADE;`],
    ["other namespace", ddl.replace('CREATE TABLE "User"', 'CREATE TABLE "qa"."User"')],
    ["future unreviewed sequences", `${ddl}\nCREATE SEQUENCE "app"."sequence";`],
  ])("fails closed for %s", (_, changed) => {
    expect(run("bootstrap.qualifyBootstrapDdl(input.ddl,input.source)", { ddl: changed, source }).status).not.toBe(0);
  });

  it("keeps administrative and runtime roles separate, grants only server CRUD and verifies complete metadata", () => {
    const result = successful("const ddl=bootstrap.qualifyBootstrapDdl(input.ddl,input.source); console.log(JSON.stringify(bootstrap.prepareBootstrap({...input.target,ddl,sourceSha256:'a'.repeat(64)})))", { ddl, source, target });
    expect(result.bootstrap).toContain('CREATE ROLE "findme_owner" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    expect(result.bootstrap).toContain('CREATE ROLE "findme_runtime" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
    expect(result.bootstrap).toContain('SET LOCAL ROLE "findme_owner"');
    expect(result.bootstrap).not.toContain('WITH ADMIN OPTION');
    expect(result.bootstrap).toContain("IF NOT pg_catalog.pg_has_role(current_user,'findme_owner','SET') THEN");
    expect(result.bootstrap).toContain('GRANT "findme_owner" TO "postgres" WITH SET TRUE');
    expect(result.bootstrap).toContain("IF NOT pg_catalog.pg_has_role(current_user,'findme_runtime','SET') THEN");
    expect(result.bootstrap).toContain('GRANT "findme_runtime" TO "postgres" WITH SET TRUE');
    expect(result.bootstrap).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE "findme_owner" REVOKE EXECUTE');
    expect(result.bootstrap).not.toContain('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres"');
    expect(result.bootstrap).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "app" TO "findme_runtime"');
    expect(result.bootstrap).not.toMatch(/PASSWORD|GRANT ALL|TO anon|TO authenticated/);
    for (const table of ["User", "Game"]) {
      expect(result.bootstrap).toContain(`ALTER TABLE "app"."${table}" FORCE ROW LEVEL SECURITY`);
      expect(result.bootstrap).toContain(`ON "app"."${table}" FOR ALL TO "findme_runtime" USING (true) WITH CHECK (true)`);
    }
    expect(result.preflight).toContain("Fresh bootstrap refuses an existing app schema");
    expect(result.preflight).toContain("Fresh bootstrap refuses an existing owner role");
    expect(result.verify).toContain("Application schema metadata differs from the complete pinned Prisma source");
    expect(result.verify).toContain("Private owner default privileges expose future objects");
    expect(result.verify).toContain("Runtime role has data access outside app");
    expect(result.verify).toContain("API role can assume private database authority");
    expect(result.verify).not.toContain("rolpassword");
    expect(result.manifest).toMatchObject({ projectRef: target.projectRef, schema: "app", runtimeRole: "findme_runtime", ownerRole: "findme_owner", tables: 2, indexes: 3, primaryKeys: 2, foreignKeys: 1 });
  });

  it("generates the complete current schema offline without rewriting Prisma source/client", () => {
    const original = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
    const result = successful("const generated=bootstrap.generatePostgresDdl(); const ddl=bootstrap.qualifyBootstrapDdl(generated.ddl,generated.source); const prepared=bootstrap.prepareBootstrap({...input,ddl,sourceSha256:generated.sourceSha256}); console.log(JSON.stringify(prepared.manifest))", target);
    const models = [...original.matchAll(/^model\s+(\w+)\s*\{/gm)].map(row => row[1]);
    expect(Object.keys(result.metadata.tables).sort()).toEqual(models.sort());
    expect(result.tables).toBe(26);
    expect(result.columns).toBe(230);
    expect(result.indexes).toBe(63);
    expect(result.foreignKeys).toBe(26);
    expect(result.metadata.constraints["GuestParticipant.GuestParticipant_shareId_fkey"].deleteAction).toBe("c");
    expect(result.metadata.columns["FileBlob.data"].type).toBe("bytea");
    expect(result.metadata.indexes["Order.Order_checkoutKey_key"].unique).toBe(true);
    expect(readFileSync(path.join(root, "prisma/schema.prisma"), "utf8")).toBe(original);
  });

  it("refuses tampering with each reviewed SQL file, including the separate preflight", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "findme-bootstrap-artifact-test-"));
    const output = path.join(scratch, "output/production-bootstrap/test");
    const result = successful("const {mkdirSync,writeFileSync}=await import('node:fs'); const generated=bootstrap.generatePostgresDdl(); const ddl=bootstrap.qualifyBootstrapDdl(generated.ddl,generated.source); const prepared=bootstrap.prepareBootstrap({...input.target,ddl,sourceSha256:generated.sourceSha256}); mkdirSync(input.output,{recursive:true}); writeFileSync(input.output+'/preflight.sql',prepared.preflight); writeFileSync(input.output+'/bootstrap.sql',prepared.bootstrap); writeFileSync(input.output+'/verify.sql',prepared.verify); writeFileSync(input.output+'/manifest.json',JSON.stringify(prepared.manifest)); console.log(JSON.stringify(bootstrap.verifyBootstrapArtifacts(process.cwd(),input.output).sourceSha256))", { target, output });
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    for (const file of ["preflight.sql", "bootstrap.sql", "verify.sql"]) {
      const filePath = path.join(output, file), original = readFileSync(filePath, "utf8");
      writeFileSync(filePath, "-- corrupted-review-artifact");
      const changed = run("bootstrap.verifyBootstrapArtifacts(process.cwd(),input)", output);
      expect(changed.status, file).not.toBe(0);
      expect(changed.stderr, file).toContain("source/artifact hash mismatch");
      writeFileSync(filePath, original);
    }
    const intact = run("console.log(JSON.stringify(bootstrap.verifyBootstrapArtifacts(process.cwd(),input).sourceSha256))", output);
    expect(intact.status, intact.stderr).toBe(0);
  });
});
