/**
 * Audits dist/ before packaging.
 *
 * The point is to turn the product's privacy promises into something mechanically
 * enforced rather than asserted: the extension claims it makes no network requests and
 * runs no remote code, so the shipped bundle must contain no network APIs, no dynamic
 * code evaluation, and no off-disk sourcemap references.
 *
 * Exits non-zero on any violation. Prints http(s) string literals for manual review
 * rather than failing on them, since user-clickable links are legitimate.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

const CODE_EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".json"]);

/** Each rule fails the audit if its pattern matches shipped code. */
const FORBIDDEN = [
  { name: "dynamic code evaluation", pattern: /\beval\s*\(|\bnew\s+Function\s*\(/g },
  {
    name: "network API",
    pattern:
      /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b|\bsendBeacon\b|\bimportScripts\s*\(/g,
  },
  { name: "off-disk sourcemap reference", pattern: /sourceMappingURL\s*=\s*(?!data:)/g },
  { name: "remote script or style", pattern: /(?:src|href)\s*=\s*["']https?:|@import\s+(?:url\()?["']https?:/g },
  { name: "hardcoded extension id", pattern: /chrome-extension:\/\/[a-p]{32}/g },
  // PRV-005: production builds must not log. shared/log.ts compiles away outside dev.
  { name: "console logging", pattern: /console\s*\.\s*(?:log|info|debug|trace|dir|table)\s*\(/g },
];

const URL_LITERAL = /https?:\/\/[^\s"'`)<>]+/g;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

if (!(await stat(dist).catch(() => null))) {
  console.error("dist/ not found - run `npm run build` first.");
  process.exit(1);
}

const files = await walk(dist);
const violations = [];
const urls = new Map();

for (const file of files) {
  if (!CODE_EXTENSIONS.has(extname(file))) continue;
  const rel = relative(root, file);
  const source = await readFile(file, "utf8");

  for (const { name, pattern } of FORBIDDEN) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${rel}:${line}  ${name}: ${match[0].slice(0, 60)}`);
    }
  }

  if (extname(file) !== ".json") {
    for (const match of source.matchAll(URL_LITERAL)) {
      const url = match[0].replace(/[.,;]+$/, "");
      urls.set(url, (urls.get(url) ?? 0) + 1);
    }
  }
}

const required = ["manifest.json", "background.js", "sidepanel.html", "onboarding.html"];
for (const name of required) {
  if (!files.some((f) => relative(dist, f) === name)) {
    violations.push(`dist/${name} is missing`);
  }
}

const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
for (const forbiddenKey of ["key", "update_url"]) {
  if (forbiddenKey in manifest) {
    violations.push(`dist/manifest.json contains "${forbiddenKey}", which must not ship`);
  }
}
if (manifest.host_permissions?.length) {
  violations.push("dist/manifest.json requests host permissions");
}
if (manifest.content_scripts?.length) {
  violations.push("dist/manifest.json declares content scripts");
}

const cssFile = files.find((f) => relative(dist, f).startsWith("assets/styles") && f.endsWith(".css"));
if (cssFile) {
  const css = await readFile(cssFile, "utf8");
  if (/\.recovery-row__host\{[^}]*\.settings-view/.test(css)) {
    violations.push(
      `${relative(root, cssFile)} nests .settings-view under .recovery-row__host — check for an unclosed CSS rule in src/sidepanel/styles.css`,
    );
  }
  if (!/\.settings-view\{[^}]*padding/.test(css)) {
    violations.push(`${relative(root, cssFile)} is missing top-level .settings-view padding styles`);
  }
  if (!/\.btn--ghost\{/.test(css)) {
    violations.push(`${relative(root, cssFile)} is missing top-level .btn--ghost styles`);
  }
}

if (urls.size > 0) {
  console.log("URL literals in the bundle (review manually; links are expected, loads are not):");
  for (const [url, count] of [...urls].sort()) {
    console.log(`  ${url}${count > 1 ? ` (x${count})` : ""}`);
  }
  console.log("");
}

if (violations.length > 0) {
  console.error(`Bundle audit FAILED with ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

const bytes = (
  await Promise.all(files.map(async (f) => (await stat(f)).size))
).reduce((a, b) => a + b, 0);
console.log(
  `Bundle audit passed: ${files.length} files, ${(bytes / 1024).toFixed(1)} KiB, no network APIs, no remote code.`,
);
