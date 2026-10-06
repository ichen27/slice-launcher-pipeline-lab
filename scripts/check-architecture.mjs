import ts from "typescript";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
const excluded = new Set([
  "node_modules",
  "dist",
  ".git",
  ".wrangler",
  ".vinext",
  ".next",
  "tests",
  "coverage",
  "test-results",
  "playwright-report",
]);
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    excluded.has(entry.name)
      ? []
      : entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.d\.ts$|\.test\./.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
  );
}
function owner(root, file) {
  return relative(root, file).split("/").slice(0, 2).join("/");
}
export function checkArchitecture(root) {
  root = resolve(ts.sys.realpath ? ts.sys.realpath(root) : root);
  const errors = [];
  const graph = new Map();
  const workspaces = new Map();
  for (const kind of ["apps", "packages"]) {
    const directory = join(root, kind);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const manifest = join(path, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      workspaces.set(pkg.name, { path, pkg });
      for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        const target = [...readdirSync(join(root, "apps"))].find((app) => {
          const manifest = join(root, "apps", app, "package.json");
          return (
            existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === dependency
          );
        });
        if (target && path !== join(root, "apps", target))
          errors.push(`${relative(root, manifest)}: cannot depend on app ${dependency}`);
      }
    }
  }
  const sources = [...files(join(root, "apps")), ...files(join(root, "packages"))];
  for (const file of sources) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const refs = [];
    const typeRefs = [];
    let opaque = false;
    let secretEnv = false;
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        const clause = node.importClause;
        const named = clause?.namedBindings ?? node.exportClause;
        const erasedSpecifiers =
          named &&
          (ts.isNamedImports(named) || ts.isNamedExports(named)) &&
          named.elements.length > 0 &&
          named.elements.every((element) => element.isTypeOnly) &&
          !clause?.name;
        const target = clause?.isTypeOnly || node.isTypeOnly || erasedSpecifiers ? typeRefs : refs;
        target.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]))
          refs.push(node.arguments[0].text);
        else opaque = true;
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(source) === "process" &&
        node.name.text === "env"
      )
        secretEnv = true;
      if (
        ts.isElementAccessExpression(node) &&
        node.expression.getText(source) === "process" &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === "env"
      )
        secretEnv = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    const client = source.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isStringLiteral(s.expression) &&
        s.expression.text === "use client",
    );
    const server =
      refs.some(
        (ref) => ref === "server-only" || ref === "cloudflare:workers" || ref.startsWith("node:"),
      ) ||
      /\/membership\/(auth|api|repository)\.ts$/.test(file) ||
      secretEnv;
    const configPath = ts.findConfigFile(dirname(file), ts.sys.fileExists);
    let options = { moduleResolution: ts.ModuleResolutionKind.Bundler };
    if (configPath) {
      const json = ts.readConfigFile(configPath, ts.sys.readFile);
      options = ts.parseJsonConfigFileContent(json.config, ts.sys, dirname(configPath)).options;
    }
    const edges = [];
    for (const ref of [...refs, ...typeRefs]) {
      let target = ts.resolveModuleName(ref, file, options, ts.sys).resolvedModule
        ?.resolvedFileName;
      if (!target) {
        const ws = [...workspaces.entries()].find(
          ([name]) => ref === name || ref.startsWith(name + "/"),
        );
        if (ws) {
          const [name, { path, pkg }] = ws;
          const suffix = ref.slice(name.length + 1);
          const entry =
            suffix || (typeof pkg.exports === "string" ? pkg.exports : pkg.main) || "src/index.ts";
          target = [
            join(path, entry),
            join(path, entry + ".ts"),
            join(path, entry + ".tsx"),
            join(path, entry, "index.ts"),
          ].find((p) => existsSync(p) && statSync(p).isFile());
        }
      }
      if (!target) continue;
      target = resolve(ts.sys.realpath ? ts.sys.realpath(target) : target);
      const fromOwner = owner(root, file),
        toOwner = owner(root, target);
      if (toOwner.startsWith("apps/") && fromOwner !== toOwner)
        errors.push(`${relative(root, file)}: cannot import another app's internals (${ref})`);
      if (target.includes("/tests/") || /\.test\.[cm]?[jt]sx?$/.test(target))
        errors.push(
          `${relative(root, file)}: production code cannot import test harness code (${ref})`,
        );
      if (refs.includes(ref) && !relative(root, target).startsWith("..")) edges.push(target);
    }
    graph.set(file, { client, server, opaque, edges });
  }
  for (const [file, node] of graph) {
    if (!node.client) continue;
    const seen = new Set();
    const traverse = (path, chain) => {
      if (seen.has(path)) return;
      seen.add(path);
      const next = graph.get(path);
      if (!next) return;
      if (next.server)
        errors.push(
          `${relative(root, file)}: client reaches server-only module ${relative(root, path)} via ${chain.map((p) => relative(root, p)).join(" -> ")}`,
        );
      if (next.opaque)
        errors.push(
          `${relative(root, file)}: client import graph contains a nonliteral dynamic import in ${relative(root, path)}`,
        );
      for (const edge of next.edges) traverse(edge, [...chain, edge]);
    };
    traverse(file, [file]);
  }
  return [...new Set(errors)];
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const errors = checkArchitecture(process.cwd());
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Application and client/server import boundaries passed.");
}
