/** Negative controls prove the localization gate rejects new literals and incomplete language vocabularies. */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
it("rejects raw new module text and missing vocabulary translations without recording them as legacy", () => {
  const root = mkdtempSync(join(tmpdir(), "commerce-localization-"));
  const run = () =>
    spawnSync(
      process.execPath,
      [resolve("scripts/localization.mjs"), "--source", root],
      { encoding: "utf8" },
    );
  try {
    writeFileSync(
      join(root, "New.tsx"),
      "export default function New() { return <button>Untranslated action</button>; }",
    );
    let result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("untranslated UI literal");
    rmSync(join(root, "New.tsx"));
    writeFileSync(
      join(root, "new-i18n.ts"),
      'export const words = { action: ["Action", "Aktion", "Action"] };',
    );
    result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("needs nonempty EN/DE/FR/ES");
    writeFileSync(
      join(root, "new-i18n.ts"),
      'export const words = { action: ["Action", "Aktion", "Action", "Acción"] };',
    );
    expect(run().status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects stacked per-language value fields in future modules", () => {
  const root = mkdtempSync(join(tmpdir(), "commerce-localization-"));
  try {
    writeFileSync(
      join(root, "Stacked.tsx"),
      "export const Bad = ({value, locales}) => <div>{locales.map((lang) => <textarea value={value[lang]} />)}</div>;",
    );
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/localization.mjs"), "--source", root],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("stacked language fields prohibited");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
