import { defineConfig } from "vite";

/**
 * Service-worker build. `inlineDynamicImports` keeps the worker a single file:
 * MV3 will not load a service worker whose chunks are split across dynamic imports.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "chrome121",
    sourcemap: false,
    minify: "oxc",
    lib: {
      entry: "src/background/index.ts",
      formats: ["es"],
      fileName: () => "background.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
