import { test as base, chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedAutomationEnabled } from "../helpers/panel.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = resolve(root, "dist");

async function waitForExtensionId(context: BrowserContext): Promise<string> {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 30_000 });
  }
  const match = serviceWorker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  if (match === null) {
    throw new Error(`Could not parse extension id from ${serviceWorker.url()}`);
  }
  return match[1]!;
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  panelPage: Page;
}>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(resolve(tmpdir(), "tlm-pw-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-dev-shm-usage",
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    await use(await waitForExtensionId(context));
  },

  panelPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("heading", { name: "Tab Lifecycle", level: 1 }).waitFor();
    await seedAutomationEnabled(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
