// Build-time encodings must reproduce originals, remain deterministic and not retain stale small-file sidecars.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { expect, test } from "vitest";

test("precompressed assets round-trip in folders with spaces and clean stale encodings", () => {
  const dir = mkdtempSync(join(tmpdir(), "vendune delivery "));
  try {
    const file = join(dir, "bundle.js");
    const original = Buffer.from(
      "export const product = 'synthetic fixture';\n".repeat(200),
    );
    writeFileSync(file, original);
    const build = () =>
      execFileSync(process.execPath, [resolve("scripts/precompress.mjs"), dir]);
    build();
    const br = readFileSync(file + ".br"),
      gz = readFileSync(file + ".gz");
    expect(brotliDecompressSync(br)).toEqual(original);
    expect(gunzipSync(gz)).toEqual(original);
    expect(br.length).toBeLessThan(original.length);
    build();
    expect(readFileSync(file + ".br")).toEqual(br);
    expect(readFileSync(file + ".gz")).toEqual(gz);
    writeFileSync(file, "small");
    build();
    expect(existsSync(file + ".br")).toBe(false);
    expect(existsSync(file + ".gz")).toBe(false);
    expect(readFileSync(file).toString()).toBe("small");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
