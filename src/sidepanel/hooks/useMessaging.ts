/**
 * Typed wrapper around chrome.runtime.sendMessage.
 *
 * Wraps every request in a RequestEnvelope with the protocol version, unwraps
 * the ExtensionResponse, and throws a typed ExtensionError on failure so
 * callers only see the happy path.
 */
import { useCallback } from "react";
import type { RequestType, ResponseData } from "../../shared/messages.ts";
import type { RequestOf } from "../../shared/messages.ts";
import { PROTOCOL_VERSION, type ExtensionResponse, type RequestEnvelope } from "../../shared/messages.ts";
import { ExtensionError } from "../../shared/errors.ts";
import { PANEL_MESSAGE_TIMEOUT_MS, withTimeout } from "../../shared/messaging-timeout.ts";

export function useMessaging() {
  const send = useCallback(
    async <T extends RequestType>(request: RequestOf<T>): Promise<ResponseData[T]> => {
      const envelope: RequestEnvelope = { v: PROTOCOL_VERSION, request };
      const rawResponse: unknown = await withTimeout(
        chrome.runtime.sendMessage(envelope),
        PANEL_MESSAGE_TIMEOUT_MS,
        request.type,
      );
      const response = rawResponse as ExtensionResponse<ResponseData[T]>;

      if (!response.ok) {
        const e = response.error;
        throw new ExtensionError(e?.code ?? "UNKNOWN_ERROR", e?.detail, e?.message);
      }

      return response.data as ResponseData[T];
    },
    [],
  );

  return { send };
}
