const { client } = require('./redis');

/*
  Leaky Bucket (as a meter)

  Each key has a bucket that holds at most `capacity` units of water.
  Every request pours in 1 unit. Water leaks out at a constant `leakRatePerSec`.
  If adding a request would overflow the bucket, the request is rejected.

  This smooths traffic to a steady rate: short bursts up to `capacity` are
  allowed, but the long-run rate can never go above `leakRatePerSec`.

  We don't need a background job to drain the bucket. On each request we work
  out how much has leaked since the last request:
      level = max(0, level - (now - lastTs) * leakRate)

  State per key (a Redis hash): { level, ts }

  Why Lua: read -> compute -> write must be atomic. Otherwise two instances
  can both read the same level and both let a request through (the same race
  as the fixed-window bug). Redis runs a script as a single atomic step.

  Why Redis TIME instead of Date.now(): every app instance then uses the same
  clock, so clock skew between servers can't corrupt the leak calculation.
*/

const LEAKY_BUCKET_SCRIPT = `
  local key       = KEYS[1]
  local capacity  = tonumber(ARGV[1])
  local leakPerMs = tonumber(ARGV[2])

  local t   = redis.call('TIME')
  local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

  local data  = redis.call('HMGET', key, 'level', 'ts')
  local level = tonumber(data[1]) or 0
  local ts    = tonumber(data[2]) or now

  -- drain whatever leaked out since the last request
  level = math.max(0, level - (now - ts) * leakPerMs)

  local allowed = 0
  if level + 1 <= capacity then
    level = level + 1
    allowed = 1
  end

  redis.call('HSET', key, 'level', tostring(level), 'ts', tostring(now))
  -- drop the key once the bucket would be empty anyway
  redis.call('PEXPIRE', key, math.max(1, math.ceil(level / leakPerMs)))

  return allowed
`;

class LeakyBucketLimiter {
  constructor(capacity = 10, leakRatePerSec = 1) {
    this.capacity = capacity;
    this.leakPerMs = leakRatePerSec / 1000;
  }

  async isRateLimited(key) {
    const allowed = await client.eval(LEAKY_BUCKET_SCRIPT, {
      keys: [`lb:${key}`],
      arguments: [String(this.capacity), String(this.leakPerMs)],
    });

    return allowed === 0;
  }
}

module.exports = { LeakyBucketLimiter };
