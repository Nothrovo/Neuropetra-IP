/**
 * Lightweight in-memory token bucket rate limiter for API routes.
 */

interface RateLimitRecord {
  tokens: number;
  lastRefill: number;
}

const store = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  identifier: string,
  capacity: number = 60,
  fillPerSecond: number = 1
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = store.get(identifier) || { tokens: capacity, lastRefill: now };

  // Calculate tokens to add since last refill
  const elapsedSeconds = (now - record.lastRefill) / 1000;
  record.tokens = Math.min(capacity, record.tokens + elapsedSeconds * fillPerSecond);
  record.lastRefill = now;

  if (record.tokens >= 1) {
    record.tokens -= 1;
    store.set(identifier, record);
    return { allowed: true, remaining: Math.floor(record.tokens) };
  }

  store.set(identifier, record);
  return { allowed: false, remaining: 0 };
}
