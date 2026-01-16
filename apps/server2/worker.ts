import type { Env } from "./env";
import { getRoomFromUrl, isValidRoomName, normalizePathname } from "./request";

// Worker: routes requests to appropriate Durable Objects
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);

    // Yjs sync endpoint (existing)
    if (pathname.startsWith("/signal")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      const room = getRoomFromUrl(url);
      if (!room) {
        return new Response("Missing room name", { status: 400 });
      }
      if (!isValidRoomName(room)) {
        return new Response("Invalid room name", { status: 400 });
      }
      const id = env.WEBSOCKET_SERVER.idFromName(room);
      const stub = env.WEBSOCKET_SERVER.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
