import type { PostHog } from "posthog-node";

import { createPostHogClient } from "./posthog";

type WaitUntil = (promise: Promise<unknown>) => void;

type RoomAnalyticsOptions = {
  env: Env;
  waitUntil: WaitUntil;
  now?: () => number;
};

type UserRole = "player" | "spectator";

type ActiveUser = {
  count: number;
  joinedAt: number;
  role: UserRole;
};

export class RoomAnalyticsTracker {
  private posthog: PostHog | null = null;
  private readonly env: Env;
  private readonly waitUntil: WaitUntil;
  private readonly now: () => number;

  private sessionId: string | null = null;
  private sessionStartedAt: number | null = null;
  private sessionPlayerIds = new Set<string>();
  private activeUsers = new Map<string, ActiveUser>();
  private pendingUsers = new Map<string, ActiveUser>();

  constructor(options: RoomAnalyticsOptions) {
    this.env = options.env;
    this.waitUntil = options.waitUntil;
    this.now = options.now ?? (() => Date.now());
  }

  onPlayerJoin() {
    this.ensureSessionStarted(this.now());
  }

  onUserJoin(userId: string, role: UserRole) {
    const timestamp = this.now();
    if (!this.sessionId) {
      const existing = this.pendingUsers.get(userId);
      if (!existing) {
        this.pendingUsers.set(userId, { count: 1, joinedAt: timestamp, role });
        return;
      }
      existing.count += 1;
      if (role === "player" && existing.role !== "player") {
        existing.role = "player";
      }
      return;
    }

    this.registerActiveUser(userId, role, timestamp, 1);
  }

  onUserLeave(userId: string) {
    if (!this.sessionId) {
      const existing = this.pendingUsers.get(userId);
      if (!existing) return;
      existing.count -= 1;
      if (existing.count > 0) return;
      this.pendingUsers.delete(userId);
      return;
    }
    const existing = this.activeUsers.get(userId);
    if (!existing) return;
    existing.count -= 1;
    if (existing.count > 0) return;

    this.activeUsers.delete(userId);
    const durationMs = Math.max(0, this.now() - existing.joinedAt);
    this.capture("room:user_leave", userId, {
      session_id: this.sessionId,
      user_id: userId,
      role: existing.role,
      duration_ms: durationMs,
    });
  }

  onRoomTeardown() {
    if (!this.sessionId || !this.sessionStartedAt) {
      this.resetSession();
      return;
    }

    const endAt = this.now();
    this.flushActiveUsers(endAt);

    this.capture("room:end", this.sessionId, {
      session_id: this.sessionId,
      duration_ms: Math.max(0, endAt - this.sessionStartedAt),
      num_players: this.sessionPlayerIds.size,
    });

    this.shutdownPostHog();
    this.resetSession();
  }

  private flushActiveUsers(now: number) {
    if (!this.sessionId) return;
    for (const [userId, entry] of this.activeUsers.entries()) {
      if (entry.count <= 0) continue;
      const durationMs = Math.max(0, now - entry.joinedAt);
      this.capture("room:user_leave", userId, {
        session_id: this.sessionId,
        user_id: userId,
        role: entry.role,
        duration_ms: durationMs,
      });
    }
    this.activeUsers.clear();
  }

  private ensureSessionStarted(now: number) {
    if (this.sessionId) return;
    const sessionId = crypto.randomUUID();
    this.sessionId = sessionId;
    this.sessionStartedAt = now;
    this.sessionPlayerIds.clear();
    this.activeUsers.clear();

    this.capture("room:create", sessionId, {
      session_id: sessionId,
    });
    this.flushPendingUsers();
  }

  private resetSession() {
    this.sessionId = null;
    this.sessionStartedAt = null;
    this.sessionPlayerIds.clear();
    this.activeUsers.clear();
    this.pendingUsers.clear();
  }

  private registerActiveUser(
    userId: string,
    role: UserRole,
    joinedAt: number,
    count: number,
  ) {
    if (!this.sessionId) return;
    if (role === "player") {
      this.sessionPlayerIds.add(userId);
    }

    const existing = this.activeUsers.get(userId);
    if (!existing) {
      this.activeUsers.set(userId, { count, joinedAt, role });
      this.capture("room:user_join", userId, {
        session_id: this.sessionId,
        user_id: userId,
        role,
      });
      return;
    }

    existing.count += count;
    if (joinedAt < existing.joinedAt) {
      existing.joinedAt = joinedAt;
    }
    if (role === "player" && existing.role !== "player") {
      existing.role = "player";
    }
  }

  private flushPendingUsers() {
    if (!this.sessionId) return;
    for (const [userId, entry] of this.pendingUsers.entries()) {
      if (entry.count <= 0) continue;
      this.registerActiveUser(userId, entry.role, entry.joinedAt, entry.count);
    }
    this.pendingUsers.clear();
  }

  private capture(
    event: string,
    distinctId: string,
    properties: Record<string, unknown>,
  ) {
    const posthog = this.getPostHog();
    if (!posthog) return;

    const payload = {
      distinctId,
      event,
      properties,
    };

    const capturePromise =
      typeof (posthog as any).captureImmediate === "function"
        ? (posthog as any).captureImmediate(payload)
        : posthog.capture(payload);

    this.waitUntil(Promise.resolve(capturePromise));
  }

  private getPostHog() {
    if (!this.posthog) {
      this.posthog = createPostHogClient(this.env);
    }
    return this.posthog;
  }

  private shutdownPostHog() {
    if (!this.posthog) return;
    const shutdown = (this.posthog as any).shutdown?.();
    if (shutdown) {
      this.waitUntil(Promise.resolve(shutdown));
    }
    this.posthog = null;
  }
}
