import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const handler = createStartHandler(defaultStreamHandler);

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown>,
    _ctx: unknown
  ): Promise<Response> {
    return (handler as any)(request, { context: { env } });
  },
};
