export const resolvePartyKitHost = (envHost?: string): string | null => {
  if (!envHost) return null;
  const trimmed = envHost.trim();
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).host;
    } catch (_err) {
      return null;
    }
  }

  const withoutSlash = trimmed.replace(/\/+$/, "");
  return withoutSlash.split("/")[0] || null;
};
