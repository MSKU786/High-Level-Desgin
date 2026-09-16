const redis = require('redis');

const CHUNK_SIZE = 1000;

// host/port at the top level are ignored since node-redis v4, use url instead
const client = redis.createClient({
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

function chunk(values, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

class RedisBloomFilter {
  key = null;
  errorRate = null;
  capacity = null;
  nonScaling = false;
  ready = false;

  constructor(key, errorRate, capacity, { nonScaling = false } = {}) {
    this.key = key;
    this.errorRate = errorRate;
    this.capacity = capacity;
    this.nonScaling = nonScaling;
  }

  async init() {
    // Connection failures should stop startup, so this is outside the try
    await connect();

    try {
      await client.bf.reserve(this.key, this.errorRate, this.capacity, {
        NONSCALING: this.nonScaling,
      });
    } catch (error) {
      // Filter survives restarts; any other error is a real problem
      if (!error.message.includes('item exists')) {
        throw error;
      }
      console.log(`Bloom filter "${this.key}" already exists, reusing it`);
    }

    this.ready = true;
    return this;
  }

  // Deletes and recreates the filter so experiments start from empty
  async reset() {
    await connect();
    await client.del(this.key);
    this.ready = false;
    return this.init();
  }

  #ensureReady() {
    if (!this.ready) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }
  }

  async add(value) {
    this.#ensureReady();
    return client.bf.add(this.key, value);
  }

  async exists(value) {
    this.#ensureReady();
    return client.bf.exists(this.key, value);
  }

  // Returns [{ item, added }] in the same order as values
  async addMany(values) {
    this.#ensureReady();
    const results = [];

    for (const part of chunk(values)) {
      const replies = await client.bf.mAdd(this.key, part);

      // BF.MADD reports per-item errors (e.g. non scaling filter is full)
      // inside the array instead of failing the whole command
      const failed = replies.findIndex((reply) => reply instanceof Error);
      if (failed !== -1) {
        throw new Error(
          `Failed adding "${part[failed]}" (item ${results.length + failed + 1} of this call): ${replies[failed].message}`,
        );
      }

      part.forEach((item, i) => results.push({ item, added: Boolean(replies[i]) }));
    }

    return results;
  }

  // Returns [{ item, exists }] in the same order as values
  async existsMany(values) {
    this.#ensureReady();
    const results = [];

    for (const part of chunk(values)) {
      const replies = await client.bf.mExists(this.key, part);
      part.forEach((item, i) => results.push({ item, exists: Boolean(replies[i]) }));
    }

    return results;
  }

  // BF.INFO does not return the error rate, so it comes from this instance
  async info() {
    this.#ensureReady();
    const info = await client.bf.info(this.key);
    const items = Number(info['Number of items inserted']);

    return {
      key: this.key,
      capacity: Number(info['Capacity']),
      items,
      fill: items / this.capacity,
      configuredErrorRate: this.errorRate,
      sizeBytes: Number(info['Size']),
      filters: Number(info['Number of filters']),
      expansionRate: Number(info['Expansion rate']),
    };
  }
}

module.exports = { RedisBloomFilter, connect, disconnect };
