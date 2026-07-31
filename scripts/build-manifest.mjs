/**
 * Emits dist/manifest.json from the typed source in manifest.config.ts.
 *
 * The version always comes from package.json so the two can never drift.
 * `key` is injected only for local development builds (TLM_DEV_KEY), which makes the
 * unpacked extension ID match a published one; it must never appear in a shipped zip.
 *
 * Run with:
 *   node --experimental-strip-types --no-warnings=ExperimentalWarning scripts/build-manifest.mjs
 *
 * Node 22's --experimental-strip-types lets this file import .ts sources (including
 * their own .ts imports) directly, removing the need for a temp-file transpile step.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { manifest } = await import(pathToFileURL(resolve(root, "manifest.config.ts")).href);
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const output = { ...manifest, version: pkg.version };

if (process.env.TLM_DEV_KEY) {
  output.key = process.env.TLM_DEV_KEY;
}

if (!/^\d+(\.\d+){0,3}$/.test(output.version)) {
  throw new Error(
    `Version "${output.version}" is not 1-4 dot-separated integers, which Chrome requires.`,
  );
}

await mkdir(resolve(root, "dist"), { recursive: true });
await writeFile(resolve(root, "dist/manifest.json"), `${JSON.stringify(output, null, 2)}\n`);

console.log(`manifest.json written (${output.name} v${output.version})`);
