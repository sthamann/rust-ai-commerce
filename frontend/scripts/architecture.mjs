/** Enforce source ownership, bounded modules and acyclic runtime dependencies using TypeScript ASTs. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(root, process.argv[2] ?? "src");
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const files = walk(source).filter((f) => /\.(tsx?|css)$/.test(f));
const relative = (f) => path.relative(source, f).replaceAll("\\", "/");
const errors = [];
const edges = new Map();
const owners = ["admin", "storefront", "platform", "shared", "application"];
const owner = (f) => relative(f).split("/")[0];
const resolve = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  return [
    base,
    ...[".ts", ".tsx", ".css", ".js", "/index.ts", "/index.tsx"].map(
      (ext) => base + ext,
    ),
  ].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
};
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const limit = relative(file).startsWith("shared/i18n/") ? 700 : 400;
  if (text.split("\n").length - Number(text.endsWith("\n")) > limit)
    errors.push(
      `${relative(file)} exceeds ${limit} lines; split responsibility`,
    );
  if (!text.startsWith("/**") && !text.startsWith("/*"))
    errors.push(`${relative(file)} needs a leading responsibility comment`);
  if (path.dirname(file) === source && path.basename(file) !== "main.tsx")
    errors.push(`${relative(file)} belongs in a feature folder`);
  if (file.endsWith(".css")) continue;
  const ast = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const links = [];
  const add = (spec, runtime) => {
    if (!spec.startsWith(".")) return;
    const target = resolve(file, spec);
    if (!target) {
      errors.push(`${relative(file)} cannot resolve ${spec}`);
      return;
    }
    if (target === path.resolve(root, "../extensions/sdk/analytics.js")) return; // Explicit public SDK boundary, contract-tested separately.
    if (!target.startsWith(source + path.sep)) {
      errors.push(
        `${relative(file)} imports outside the source ownership tree: ${spec}`,
      );
      return;
    }
    const a = owner(file),
      b = owner(target);
    if (a === "shared" && owners.includes(b) && b !== "shared")
      errors.push(
        `${relative(file)} violates shared boundary via ${relative(target)}`,
      );
    if (
      ["admin", "storefront", "platform"].includes(a) &&
      owners.includes(b) &&
      a !== b &&
      b !== "shared"
    )
      errors.push(
        `${relative(file)} crosses application boundary via ${relative(target)}`,
      );
    if (runtime && !target.endsWith(".css")) links.push(target);
  };
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const runtime =
        !clause ||
        (!clause.isTypeOnly &&
          (!!clause.name ||
            !clause.namedBindings ||
            ts.isNamespaceImport(clause.namedBindings) ||
            clause.namedBindings.elements.some((e) => !e.isTypeOnly)));
      add(node.moduleSpecifier.text, runtime);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const runtime =
        !node.isTypeOnly &&
        (!node.exportClause ||
          !ts.isNamedExports(node.exportClause) ||
          node.exportClause.elements.some((e) => !e.isTypeOnly));
      add(node.moduleSpecifier.text, runtime);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node.arguments[0].text, true);
    else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      add(node.argument.literal.text, false);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  edges.set(file, links);
  if (!fs.existsSync(path.join(path.dirname(file), "README.md")))
    errors.push(`${relative(file)} has no folder contract (README.md)`);
}
const done = new Set(),
  stack = [];
function check(file) {
  if (stack.includes(file)) {
    errors.push(
      `Runtime import cycle: ${[...stack.slice(stack.indexOf(file)), file].map(relative).join(" -> ")}`,
    );
    return;
  }
  if (done.has(file)) return;
  stack.push(file);
  for (const target of edges.get(file) || []) check(target);
  stack.pop();
  done.add(file);
}
for (const file of edges.keys()) check(file);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `PASS ${files.length} frontend modules: ownership, resolved imports, runtime DAG, responsibility comments, folder contracts and size limits`,
);
