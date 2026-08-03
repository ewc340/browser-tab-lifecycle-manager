import { resolve } from "node:path";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Renames HTML output files to the extension-root names the manifest expects
 * (`sidepanel.html`, `onboarding.html`). Vite's default places them at the
 * source-relative path (`src/sidepanel/index.html`), which is wrong for MV3.
 *
 * `closeBundle` runs after Rolldown has flushed all files to disk, making it
 * safe to use Node's fs.rename here (a generateBundle mutation is ignored by
 * Rolldown's HTML-asset pipeline in Vite 8).
 */
function renameHtmlOutputs(): Plugin {
  const distDir = resolve(import.meta.dirname, "dist");
  const moves = [
    ["src/sidepanel/index.html", "sidepanel.html"],
    ["src/onboarding/index.html", "onboarding.html"],
    ["src/panel-open-debug/index.html", "panel-open-debug.html"],
  ] as const;
  return {
    name: "rename-html-outputs",
    async closeBundle() {
      const { rename, rm } = await import("node:fs/promises");
      for (const [from, to] of moves) {
        await rename(resolve(distDir, from), resolve(distDir, to)).catch(() => {});
      }
      // Remove the now-empty dist/src/ tree left behind after the renames above.
      await rm(resolve(distDir, "src"), { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Removes TanStack Virtual memo-debug console.info from panel bundles (PRV-005). */
function stripTanstackPerfLogs(): Plugin {
  const distDir = resolve(import.meta.dirname, "dist");
  const pattern = /console\.info\(`%c⏱[\s\S]*?n\?\.key\)\}/g;

  return {
    name: "strip-tanstack-perf-logs",
    async closeBundle() {
      const { readFile, writeFile, readdir, stat } = await import("node:fs/promises");
      const { join } = await import("node:path");

      async function walk(dir: string): Promise<string[]> {
        const entries = await readdir(dir);
        const files: string[] = [];
        for (const entry of entries) {
          const full = join(dir, entry);
          if ((await stat(full)).isDirectory()) files.push(...(await walk(full)));
          else files.push(full);
        }
        return files;
      }

      for (const file of await walk(distDir)) {
        if (!file.endsWith(".js")) continue;
        const source = await readFile(file, "utf8");
        const stripped = source.replace(pattern, "void 0;");
        if (stripped !== source) await writeFile(file, stripped);
      }
    },
  };
}

/**
 * Panel + onboarding build. The service worker is built separately by
 * `vite.config.sw.ts` because MV3 requires it to be one self-contained module.
 */
export default defineConfig({
  plugins: [react(), renameHtmlOutputs(), stripTanstackPerfLogs()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  // Extension pages may only load same-origin scripts under the MV3 CSP, so there is
  // no dev server and no HMR. `vite build --watch` plus a reload is the dev loop.
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome121",
    sourcemap: false,
    minify: "oxc",
    // Disable the fetch()-based polyfill; Chrome 121+ has native module preloading,
    // and the polyfill would be flagged as a network API by the bundle audit.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(import.meta.dirname, "src/sidepanel/index.html"),
        onboarding: resolve(import.meta.dirname, "src/onboarding/index.html"),
        "panel-open-debug": resolve(import.meta.dirname, "src/panel-open-debug/index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  test: {
    include: ["src/tests/**/*.test.ts"],
    environment: "node",
  },
});
