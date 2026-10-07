/** Reject untranslated rendered copy and incomplete/interpolation-incompatible catalogues; identifiers remain stable. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  renderedLiterals,
  checkValues,
  localResolver,
} from "./localization-syntax.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  source = path.resolve(
    root,
    process.argv.includes("--source")
      ? process.argv[process.argv.indexOf("--source") + 1]
      : "src",
  );
const tokens = new Set(
  JSON.parse(
    fs.readFileSync(
      path.join(root, "scripts/localization-tokens.json"),
      "utf8",
    ),
  ).map((v) => v.text),
);
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
  const resolve = localResolver(ast);
  const record = (node, text) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (
      /\p{L}/u.test(normalized) &&
      !tokens.has(normalized) &&
      !tokens.has(normalized.replace(/^[\s·/]+|[\s·/]+$/g, ""))
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
      [
        "aria-label",
        "placeholder",
        "title",
        "alt",
        "label",
        "heading",
        "description",
        "emptyText",
        "message",
        "caption",
        "confirmLabel",
      ].includes(node.name.text) &&
      node.initializer
    ) {
      if (ts.isStringLiteral(node.initializer))
        record(node, node.initializer.text);
      else if (ts.isJsxExpression(node.initializer))
        renderedLiterals(node.initializer.expression, record, resolve);
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      !ts.isJsxAttribute(node.parent)
    )
      renderedLiterals(node.expression, record, resolve);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "map"
    ) {
      const callback = node.arguments[0];
      if (
        callback &&
        ts.isArrowFunction(callback) &&
        callback.parameters[0] &&
        /^(?:l|lang|locale|language)$/i.test(
          callback.parameters[0].name.getText(ast),
        )
      ) {
        const parameter = callback.parameters[0].name.getText(ast);
        let localeField = false;
        const inspect = (child) => {
          if (
            ts.isJsxAttribute(child) &&
            child.name.text === "value" &&
            child.initializer?.getText(ast).includes(`[${parameter}]`)
          )
            localeField = true;
          ts.forEachChild(child, inspect);
        };
        inspect(callback.body);
        if (localeField)
          throw Error(
            `${path.relative(source, file)}: stacked language fields prohibited; use ContentLanguage and LocalizedField`,
          );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
for (const file of walk(source).filter(
  (f) => /i18n\.ts$|i18n\/(?:locales|automation-)/.test(f) && f.endsWith(".ts"),
)) {
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
      checkValues(
        node.initializer.elements.map((v) => v.text),
        `${path.relative(source, file)}:${node.name.getText(ast)}`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
const errors = found;
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
    for (const l of ["en", "de", "fr", "es"])
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
  for (const l of ["en", "de", "fr", "es"])
    if (!record.translations[l]?.name?.trim())
      throw Error(`${record.id}: missing ${l} default label`);
console.log(
  `PASS no untranslated rendered UI literals; ${geography.length} countries and bundled methods/classes localized EN/DE/FR/ES. catalogue placeholders verified.`,
);
