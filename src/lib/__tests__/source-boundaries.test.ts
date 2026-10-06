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

type ImportEdge = { specifier: string; resolved: string; importedNames: string[] | null };
function resolveImport(file: string, specifier: string) {
  return (specifier.startsWith("@/") ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".") ? slash(path.relative(root, path.resolve(path.dirname(file), specifier))) : specifier).replace(/\.tsx?$/, "");
}
function moduleSyntax(file: string, source: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}
function hasDirective(syntax: ts.SourceFile, directive: string) {
  for (const statement of syntax.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
}
function importEdges(file: string, syntax: ts.SourceFile): ImportEdge[] {
  const edges: ImportEdge[] = [];
  function visit(node: ts.Node) {
    let literal: ts.StringLiteralLike | undefined;
    let importedNames: string[] | null = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      literal = node.moduleSpecifier;
      const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined;
      if (bindings && ts.isNamedImports(bindings) && ts.isImportDeclaration(node) && !node.importClause?.name)
        importedNames = bindings.elements.map(item => (item.propertyName ?? item.name).text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")
      && ts.isStringLiteralLike(node.arguments[0]!)) literal = node.arguments[0]!;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) literal = node.argument.literal;
    if (literal) edges.push({ specifier: literal.text, resolved: resolveImport(file, literal.text), importedNames });
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return edges;
}

/** Historical pure pixel helpers are fingerprinted by retained pilot/probe
 * evidence. Do not move their implementations merely to change a folder name.
 * These are exact symbols, not permission to import the service's use cases. */
const infraPureHelperExceptions = [
  { file: "src/infra/db/board-conditioned-checkpoints.ts", target: "src/services/generation/fixed-sprite", names: ["sha256Bytes"] },
  { file: "src/infra/generation/board-pose-observer.ts", target: "src/services/generation/fixed-sprite", names: ["sha256Rgba"] },
  { file: "src/infra/generation/board-pose-observer.ts", target: "src/services/generation/standing-pixels", names: ["resolveStandingPixel"] },
  { file: "src/infra/generation/pose-observer.ts", target: "src/services/generation/fixed-sprite", names: ["sha256Rgba"] },
] as const;

function allowedPureHelper(relative: string, edge: ImportEdge) {
  return infraPureHelperExceptions.some(rule => rule.file === relative && rule.target === edge.resolved && edge.importedNames !== null
    && edge.importedNames.length > 0 && edge.importedNames.every(name => (rule.names as readonly string[]).includes(name)));
}

/** Literal static, dynamic and require imports. Runtime file provenance is
 * additionally checked by the existing artwork and build-tracing tests. */
function boundaryViolations(file: string, source: string) {
  const relative = slash(path.relative(root, file));
  const syntax = moduleSyntax(file, source);
  const client = hasDirective(syntax, "use client");
  return importEdges(file, syntax).flatMap(edge => {
    const { specifier, resolved } = edge;
    const scratch = /^(?:work|scripts)(?:\/|$)/.test(resolved);
    const layer = relative.startsWith("src/domain/") && (
      /^(?:react|react-dom|next)(?:\/|$)|^@prisma\//.test(specifier)
      || /^src\/(?:services|infra|app|game|ui)(?:\/|$)/.test(resolved)
    );
    const reversedInfra = relative.startsWith("src/infra/") && /^src\/(?:services|app|game|ui)(?:\/|$)/.test(resolved)
      && !allowedPureHelper(relative, edge);
    const clientServer = client && /^src\/lib\/server(?:\/|$)/.test(resolved);
    return scratch || layer || reversedInfra || clientServer ? [`${relative} -> ${specifier}`] : [];
  });
}

function serverReaderExports(file: string, source: string) {
  const syntax = moduleSyntax(file, source);
  if (!hasDirective(syntax, "use server")) return [];
  const readers = new Set<string>();
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)
      || !/^src\/lib\/server(?:\/|$)/.test(resolveImport(file, statement.moduleSpecifier.text))) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) readers.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) readers.add(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) for (const name of bindings.elements) if (!name.isTypeOnly) readers.add(name.name.text);
  }
  return syntax.statements.flatMap(statement => {
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
        && /^src\/lib\/server(?:\/|$)/.test(resolveImport(file, statement.moduleSpecifier.text))) return ["server helper re-export"];
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) return statement.exportClause.elements
        .filter(item => !item.isTypeOnly && readers.has((item.propertyName ?? item.name).text)).map(item => `server reader export: ${item.name.text}`);
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === "currentDraft"
      && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return ["draft reader exported as a server action"];
    return [];
  });
}

/** Per-request transports need the exact world ledger, receipt sink and pinned
 * policy passed by their use case. These existing injected factories are not
 * alternate environment-wide provider selection; keep their scope explicit. */
const scopedProviderFactories = [
  { file: "src/services/generation/board-conditioned-qa-job.ts", provider: "BudgetedOpenAiFixedSourceProvider", module: "src/infra/generation/openai-fixed-source" },
  { file: "src/services/generation/board-conditioned-qa-job.ts", provider: "BudgetedBoardPoseObserver", module: "src/infra/generation/board-pose-observer" },
  { file: "src/services/generation/board-conditioned-wizard.ts", provider: "BudgetedOpenAiFixedSourceProvider", module: "src/infra/generation/openai-fixed-source" },
  { file: "src/services/generation/board-conditioned-wizard.ts", provider: "BudgetedBoardPoseObserver", module: "src/infra/generation/board-pose-observer" },
  { file: "src/services/generation/board-wizard-identity-gate.ts", provider: "OpenAiIdentityStyleReviewer", module: "src/infra/generation/identity-style-reviewer" },
  { file: "src/services/generation/board-wizard-visual-judge.ts", provider: "OpenAiPatchJudge", module: "src/infra/generation/judge" },
] as const;

function providerConstructions(file: string, source: string) {
  const syntax = moduleSyntax(file, source);
  const imports = new Map<string, { module: string; provider: string | null }>();
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const module = resolveImport(file, statement.moduleSpecifier.text);
    if (!module.startsWith("src/infra/")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { module, provider: null });
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
      if (!item.isTypeOnly) imports.set(item.name.text, { module, provider: (item.propertyName ?? item.name).text });
    }
  }
  const constructions: { module: string; provider: string }[] = [];
  function visit(node: ts.Node) {
    if (ts.isNewExpression(node)) {
      const expression = node.expression;
      const imported = ts.isIdentifier(expression) ? imports.get(expression.text)
        : ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) ? imports.get(expression.expression.text) : undefined;
      const provider = imported?.provider ?? (ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined);
      if (imported && provider && /^(?:(?:Budgeted)?OpenAi|BudgetedBoardPoseObserver$|MockPaymentProvider$|PayMeProvider$|ResendEmailProvider$|ConsoleEmailProvider$)/.test(provider))
        constructions.push({ module: imported.module, provider });
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return constructions;
}

function providerConstructionViolations(file: string, source: string) {
  const relative = slash(path.relative(root, file));
  // Adapters may compose transports internally; request/environment selection
  // in application code belongs to the composition root or a listed factory.
  if (relative === "src/services/container.ts" || relative.startsWith("src/infra/")) return [];
  return providerConstructions(file, source).filter(item => !scopedProviderFactories.some(rule => rule.file === relative
    && rule.provider === item.provider && rule.module === item.module)).map(item => `${relative} -> new ${item.provider} (${item.module})`);
}

describe("production source boundaries", () => {
  it("keeps runtime imports in their layers and server readers outside client/action APIs", () => {
    expect(files.flatMap(file => boundaryViolations(file, readFileSync(file, "utf8")))).toEqual([]);
    expect(files.flatMap(file => serverReaderExports(file, readFileSync(file, "utf8")).map(message => `${slash(path.relative(root, file))}: ${message}`))).toEqual([]);
    expect(files.flatMap(file => providerConstructionViolations(file, readFileSync(file, "utf8")))).toEqual([]);
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

  it("blocks reversed infra dependencies including type, dynamic and require imports", () => {
    const file = path.join(root, "src/infra/db/example.ts");
    for (const source of [
      'import { WorldBudget } from "@/services/generation/world-budget";',
      'import type { RetainedPurchaseStore } from "../../services/generation/paid-operation";',
      'export { x } from "@/services/container";',
      'const x = import("@/services/generation/pipeline");',
      'const x = require("@/app/create/actions");',
      'type X = import("@/services/container").Container;',
    ]) expect(boundaryViolations(file, source), source).toHaveLength(1);
    expect(boundaryViolations(file, 'import { WorldBudget } from "@/domain/generation/world-budget"; import type { BoardMeasurement } from "../generation/board-checkpoint-types";')).toEqual([]);
  });

  it("limits historical helper exceptions to their existing symbols and keeps them live", () => {
    for (const rule of infraPureHelperExceptions) {
      const file = path.join(root, rule.file);
      const edges = importEdges(file, moduleSyntax(file, readFileSync(file, "utf8")));
      expect(edges.filter(edge => edge.resolved === rule.target && allowedPureHelper(rule.file, edge)), rule.file).toHaveLength(1);
      const module = `@/${rule.target.slice(4)}`;
      expect(boundaryViolations(file, `import { ${rule.names.join(", ")} } from "${module}";`)).toEqual([]);
      for (const source of [
        `import { ${rule.names.join(", ")}, generateBoardConditionedAppearances } from "${module}";`,
        `import * as helper from "${module}";`,
        `export { ${rule.names.join(", ")} } from "${module}";`,
        `const helper = import("${module}");`,
        `const helper = require("${module}");`,
      ]) expect(boundaryViolations(file, source), source).toHaveLength(1);
    }
  });

  it("keeps server-only readers off the client even when aliased or type imported", () => {
    const file = path.join(root, "src/app/create/example.tsx");
    for (const source of [
      '"use client"; import { currentDraft } from "@/lib/server/current-draft";',
      '/* comment */ "use client"; import type { X } from "../../lib/server/current-draft";',
      '"use strict"; "use client"; const x = import("@/lib/server/current-draft");',
      '"use client"; const x = require("@/lib/server/current-draft");',
    ]) expect(boundaryViolations(file, source), source).toHaveLength(1);
    expect(boundaryViolations(file, 'import { currentDraft } from "@/lib/server/current-draft";')).toEqual([]);
  });

  it("permits internal reader use in actions but blocks direct reader re-exports", () => {
    const file = path.join(root, "src/app/create/actions.ts");
    expect(serverReaderExports(file, '"use server"; import { currentDraft } from "@/lib/server/current-draft"; export async function saveNameAction() { return currentDraft(); }')).toEqual([]);
    for (const source of [
      '"use server"; export { currentDraft } from "@/lib/server/current-draft";',
      '"use server"; export * from "@/lib/server/current-draft";',
      '"use server"; import { currentDraft as read } from "@/lib/server/current-draft"; export { read as currentDraft };',
      '"use server"; export async function currentDraft() {}',
    ]) expect(serverReaderExports(file, source), source).toHaveLength(1);
  });

  it("keeps environment-wide provider choices in the composition root and catches aliases", () => {
    const file = path.join(root, "src/services/example.ts");
    for (const source of [
      'import { OpenAiAvatarProvider } from "@/infra/generation/openai"; new OpenAiAvatarProvider("synthetic-never-live");',
      'import { OpenAiAvatarProvider as Painter } from "../infra/generation/openai"; new Painter("synthetic-never-live");',
      'import * as adapters from "@/infra/generation/openai"; new adapters.OpenAiAvatarProvider("synthetic-never-live");',
      'import { PayMeProvider } from "@/infra/payment/payme"; new PayMeProvider("synthetic", "synthetic");',
      'import { ResendEmailProvider } from "@/infra/email/resend"; new ResendEmailProvider("synthetic", "synthetic");',
    ]) {
      expect(providerConstructionViolations(file, source), source).toHaveLength(1);
      expect(providerConstructionViolations(path.join(root, "src/services/container.ts"), source)).toEqual([]);
    }
    expect(providerConstructionViolations(file, 'import type { AvatarProvider } from "@/infra/generation/types";')).toEqual([]);
  });

  it("keeps per-request factory exceptions exact and prevents their inventory growing silently", () => {
    for (const rule of scopedProviderFactories) {
      const file = path.join(root, rule.file);
      const constructions = providerConstructions(file, readFileSync(file, "utf8"));
      expect(constructions.filter(item => item.provider === rule.provider && item.module === rule.module), rule.file).toHaveLength(1);
      const source = `import { ${rule.provider} } from "@/${rule.module.slice(4)}"; new ${rule.provider}();`;
      expect(providerConstructionViolations(file, source)).toEqual([]);
      expect(providerConstructionViolations(path.join(root, "src/services/example.ts"), source)).toHaveLength(1);
    }
  });
});
