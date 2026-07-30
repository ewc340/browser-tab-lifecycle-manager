/**
 * Minimal Chrome DevTools Protocol client over a pipe transport.
 *
 * Chrome writes CDP messages to fd 4 (readable) and reads from fd 3 (writable)
 * when launched with --remote-debugging-pipe. Messages are NUL (\0) delimited JSON.
 *
 * Usage:
 *   const cdp = new CDP(child.stdio[4], child.stdio[3]);
 *   const result = await cdp.send("Target.getTargets", { filter: [{}] });
 *   // With a session (flatten mode):
 *   const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
 *   await cdp.send("Runtime.enable", {}, sessionId);
 *   cdp.on("Runtime.exceptionThrown", handler, sessionId);
 */

export class CDP {
  /** @type {NodeJS.WritableStream} */ #writable;
  #nextId = 1;
  /** @type {Map<number, { resolve: Function, reject: Function }>} */
  #pending = new Map();
  /**
   * Event listeners: method -> [{ handler, sessionId? }]
   * @type {Map<string, Array<{ handler: Function, sessionId?: string }>>}
   */
  #listeners = new Map();
  #buf = "";

  /**
   * @param {NodeJS.ReadableStream} readable  CDP output from Chrome (fd 4)
   * @param {NodeJS.WritableStream} writable  CDP input to Chrome (fd 3)
   */
  constructor(readable, writable) {
    this.#writable = writable;

    readable.on("data", (/** @type {Buffer} */ chunk) => {
      this.#buf += chunk.toString("utf8");
      let idx;
      while ((idx = this.#buf.indexOf("\0")) !== -1) {
        const raw = this.#buf.slice(0, idx);
        this.#buf = this.#buf.slice(idx + 1);
        if (!raw) continue;
        try {
          this.#dispatch(JSON.parse(raw));
        } catch {
          // Ignore malformed messages
        }
      }
    });
  }

  /** @param {object} msg */
  #dispatch(msg) {
    if (msg.id !== undefined) {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      } else {
        p.resolve(msg.result ?? {});
      }
    } else if (msg.method) {
      const listeners = this.#listeners.get(msg.method) ?? [];
      for (const entry of listeners) {
        if (entry.sessionId === undefined || entry.sessionId === msg.sessionId) {
          try {
            entry.handler(msg.params ?? {}, msg.sessionId);
          } catch {
            // Don't let a listener crash the dispatcher
          }
        }
      }
    }
  }

  /**
   * Send a CDP command and return a Promise that resolves with the result.
   *
   * @param {string} method
   * @param {object} [params]
   * @param {string} [sessionId]  Omit for the root session.
   * @returns {Promise<any>}
   */
  send(method, params = {}, sessionId = undefined) {
    const id = this.#nextId++;
    /** @type {Record<string, unknown>} */
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#writable.write(JSON.stringify(msg) + "\0");
    });
  }

  /**
   * Register an event listener for a CDP event method.
   * If `sessionId` is provided, only events from that session fire the handler.
   * Returns an unsubscribe function.
   *
   * @param {string} method
   * @param {Function} handler  Called with (params, sessionId)
   * @param {string} [sessionId]
   * @returns {() => void}
   */
  on(method, handler, sessionId = undefined) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, []);
    const entry = { handler, sessionId };
    this.#listeners.get(method).push(entry);
    return () => {
      const arr = this.#listeners.get(method);
      if (!arr) return;
      const i = arr.indexOf(entry);
      if (i !== -1) arr.splice(i, 1);
    };
  }

  /**
   * Wait for the next occurrence of `method` (optionally scoped to `sessionId`),
   * resolving with the event's params.
   *
   * @param {string} method
   * @param {string} [sessionId]
   * @param {number} [timeoutMs]
   * @returns {Promise<any>}
   */
  waitForEvent(method, sessionId = undefined, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      let unsub;
      const timer = setTimeout(() => {
        unsub?.();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      unsub = this.on(
        method,
        (params) => {
          clearTimeout(timer);
          unsub?.();
          resolve(params);
        },
        sessionId,
      );
    });
  }

  /**
   * Rejects all pending commands (called on cleanup).
   * @param {string} reason
   */
  close(reason = "CDP closed") {
    for (const p of this.#pending.values()) {
      p.reject(new Error(reason));
    }
    this.#pending.clear();
  }
}
