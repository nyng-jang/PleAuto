// 저장소: Upstash Redis 환경변수가 있으면 Redis, 없으면 메모리(로컬 시연용)
import { Redis } from "@upstash/redis";

type Store = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  /** 키가 없을 때만 저장. 저장했으면 true */
  setIfAbsent(key: string, value: unknown, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** 읽고 바로 지움 (일회용 코드용) */
  take<T>(key: string): Promise<T | null>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
};

function redisStore(redis: Redis): Store {
  return {
    async get<T>(key: string) {
      return (await redis.get<T>(key)) ?? null;
    },
    async set(key, value, ttlSec) {
      if (ttlSec) await redis.set(key, value, { ex: ttlSec });
      else await redis.set(key, value);
    },
    async setIfAbsent(key, value, ttlSec) {
      return (await redis.set(key, value, { ex: ttlSec, nx: true })) === "OK";
    },
    async del(key) {
      await redis.del(key);
    },
    async take<T>(key: string) {
      return (await redis.getdel<T>(key)) ?? null;
    },
    async sadd(key, member) {
      await redis.sadd(key, member);
    },
    async srem(key, member) {
      await redis.srem(key, member);
    },
    async smembers(key) {
      return await redis.smembers(key);
    },
  };
}

function memoryStore(): Store {
  const data = new Map<string, { v: unknown; exp?: number }>();
  const live = (key: string) => {
    const e = data.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp < Date.now()) {
      data.delete(key);
      return undefined;
    }
    return e;
  };
  const clone = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
  return {
    async get<T>(key: string) {
      const e = live(key);
      return e ? clone<T>(e.v) : null;
    },
    async set(key, value, ttlSec) {
      data.set(key, { v: clone(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
    },
    async setIfAbsent(key, value, ttlSec) {
      if (live(key)) return false;
      data.set(key, { v: clone(value), exp: Date.now() + ttlSec * 1000 });
      return true;
    },
    async del(key) {
      data.delete(key);
    },
    async take<T>(key: string) {
      const e = live(key);
      data.delete(key);
      return e ? clone<T>(e.v) : null;
    },
    async sadd(key, member) {
      const s = new Set((live(key)?.v as string[]) ?? []);
      s.add(member);
      data.set(key, { v: [...s] });
    },
    async srem(key, member) {
      const s = new Set((live(key)?.v as string[]) ?? []);
      s.delete(member);
      data.set(key, { v: [...s] });
    },
    async smembers(key) {
      return [...((live(key)?.v as string[]) ?? [])];
    },
  };
}

const g = globalThis as unknown as { __store?: Store };

export function store(): Store {
  if (!g.__store) {
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    g.__store = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  }
  return g.__store;
}

export const keys = {
  plan: (phoneId: string) => `plan:${phoneId}`,
  code: (code: string) => `code:${code}`, // → { phoneId }, 180초
  phoneCode: (phoneId: string) => `phonecode:${phoneId}`, // 폰의 현재 코드
  request: (reqId: string) => `req:${reqId}`, // 차량 연결 요청
  phoneRequest: (phoneId: string) => `phonereq:${phoneId}`, // 폰이 기다리는 요청 id
  conn: (token: string) => `conn:${token}`, // 승인된 차량 연결
  phoneConns: (phoneId: string) => `phoneconns:${phoneId}`,
};

export type PairRequest = {
  id: string;
  phoneId: string;
  vehicleName: string;
  status: "pending" | "approved" | "rejected";
  vehicleToken?: string;
  createdAt: number;
};

export type Connection = { token: string; phoneId: string; vehicleName: string; createdAt: number };
