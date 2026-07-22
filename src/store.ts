// Persistent key-value store for durable domain data (watchlists, alerts,
// schedules, events). Backed by Redis in production, in-memory in dev/tests.
// NEVER use module-level Maps for durable data — this module is the single
// source of truth for domain persistence.

import type { RedisLike } from "./toolkit/session/redis.js";

// ---------------------------------------------------------------------------
// In-memory fallback (for tests / dev without Redis)
// ---------------------------------------------------------------------------

class MemStore implements RedisLike {
  private data = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  private sortedSets = new Map<string, Map<string, number>>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<unknown> {
    this.data.set(key, value);
    return "OK";
  }
  async del(key: string): Promise<unknown> {
    this.data.delete(key);
    this.sets.delete(key);
    this.sortedSets.delete(key);
    return 1;
  }
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );
    return [...this.data.keys()].filter((k) => regex.test(k));
  }

  // Set helpers (for index records)
  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const s = this.sets.get(key)!;
    let added = 0;
    for (const m of members) {
      if (!s.has(m)) { s.add(m); added++; }
    }
    return added;
  }
  async srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) {
      if (s.delete(m)) removed++;
    }
    return removed;
  }
  async smembers(key: string): Promise<string[]> {
    const s = this.sets.get(key);
    return s ? [...s] : [];
  }
  async sismember(key: string, member: string): Promise<number> {
    const s = this.sets.get(key);
    return s?.has(member) ? 1 : 0;
  }

  // Sorted set helpers (for rankings)
  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    const zs = this.sortedSets.get(key)!;
    const existed = zs.has(member);
    zs.set(member, score);
    return existed ? 0 : 1;
  }
  async zincrby(key: string, increment: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    const zs = this.sortedSets.get(key)!;
    const cur = zs.get(member) ?? 0;
    const next = cur + increment;
    zs.set(member, next);
    return next;
  }
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const zs = this.sortedSets.get(key);
    if (!zs) return [];
    const sorted = [...zs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
    const end = stop === -1 ? sorted.length : stop + 1;
    return sorted.slice(start, end);
  }
  async zrevrangeWithScores(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]> {
    const zs = this.sortedSets.get(key);
    if (!zs) return [];
    const sorted = [...zs.entries()]
      .sort((a, b) => b[1] - a[1]);
    const end = stop === -1 ? sorted.length : stop + 1;
    return sorted.slice(start, end).map(([member, score]) => ({ member, score }));
  }
}

// ---------------------------------------------------------------------------
// Store — wraps a RedisLike with typed helpers for domain data
// ---------------------------------------------------------------------------

export class Store {
  readonly client: RedisLike;

  constructor(client?: RedisLike) {
    this.client = client ?? new MemStore();
  }

  // -- Generic get/set (JSON) --
  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw == null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  async setJSON<T>(key: string, value: T): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // -- Set operations (for index records) --
  async sadd(key: string, ...members: string[]): Promise<number> {
    return (this.client as any).sadd(key, ...members);
  }
  async srem(key: string, ...members: string[]): Promise<number> {
    return (this.client as any).srem(key, ...members);
  }
  async smembers(key: string): Promise<string[]> {
    return (this.client as any).smembers(key);
  }
  async sismember(key: string, member: string): Promise<boolean> {
    return (this.client as any).sismember(key, member) === 1;
  }

  // -- Sorted set operations (for rankings) --
  async zadd(key: string, score: number, member: string): Promise<void> {
    await (this.client as any).zadd(key, score, member);
  }
  async zincrby(key: string, increment: number, member: string): Promise<number> {
    return (this.client as any).zincrby(key, increment, member);
  }
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return (this.client as any).zrevrange(key, start, stop);
  }
  async zrevrangeWithScores(key: string, start: number, stop: number): Promise<{ member: string; score: number }[]> {
    return (this.client as any).zrevrangeWithScores(key, start, stop);
  }
}

// ---------------------------------------------------------------------------
// Singleton store — resolved at startup
// ---------------------------------------------------------------------------

let _store: Store | null = null;

/** Reset the singleton store (test-only). */
export function _resetStore(): void {
  _store = null;
}

export function getStore(): Store {
  if (!_store) {
    // Try Redis; fall back to in-memory
    const redisUrl = typeof process !== "undefined" ? process.env.REDIS_URL : undefined;
    if (redisUrl) {
      try {
        // Dynamic import to avoid node:* in Workers bundle
        const { createRequire } = require("node:module") as typeof import("node:module");
        const req = createRequire(import.meta.url);
        const ioredis = req("ioredis");
        const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
        const client = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
        _store = new Store(client as RedisLike);
      } catch {
        _store = new Store();
      }
    } else {
      _store = new Store();
    }
  }
  return _store;
}

// ---------------------------------------------------------------------------
// Domain helpers — typed accessors for each entity
// ---------------------------------------------------------------------------

export interface UserProfile {
  telegram_id: number;
  timezone: string;
  last_active: number;
}

export interface WatchlistItem {
  ticker: string;
  display_name: string;
  user_id: number;
}

export interface AlertRule {
  id: string;
  type: "threshold" | "percentage";
  direction: "above" | "below";
  value: number;
  cooldown_hours: number;
  user_id: number;
  coin_ticker: string;
  created_at: number;
}

export interface NotificationSchedule {
  user_id: number;
  summary_enabled: boolean;
  summary_time: string; // "HH:MM"
  quiet_hours_start: string; // "HH:MM"
  quiet_hours_end: string; // "HH:MM"
}

export interface AlertEvent {
  id: string;
  coin: string;
  old_price: number;
  new_price: number;
  percent_change: number;
  timestamp: number;
  rule_id: string;
  user_id: number;
}

// ---- User Profile ----
export async function getUserProfile(store: Store, userId: number): Promise<UserProfile | null> {
  return store.getJSON<UserProfile>(`user:${userId}:profile`);
}
export async function setUserProfile(store: Store, profile: UserProfile): Promise<void> {
  await store.setJSON(`user:${profile.telegram_id}:profile`, profile);
}

// ---- Watchlist ----
const watchlistKey = (userId: number) => `user:${userId}:watchlist`;
const watchlistItemKey = (userId: number, ticker: string) => `user:${userId}:watchlist:${ticker}`;

export async function getWatchlist(store: Store, userId: number): Promise<WatchlistItem[]> {
  const tickers = await store.smembers(watchlistKey(userId));
  const items: WatchlistItem[] = [];
  for (const t of tickers) {
    const item = await store.getJSON<WatchlistItem>(watchlistItemKey(userId, t));
    if (item) items.push(item);
  }
  return items;
}
export async function addToWatchlist(store: Store, item: WatchlistItem): Promise<void> {
  await store.sadd(watchlistKey(item.user_id), item.ticker);
  await store.setJSON(watchlistItemKey(item.user_id, item.ticker), item);
}
export async function removeFromWatchlist(store: Store, userId: number, ticker: string): Promise<void> {
  await store.srem(watchlistKey(userId), ticker);
  await store.del(watchlistItemKey(userId, ticker));
}
export async function isInWatchlist(store: Store, userId: number, ticker: string): Promise<boolean> {
  return store.sismember(watchlistKey(userId), ticker);
}

// ---- Alert Rules ----
const alertRuleKey = (ruleId: string) => `alert:${ruleId}`;
const userAlertsKey = (userId: number) => `user:${userId}:alerts`;
const userCoinAlertsKey = (userId: number, ticker: string) => `user:${userId}:coin:${ticker}:alerts`;

export async function getAlertRule(store: Store, ruleId: string): Promise<AlertRule | null> {
  return store.getJSON<AlertRule>(alertRuleKey(ruleId));
}
export async function createAlertRule(store: Store, rule: AlertRule): Promise<void> {
  await store.setJSON(alertRuleKey(rule.id), rule);
  await store.sadd(userAlertsKey(rule.user_id), rule.id);
  await store.sadd(userCoinAlertsKey(rule.user_id, rule.coin_ticker), rule.id);
}
export async function deleteAlertRule(store: Store, rule: AlertRule): Promise<void> {
  await store.del(alertRuleKey(rule.id));
  await store.srem(userAlertsKey(rule.user_id), rule.id);
  await store.srem(userCoinAlertsKey(rule.user_id, rule.coin_ticker), rule.id);
}
export async function getUserAlerts(store: Store, userId: number): Promise<AlertRule[]> {
  const ids = await store.smembers(userAlertsKey(userId));
  const rules: AlertRule[] = [];
  for (const id of ids) {
    const rule = await store.getJSON<AlertRule>(alertRuleKey(id));
    if (rule) rules.push(rule);
  }
  return rules;
}

// ---- Notification Schedule ----
const scheduleKey = (userId: number) => `user:${userId}:schedule`;

export async function getSchedule(store: Store, userId: number): Promise<NotificationSchedule | null> {
  return store.getJSON<NotificationSchedule>(scheduleKey(userId));
}
export async function setSchedule(store: Store, schedule: NotificationSchedule): Promise<void> {
  await store.setJSON(scheduleKey(schedule.user_id), schedule);
}

// ---- Alert Events ----
const alertEventKey = (eventId: string) => `event:${eventId}`;
const userEventsKey = (userId: number) => `user:${userId}:events`;
const alertsFiredKey = `alerts:fired`;

export async function createAlertEvent(store: Store, event: AlertEvent): Promise<void> {
  await store.setJSON(alertEventKey(event.id), event);
  await store.zadd(userEventsKey(event.user_id), event.timestamp, event.id);
  await store.zincrby(alertsFiredKey, 1, event.rule_id);
}
export async function getTopFiredAlerts(store: Store, count: number): Promise<{ rule_id: string; count: number }[]> {
  const entries = await store.zrevrangeWithScores(alertsFiredKey, 0, count - 1);
  return entries.map((e) => ({ rule_id: e.member, count: e.score }));
}

// ---- Aggregate stats for owner ----
export async function getTotalUserCount(store: Store): Promise<number> {
  // Count distinct user profile keys
  const keys = await store.client.keys("user:*:profile");
  return keys.length;
}
