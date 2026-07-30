/**
 * Packages dist/ into browser-tab-lifecycle-manager-<version>.zip for distribution
 * (unpacked sideload, private Chrome Web Store item, or a shared build).
 *
 * Uses the system `zip` binary rather than adding an archiver dependency.
 */
import { execFileSync } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const name = `browser-tab-lifecycle-manager-${pkg.version}.zip`;
const target = resolve(root, name);

if (!(await stat(resolve(root, "dist")).catch(() => null))) {
  console.error("dist/ not found - run `npm run build` first.");
  process.exit(1);
}

await rm(target, { force: true });

// -r recurse, -X strip extra file attributes, -9 max compression.
execFileSync("zip", ["-r", "-X", "-9", target, "."], {
  cwd: resolve(root, "dist"),
  stdio: "inherit",
});

const { size } = await stat(target);
console.log(`\n${name} (${(size / 1024).toFixed(1)} KiB)`);
