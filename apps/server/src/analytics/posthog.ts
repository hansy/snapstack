import { PostHog } from "posthog-node";

export const createPostHogClient = (env: Env) => {
  const apiKey = env.POSTHOG_API_KEY ?? "";
  const host = env.POSTHOG_API_HOST ?? "";

  if (!apiKey || !host) {
    return null;
  }

  return new PostHog(apiKey, {
    host,
    flushAt: 1, // Send events immediately in edge environment
    flushInterval: 0, // Don't wait for interval
  });
};
