const { createClient } = require('redis');

// host/port at the top level are ignored since node-redis v4, use url instead
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err) => {
  console.log('Redis error:', err);
});

async function connect() {
  if (!client.isOpen) {
    await client.connect();
  }
}

async function disconnect() {
  if (client.isOpen) {
    await client.quit();
  }
}

// class FixSizeLimiter {
//   maxLimit = null;
//   expiresIn = null;

//   constructor(maxLimit = 100, expiresIn = 60000) {
//     this.maxLimit = maxLimit;
//     this.expiresIn = expiresIn;
//   }

//   async isRateLimited(key) {
//     const exist = await client.exists(key);

//     if (!exist) {
//       client.set(key, 1, {
//         PX: this.expiresIn,
//       });
//       return;
//     }

//     const value = await client.get(key);

//     if (value < this.maxLimit) {
//       client.set(key, value + 1);
//       return;
//     }

//     throw new Error('Limit Reached');
//   }
// }

/*
  Bugs with above approach

  Bugs

value + 1 joins strings instead of adding. Redis GET returns a string, so "1" + 1 gives "11", then "111". The < check converts to a number, so the key blocks after about 3 requests, not 100.

The second SET removes the TTL. A plain SET key value without PX or KEEPTTL clears the expiry. After the second request the key never expires, so once a client hits the limit it stays blocked forever.

Concurrent requests can both get through (the main problem for a service-level limiter). EXISTS, then GET, then SET are three separate round trips. Two service instances, or two concurrent requests, can both read 99, both pass the check, and both write 100, so updates are lost and you let through more than the limit. Rate limiting across multiple instances only works if the update is atomic. That means INCR, a MULTI transaction, or a Lua script.

The set() calls aren't awaited. Errors from them go unhandled, and the next request can read before the write has finished.

The key can expire between EXISTS and GET. Then GET returns null, and the code writes a new value with no TTL.

*/

class FixedWindowLimiter {
  constructor(maxLimit = 100, windowMs = 60_000) {
    this.maxLimit = maxLimit;
    this.windowMs = windowMs;
  }

  async isRateLimited(key) {
    // One counter per window: rl:<key>:<windowIndex>
    const windowId = Math.floor(Date.now() / this.windowMs);
    const redisKey = `rl:${key}:${windowId}`;

    // INCR + PEXPIRE run atomically in one round trip
    const [count] = await client
      .multi()
      .incr(redisKey)
      .pExpire(redisKey, this.windowMs)
      .exec();

    return count > this.maxLimit;
  }
}

module.exports = { FixedWindowLimiter };
