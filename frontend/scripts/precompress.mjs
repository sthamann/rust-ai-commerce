// Deterministic build-time encodings; unchanged URLs, originals and MIME types remain the serving contract.
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { brotliCompress, gzip, constants } from "node:zlib";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await compress(path);
    } else if (/\.(js|css|html|svg|json|txt)$/.test(entry.name)) {
      const source = await readFile(path);
      const encodings = [
        [
          "br",
          await brotli(source, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
          }),
        ],
        ["gz", await gz(source, { level: 9 })],
      ];
      for (const [suffix, encoded] of encodings) {
        if (source.length >= 1024 && encoded.length < source.length) {
          await writeFile(`${path}.${suffix}`, encoded);
        } else {
          await rm(`${path}.${suffix}`, { force: true });
        }
      }
    }
  }
}
await compress(
  process.argv[2] || fileURLToPath(new URL("../dist", import.meta.url)),
);
