/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

interface Env {
  WEBSOCKET_SERVER: DurableObjectNamespace;
  PING_INTERVAL?: string;
}

// Worker: routes /signal[/<room>] to the DO keyed by room (default if none)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname.startsWith("/signal")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const roomFromPath = pathname.startsWith("/signal/") ? pathname.slice("/signal/".length) : null;
    const room = roomFromPath || url.searchParams.get("room") || "default";
    const id = env.WEBSOCKET_SERVER.idFromName(room);
    const stub = env.WEBSOCKET_SERVER.get(id);
    return stub.fetch(request);
  },
};

type RoomName = string;

const messageSync = 0;
const messageAwareness = 1;

// Durable Object implementing y-websocket style doc + awareness sync
export class SignalRoom extends DurableObject {
  conns: Set<WebSocket>;
  connClients: Map<WebSocket, Set<number>>;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.conns = new Set();
    this.connClients = new Map();
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.setupDocListeners();
  }

  private setupDocListeners() {
    this.doc.on("update", (update) => {
      // Broadcast doc updates to everyone (including origin) per y-websocket server behavior.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(null, encoding.toUint8Array(encoder));
    });

    this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: any) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      this.broadcast(origin as WebSocket | null, encoding.toUint8Array(encoder));
    });
  }

  private resetStateIfEmpty() {
    if (this.conns.size > 0) return;
    try { this.doc.destroy(); } catch (_err) {}
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.connClients.clear();
    this.setupDocListeners();
  }

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const roomFromPath = pathname.startsWith("/signal/") ? pathname.slice("/signal/".length) : null;
    const room = roomFromPath || url.searchParams.get("room") || "default";
    this.handleConnection(server, room);
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(origin: WebSocket | null, data: ArrayBuffer | Uint8Array) {
    this.conns.forEach(conn => {
      if (origin && conn === origin) return;
      try { conn.send(data); } catch (_err) { conn.close(); this.conns.delete(conn); }
    });
  }

  private handleConnection(ws: WebSocket, room: RoomName) {
    ws.accept();
    let closed = false;
    // room name preserved for potential logging
    const _roomNameForLog: RoomName = room || "default";
    void _roomNameForLog;

    this.conns.add(ws);
    this.connClients.set(ws, new Set());
      // console.log('[signal] joined room', currentRoom, 'size', this.conns.size);

    ws.addEventListener("close", () => {
      closed = true;
      this.conns.delete(ws);
      const clientIds = this.connClients.get(ws);
      if (clientIds && clientIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(this.awareness, Array.from(clientIds), "disconnect");
      }
      this.connClients.delete(ws);
      // console.log('[signal] left room', currentRoom, 'size', this.conns.size);
      this.resetStateIfEmpty();
    });

    ws.addEventListener("message", (evt) => {
      if (closed) return;
      const raw = evt.data;
      const data = raw instanceof ArrayBuffer ? new Uint8Array(raw) : typeof raw === "string" ? new TextEncoder().encode(raw) : new Uint8Array([]);
      // console.log('[signal] msg', currentRoom, 'size', this.conns.size, 'type', typeof raw, 'len', raw instanceof ArrayBuffer ? raw.byteLength : (typeof raw === 'string' ? raw.length : 'n/a'));

      const decoder = decoding.createDecoder(data);
      const encoder = encoding.createEncoder();
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
          if (encoding.length(encoder) > 1) {
            const resp = encoding.toUint8Array(encoder);
            try { ws.send(resp); } catch (_err) { ws.close(); }
          }
          break;
        }
        case messageAwareness: {
          const update = decoding.readVarUint8Array(decoder);
          if (!update || update.length === 0) {
            break;
          }
          // Track client IDs from the update to clean up on disconnect.
          try {
            const set = this.connClients.get(ws);
            const decoderUpdate = decoding.createDecoder(update);
            const len = decoding.readVarUint(decoderUpdate);
            for (let i = 0; i < len; i++) {
              const clientID = decoding.readVarUint(decoderUpdate);
              decoding.readVarUint(decoderUpdate); // clock (unused)
              // skip state payload to advance decoder safely
              try { decoding.readVarString(decoderUpdate); } catch (_err) {}
              if (set) set.add(clientID);
            }
          } catch (err) {
            console.error("[signal] awareness id decode failed", err);
          }

          try {
            awarenessProtocol.applyAwarenessUpdate(this.awareness, update, ws);
          } catch (err) {
            console.error("[signal] awareness update failed", err);
          }
          break;
        }
        default:
          console.warn("[signal] unknown message type", messageType);
      }
    });

    // Initial sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    ws.send(encoding.toUint8Array(encoder));

    // Send current awareness states
    const awarenessStates = encoding.createEncoder();
    encoding.writeVarUint(awarenessStates, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessStates,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(this.awareness.getStates().keys()))
    );
    ws.send(encoding.toUint8Array(awarenessStates));
  }
}
