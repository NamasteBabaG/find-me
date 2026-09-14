import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.name === "__tests__") return [];
    return entry.isDirectory() ? sources(full) : /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  });
}

const files = sources(path.join(root, "src"));
const slash = (value: string) => value.split(path.sep).join("/");

/** Literal static, dynamic and require imports. Runtime file provenance is
 * additionally checked by the existing artwork and build-tracing tests. */
function boundaryViolations(file: string, source: string) {
  const relative = slash(path.relative(root, file));
  return ts.preProcessFile(source, true, true).importedFiles.flatMap(({ fileName: specifier }) => {
    const resolved = specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
      : specifier.startsWith(".") ? slash(path.relative(root, path.resolve(path.dirname(file), specifier))) : specifier;
    const scratch = /^(?:work|scripts)(?:\/|$)/.test(resolved);
    const layer = relative.startsWith("src/domain/") && (
      /^(?:react|react-dom|next)(?:\/|$)|^@prisma\//.test(specifier)
      || /^src\/(?:services|infra|app|game|ui)(?:\/|$)/.test(resolved)
    );
    return scratch || layer ? [`${relative} -> ${specifier}`] : [];
  });
}

describe("production source boundaries", () => {
  it("keeps scripts/scratch outside the app and framework/infra outside the domain", () => {
    expect(files.flatMap(file => boundaryViolations(file, readFileSync(file, "utf8")))).toEqual([]);
  });

  it("catches regressions rather than relying on an empty inventory", () => {
    const file = path.join(root, "src/domain/example.ts");
    for (const source of [
      'import { x } from "../../scripts/old-experiment";',
      'const x = import("../../work/private-run/input");',
      'export { x } from "@/services/container";',
      'import type { PrismaClient } from "@prisma/client";',
      'const x = require("next/server");',
      'import { createRoot } from "react-dom/client";',
    ]) expect(boundaryViolations(file, source), source).toHaveLength(1);
    expect(boundaryViolations(file, 'import { z } from "zod"; import { x } from "./game/config";')).toEqual([]);
  });
});
