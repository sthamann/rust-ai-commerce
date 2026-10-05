/** Block new untranslated JSX text/labels and enforce complete EN/DE/FR/ES vocabularies; legacy debt is explicit. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, ".."),
  source = path.resolve(
    root,
    process.argv.includes("--source")
      ? process.argv[process.argv.indexOf("--source") + 1]
      : "src",
  );
const baselinePath = path.join(root, "scripts/localization-legacy.json");
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const found = [];
for (const file of walk(source).filter((f) => f.endsWith(".tsx"))) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const record = (node, text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (
      /[A-Za-z\u00c0-\u024f]/u.test(normalized) &&
      !/^\s*(?:AI|ISO|US|MCP|UCP|EUR|USD|API|SDK|JSON|EN|DE|FR|ES|IT|×|·|↗|\s)+\s*$/u.test(
        normalized,
      )
    ) {
      found.push({
        file: path.relative(source, file).replaceAll("\\", "/"),
        text: normalized,
      });
    }
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) record(node, node.text);
    if (
      ts.isJsxAttribute(node) &&
      ["aria-label", "placeholder", "title", "alt"].includes(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      record(node, node.initializer.text);
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteral(node.expression)
    )
      record(node, node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
for (const file of walk(source).filter((f) => /i18n\.ts$/.test(f))) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isArrayLiteralExpression(node.initializer) &&
      node.initializer.elements.every(ts.isStringLiteral)
    ) {
      if (
        node.initializer.elements.length !== 4 ||
        node.initializer.elements.some((v) => !v.text.trim())
      )
        throw Error(
          `${path.relative(source, file)}: vocabulary ${node.name.getText(ast)} needs nonempty EN/DE/FR/ES values`,
        );
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const key = (v) => `${v.file}\u0000${v.text}`;
if (process.argv.includes("--record-legacy")) {
  fs.writeFileSync(baselinePath, JSON.stringify(found, null, 2) + "\n");
  console.log(
    `Recorded ${found.length} existing untranslated literals; CI never regenerates this inventory.`,
  );
  process.exit(0);
}
const baseline = new Set(
  JSON.parse(fs.readFileSync(baselinePath, "utf8")).map(key),
);
const errors = found.filter((v) => !baseline.has(key(v)));
if (errors.length) {
  console.error(
    errors
      .map(
        (v) => `${v.file}: untranslated UI literal ${JSON.stringify(v.text)}`,
      )
      .join("\n"),
  );
  process.exit(1);
}
const geography = JSON.parse(
  fs.readFileSync(path.join(root, "../fixtures/geography.json"), "utf8"),
);
if (
  geography.filter((c) => c.isoAssigned).length !== 249 ||
  new Set(geography.map((c) => c.code)).size !== geography.length
)
  throw Error("World catalogue ISO coverage drift");
for (const c of geography) {
  for (const entity of [c, ...c.states])
    for (const l of ["en", "de", "es"])
      if (!entity.name[l]?.trim())
        throw Error(`${entity.code}: missing ${l} country/region label`);
}
const settings = JSON.parse(
  fs.readFileSync(path.join(root, "../fixtures/demo-settings.json"), "utf8"),
);
for (const record of [
  ...settings.taxes,
  ...settings.shipping,
  ...settings.payments,
])
  for (const l of ["en", "de", "es"])
    if (!record.translations[l]?.name?.trim())
      throw Error(`${record.id}: missing ${l} default label`);
console.log(
  `PASS no new untranslated UI literals; ${geography.length} countries and bundled methods/classes localized EN/DE/ES. ${found.length} legacy literals remain tracked explicitly.`,
);
