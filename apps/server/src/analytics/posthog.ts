import { PostHog } from "posthog-node";

export const createPostHogClient = (env: Env) => {
  const posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_API_HOST,
    flushAt: 1, // Send events immediately in edge environment
    flushInterval: 0, // Don't wait for interval
  });
  return posthog;
};
