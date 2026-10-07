/** Export existing typed catalogues for translators; validate an entire import before changing string literals only. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { checkValues } from "./localization-syntax.mjs";
const languages = ["en", "de", "fr", "es"];
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const unwrap = (n) =>
  ts.isAsExpression(n) || ts.isSatisfiesExpression(n)
    ? unwrap(n.expression)
    : n;
export function catalogue(source) {
  const rows = new Map();
  const add = (id, language, node, ast, file) => {
    const row = rows.get(id) ?? { id, values: {}, nodes: [] };
    if (language in row.values)
      throw Error(`${id}: duplicate ${language} entry`);
    row.values[language] = node.text;
    row.nodes.push({
      language,
      file,
      start: node.getStart(ast),
      end: node.end,
    });
    rows.set(id, row);
  };
  for (const file of walk(source).filter(
    (f) =>
      /i18n\.ts$|i18n\/(?:locales|automation-)/.test(f) && f.endsWith(".ts"),
  )) {
    const relative = path.relative(source, file).replaceAll("\\", "/");
    const normalized = relative.replace(/\b(en|de|fr|es)\.ts$/, "[locale].ts");
    const ast = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node, scope = "") {
      if (ts.isVariableDeclaration(node)) {
        const name = node.name.getText(ast);
        const init = node.initializer && unwrap(node.initializer);
        if (
          languages.includes(name) &&
          init &&
          ts.isObjectLiteralExpression(init)
        ) {
          for (const p of init.properties) {
            if (
              !ts.isPropertyAssignment(p) ||
              !ts.isStringLiteral(p.initializer)
            )
              continue;
            add(
              `${normalized}:dictionary.${p.name.getText(ast).replace(/^['"]|['"]$/g, "")}`,
              name,
              p.initializer,
              ast,
              file,
            );
          }
          return;
        }
        scope = name;
      }
      if (ts.isPropertyAssignment(node)) {
        scope += "." + node.name.getText(ast).replace(/^['"]|['"]$/g, "");
        const init = unwrap(node.initializer);
        if (
          ts.isArrayLiteralExpression(init) &&
          init.elements.every(ts.isStringLiteral)
        ) {
          checkValues(
            init.elements.map((v) => v.text),
            `${relative}:${scope}`,
          );
          init.elements.forEach((v, i) =>
            add(`${relative}:${scope}`, languages[i], v, ast, file),
          );
          return;
        }
      }
      ts.forEachChild(node, (child) => visit(child, scope));
    }
    visit(ast);
  }
  for (const row of rows.values())
    checkValues(
      languages.map((l) => row.values[l]),
      row.id,
    );
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}
export function applyCatalogue(source, document) {
  const current = catalogue(source);
  if (document.version !== 1 || !Array.isArray(document.entries))
    throw Error("Unsupported translation document");
  const incoming = new Map(document.entries.map((v) => [v.id, v]));
  if (
    incoming.size !== current.length ||
    incoming.size !== document.entries.length ||
    current.some((r) => !incoming.has(r.id))
  )
    throw Error(
      "Translation keys differ; export the current catalogue before importing",
    );
  const updates = new Map();
  for (const row of current) {
    const values = incoming.get(row.id).values;
    if (
      !values ||
      Object.keys(values).sort().join() !== [...languages].sort().join()
    )
      throw Error(`${row.id}: locale keys differ`);
    checkValues(
      languages.map((l) => values[l]),
      row.id,
    );
    // English defines the interpolation contract; translators cannot remove or add parameters in any locale.
    checkValues(
      [row.values.en, ...languages.slice(1).map((l) => values[l])],
      row.id,
    );
    checkValues([row.values.en, values.en, values.en, values.en], row.id);
    for (const node of row.nodes) {
      if (
        node.language &&
        values[node.language] !== row.values[node.language]
      ) {
        const edits = updates.get(node.file) ?? [];
        edits.push({ ...node, text: JSON.stringify(values[node.language]) });
        updates.set(node.file, edits);
      }
    }
  }
  const prepared = [...updates].map(([file, edits]) => {
    let text = fs.readFileSync(file, "utf8");
    for (const edit of edits.sort((a, b) => b.start - a.start))
      text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    return [file, text];
  });
  for (const [file, text] of prepared) fs.writeFileSync(file, text);
  return prepared.length;
}
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const source = path.resolve(import.meta.dirname, "../src");
  const [command, target] = process.argv.slice(2);
  if (command === "check")
    console.log(
      `PASS ${catalogue(source).length} translation keys: complete EN/DE/FR/ES and matching placeholders`,
    );
  else if (command === "export" && target) {
    fs.writeFileSync(
      target,
      JSON.stringify(
        {
          version: 1,
          languages,
          entries: catalogue(source).map(({ id, values }) => ({ id, values })),
        },
        null,
        2,
      ) + "\n",
    );
  } else if (command === "import" && target)
    console.log(
      `Updated ${applyCatalogue(source, JSON.parse(fs.readFileSync(target, "utf8")))} catalogue files; format and run localization/tests before merging.`,
    );
  else
    throw Error(
      "Usage: translation-catalog.mjs check | export <file.json> | import <file.json>",
    );
}
