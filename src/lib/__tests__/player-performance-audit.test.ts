import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

const auditScript = path.resolve(__dirname, "../../../scripts/audit-player-performance.mjs");
const temporaryRoot = realpathSync(tmpdir());
const fixturePrefix = "findme-player-performance-audit-";
const fixtures: string[] = [];
const manifests = ["content/adventures/wizard-refresh-art.json", "content/adventures/wizard-kingdom-art.json"];
const chunks = { shared: "static/chunks/shared.js", player: "static/chunks/play.js", css: "static/css/player.css" };
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    const resolved = realpathSync(fixture);
    // Every recursive removal is confined to a freshly allocated direct child
    // of the real temporary directory, with this test's exclusive prefix.
    if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith(fixturePrefix)) {
      throw new Error("Refusing to remove an unexpected performance-audit fixture path");
    }
    rmSync(resolved, { recursive: true, force: true });
  }
});

function writeFixtureFile(root: string, relative: string, bytes: string | Buffer) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
function writeBuildManifest(root: string, playerFiles: string[] = [chunks.shared, chunks.player, chunks.css]) {
  writeFixtureFile(root, ".next/app-build-manifest.json", JSON.stringify({ pages: {
    "/layout": [chunks.shared, chunks.css],
    "/play/[token]/page": playerFiles,
  } }));
}
async function fixture() {
  const root = mkdtempSync(path.join(temporaryRoot, fixturePrefix));
  fixtures.push(root);
  writeFixtureFile(root, `.next/${chunks.shared}`, "globalThis.syntheticLayout = true;\n");
  writeFixtureFile(root, `.next/${chunks.player}`, "globalThis.syntheticPlayer = true;\n");
  writeFixtureFile(root, `.next/${chunks.css}`, ".synthetic-player { display: block; }\n");
  writeBuildManifest(root);
  // Eighteen distinct safe public paths, each holding the same synthetic 1px
  // WebP. No large scene pixels, real manifests, env files or DB are loaded.
  const image = await sharp(Buffer.from([20, 40, 60]), { raw: { width: 1, height: 1, channels: 3 } }).webp({ lossless: true }).toBuffer();
  const paths: string[] = [];
  for (const [world, manifest] of manifests.entries()) {
    const rows = Array.from({ length: 9 }, (_, board) => {
      const relative = `public/scenes/synthetic-world-${world}-board-${board}/base.webp`;
      writeFixtureFile(root, relative, image);
      paths.push(relative);
      return { path: relative, sha256: sha256(image) };
    });
    writeFixtureFile(root, manifest, JSON.stringify(rows));
  }
  return { root, image, paths };
}
function audit(root: string) {
  // Run the real executable against only this synthetic working directory.
  // Its module imports resolve from the reviewed script in the checkout.
  return spawnSync(process.execPath, [auditScript], {
    cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { NODE_ENV: "test", ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}) },
  });
}
interface Report {
  status: "pass" | "blocked";
  initial: { js: { files: number; bytes: number; gzipBytes: number }; css: { files: number; gzipBytes: number } };
  budgets: { initialJsGzipBytes: number; initialCssGzipBytes: number };
  bundles: { path: string }[];
  worlds: { encodedBytes: number; boards: { width: number; height: number; encodedBytes: number; decodedRgbaBytes: number }[] }[];
  problems: string[];
}

describe("player production performance audit", () => {
  it("accepts a completed player build, deduplicates shared bundles and inspects all eighteen frozen WebPs", async () => {
    const data = await fixture();
    const result = audit(data.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as Report;
    expect(report.status).toBe("pass");
    expect(report.problems).toEqual([]);
    expect(report.initial.js.files).toBe(2);
    expect(report.initial.css.files).toBe(1);
    expect(report.bundles.map(bundle => bundle.path).sort()).toEqual(Object.values(chunks).sort());
    expect(report.worlds).toHaveLength(2);
    for (const world of report.worlds) {
      expect(world.boards).toHaveLength(9);
      expect(world.encodedBytes).toBe(data.image.length * 9);
      for (const board of world.boards) expect(board).toMatchObject({ width: 1, height: 1, encodedBytes: data.image.length, decodedRgbaBytes: 4 });
    }
  });

  it("blocks an initial JavaScript chunk whose compressed bytes exceed the player budget", async () => {
    const data = await fixture();
    // A valid JS comment with high-entropy payload: raw text size alone cannot
    // stand in for compressed delivery size, and repeated padding compresses.
    writeFixtureFile(data.root, `.next/${chunks.player}`, `/*${randomBytes(400_000).toString("base64")}*/\n`);
    const result = audit(data.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    const report = JSON.parse(result.stdout) as Report;
    expect(report.status).toBe("blocked");
    expect(report.initial.js.gzipBytes).toBeGreaterThan(report.budgets.initialJsGzipBytes);
    expect(report.problems).toContain("initial player JS gzip budget exceeded");
  });

  it("blocks an initial stylesheet whose compressed bytes exceed the player budget", async () => {
    const data = await fixture();
    writeFixtureFile(data.root, `.next/${chunks.css}`, `/*${randomBytes(100_000).toString("base64")}*/\n`);
    const result = audit(data.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    const report = JSON.parse(result.stdout) as Report;
    expect(report.initial.css.gzipBytes).toBeGreaterThan(report.budgets.initialCssGzipBytes);
    expect(report.problems).toContain("initial player CSS gzip budget exceeded");
  });

  it.each([
    "static/chunks/../escaped.js",
    "static/chunks/%2e%2e/escaped.js",
    "static\\chunks\\..\\escaped.js",
    "../escaped.js",
  ])("rejects unsafe manifest chunk path %j before inspecting outside bundles", async unsafe => {
    const data = await fixture();
    // The escaped files exist inside our own fixture, so a broken path guard
    // cannot accidentally pass this test by failing a later missing-file read.
    writeFixtureFile(data.root, ".next/static/escaped.js", "globalThis.syntheticEscape = true;\n");
    writeFixtureFile(data.root, "escaped.js", "globalThis.syntheticEscape = true;\n");
    writeBuildManifest(data.root, [unsafe]);
    const result = audit(data.root);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected player bundle path");
  });

  it("rejects changed frozen image bytes even when they still form a valid small WebP", async () => {
    const data = await fixture();
    const changed = await sharp(Buffer.from([60, 40, 20]), { raw: { width: 1, height: 1, channels: 3 } }).webp({ lossless: true }).toBuffer();
    expect(sha256(changed)).not.toBe(sha256(data.image));
    const firstPath = data.paths[0]!;
    writeFixtureFile(data.root, firstPath, changed);
    // The catalog still carries the original frozen image hash.
    const originalRows = JSON.parse(readFileSync(path.join(data.root, manifests[0]!), "utf8")) as { sha256: string }[];
    expect(originalRows[0]!.sha256).toBe(sha256(data.image));
    const result = audit(data.root);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Frozen public board changed");
  });
});
