/** Bundled app text maps are complete; guest UI catalogues never silently fall back to an empty array. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { checkValues } from "./localization-syntax.mjs";
const root = path.resolve(import.meta.dirname, "../../extensions/apps");
let maps = 0;
function inspect(value, context) {
  if (Array.isArray(value))
    value.forEach((v, i) => inspect(v, `${context}[${i}]`));
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (
        ["name", "label", "title", "text", "hint", "description"].includes(
          key,
        ) &&
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).some((l) => ["en", "de", "fr", "es"].includes(l))
      ) {
        checkValues(
          ["en", "de", "fr", "es"].map((l) => v[l]),
          `${context}.${key}`,
        );
        maps++;
      }
      inspect(v, `${context}.${key}`);
    }
  }
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) walk(file);
    else if (
      e.name.endsWith(".json") &&
      (e.name === "manifest.json" ||
        path.basename(dir) === "assistant-examples")
    )
      inspect(
        JSON.parse(fs.readFileSync(file, "utf8")),
        path.relative(root, file),
      );
  }
}
walk(root);
// Check both shipped guest catalogues structurally, including the inline Storyfront module.
for (const file of ["product-lab/app.js", "storyfront/ui.html"]) {
  let source = fs.readFileSync(path.join(root, file), "utf8");
  if (file.endsWith(".html"))
    source =
      source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let found = false;
  function visit(n) {
    if (
      ts.isVariableDeclaration(n) &&
      n.name.getText(ast) === "catalogue" &&
      ts.isObjectLiteralExpression(n.initializer)
    ) {
      const entries = Object.fromEntries(
        n.initializer.properties.map((p) => [
          p.name.getText(ast),
          p.initializer.elements.map((v) => v.text),
        ]),
      );
      const en = entries.en;
      if (
        !en ||
        ["de", "fr", "es"].some((l) => entries[l]?.length !== en.length)
      )
        throw Error(`${file}: incomplete guest catalogue`);
      en.forEach((_, i) =>
        checkValues(
          ["en", "de", "fr", "es"].map((l) => entries[l][i]),
          `${file}:${i}`,
        ),
      );
      found = true;
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
  if (!found) throw Error(`${file}: missing explicit guest catalogue`);
}
console.log(
  `PASS ${maps} bundled app text maps and both guest catalogues localized EN/DE/FR/ES`,
);
