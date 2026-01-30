import posthog from "posthog-js";

export const getPostHogDistinctId = (): string | null => {
  if (typeof window === "undefined") return null;
  if (typeof posthog.get_distinct_id !== "function") return null;
  try {
    const id = posthog.get_distinct_id();
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch (_err) {
    return null;
  }
};
