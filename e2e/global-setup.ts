import { existsSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup(): void {
  const manifest = resolve(process.cwd(), "dist", "manifest.json");
  if (!existsSync(manifest)) {
    throw new Error("dist/manifest.json not found. Run `npm run build` before `npm run e2e`.");
  }
}
