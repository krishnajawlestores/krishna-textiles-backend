import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  createdAt: number;
  sizeBytes: number;
}

@Injectable()
export class CustomCacheService {
  private readonly logger = new Logger(CustomCacheService.name);
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private lastFlushedAt: Date | null = null;

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  async set<T = any>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    const serialized = JSON.stringify(value);
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8');

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      createdAt: Date.now(),
      sizeBytes,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async invalidatePrefix(prefix: string): Promise<number> {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.logger.log(`Invalidated ${count} cache entries.`);
    return count;
  }

  async flushAll(): Promise<void> {
    const total = this.store.size;
    this.store.clear();
    this.lastFlushedAt = new Date();
    this.logger.log(`Flushed entire cache (${total} keys cleared)`);
  }

  getMetrics() {
    const now = Date.now();
    let totalBytes = 0;
    const activeKeys: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (now <= entry.expiresAt) {
        totalBytes += entry.sizeBytes;
        activeKeys.push(key);
      } else {
        this.store.delete(key);
      }
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(1) + '%' : '0%';

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      totalKeys: activeKeys.length,
      estimatedMemoryKb: (totalBytes / 1024).toFixed(2),
      lastFlushedAt: this.lastFlushedAt,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  getKeys(): Array<{ key: string; ttlRemaining: number; sizeBytes: number; createdAt: Date }> {
    const now = Date.now();
    const result: Array<{ key: string; ttlRemaining: number; sizeBytes: number; createdAt: Date }> = [];

    for (const [key, entry] of this.store.entries()) {
      if (now <= entry.expiresAt) {
        result.push({
          key,
          ttlRemaining: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
          sizeBytes: entry.sizeBytes,
          createdAt: new Date(entry.createdAt),
        });
      } else {
        this.store.delete(key);
      }
    }

    return result;
  }
}
