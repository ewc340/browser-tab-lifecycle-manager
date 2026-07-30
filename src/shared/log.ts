/**
 * The only place in the extension allowed to touch the console (enforced by ESLint).
 *
 * PRV-005 forbids logging URL information in production builds. These functions compile
 * to nothing outside a development build: `import.meta.env.DEV` is statically replaced,
 * so the bodies are removed by dead-code elimination and the shipped bundle contains no
 * console calls at all (asserted by scripts/audit-bundle.mjs).
 */

const DEV = import.meta.env.DEV;

export function debug(...args: unknown[]): void {
  if (DEV) console.debug("[tlm]", ...args);
}

export function info(...args: unknown[]): void {
  if (DEV) console.info("[tlm]", ...args);
}

/**
 * Warnings and errors are also dev-only. Anything a user needs to know about reaches
 * them through the activity feed or a toast, not the console.
 */
export function warn(...args: unknown[]): void {
  if (DEV) console.warn("[tlm]", ...args);
}

export function error(...args: unknown[]): void {
  if (DEV) console.error("[tlm]", ...args);
}
