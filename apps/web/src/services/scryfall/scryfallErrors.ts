export type ScryfallFetchErrorKind = "network" | "http" | "invalid-response";

export type ScryfallEndpoint = "collection" | "named" | "card";

export type ScryfallFetchError = {
  kind: ScryfallFetchErrorKind;
  endpoint: ScryfallEndpoint;
  url: string;
  status?: number;
  statusText?: string;
  message: string;
  retryAfterMs?: number;
};

export type ScryfallFetchResult<T> = { ok: true; data: T } | { ok: false; error: ScryfallFetchError };

export const parseRetryAfterMs = (response?: Response | null): number | undefined => {
  const retryAfter = response?.headers?.get("Retry-After");
  if (!retryAfter) return undefined;
  const asSeconds = Number(retryAfter);
  if (!Number.isFinite(asSeconds)) return undefined;
  return Math.max(0, asSeconds * 1000);
};

const formatStatus = (error: ScryfallFetchError): string | null => {
  if (!error.status) return null;
  const text = error.statusText ? ` ${error.statusText}` : "";
  return `${error.status}${text}`.trim();
};

export const formatScryfallErrors = (errors: ScryfallFetchError[]): string => {
  if (errors.length === 0) {
    return "Scryfall request failed. Please try again.";
  }

  const rateLimit = errors.find((error) => error.kind === "http" && error.status === 429);
  if (rateLimit) {
    if (rateLimit.retryAfterMs) {
      const seconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
      return `Scryfall rate limited the request. Please wait ${seconds} seconds and try again.`;
    }
    return "Scryfall rate limited the request. Please wait a moment and try again.";
  }

  const serverError = errors.find(
    (error) => error.kind === "http" && (error.status ?? 0) >= 500
  );
  if (serverError) {
    const status = formatStatus(serverError);
    return `Scryfall is temporarily unavailable${status ? ` (${status})` : ""}. Please try again.`;
  }

  const networkError = errors.find((error) => error.kind === "network");
  if (networkError) {
    return "Network error while contacting Scryfall. Please check your connection and try again.";
  }

  const invalidResponse = errors.find((error) => error.kind === "invalid-response");
  if (invalidResponse) {
    return "Received an unexpected response from Scryfall. Please try again.";
  }

  const httpError = errors.find((error) => error.kind === "http");
  if (httpError) {
    const status = formatStatus(httpError);
    return `Scryfall request failed${status ? ` (${status})` : ""}. Please try again.`;
  }

  return "Scryfall request failed. Please try again.";
};

export const buildScryfallHttpError = (params: {
  endpoint: ScryfallEndpoint;
  url: string;
  response: Response;
}): ScryfallFetchError => {
  return {
    kind: "http",
    endpoint: params.endpoint,
    url: params.url,
    status: params.response.status,
    statusText: params.response.statusText,
    retryAfterMs: parseRetryAfterMs(params.response),
    message: `Scryfall responded with ${params.response.status} ${params.response.statusText}`.trim(),
  };
};

export const buildScryfallNetworkError = (params: {
  endpoint: ScryfallEndpoint;
  url: string;
  error: unknown;
}): ScryfallFetchError => {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  return {
    kind: "network",
    endpoint: params.endpoint,
    url: params.url,
    message,
  };
};

export const buildScryfallInvalidResponseError = (params: {
  endpoint: ScryfallEndpoint;
  url: string;
  error?: unknown;
}): ScryfallFetchError => {
  const message = params.error instanceof Error ? params.error.message : String(params.error ?? "");
  return {
    kind: "invalid-response",
    endpoint: params.endpoint,
    url: params.url,
    message: message || "Invalid response payload",
  };
};
