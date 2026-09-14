const redis = require('redis');

const client = redis.createClient({
  host: 'localhost',
  port: 6379,
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

class RedisBloomFilter {
  key = null;
  error_rate = null;
  limit = null;

  constructor(type, false_negative_rate, expected_values) {
    this.key = type;
    this.error_rate = false_negative_rate;
    this.limit = expected_values;
  }

  async init() {
    try {
      await client.connect();
      await client.bf.reserve(this.key, this.error_rate, this.limit);
    } catch (error) {
      console.error('Error initializing Bloom filter:', error);
    }
  }

  async add(value) {
    if (!client.isOpen) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }

    const result = await client.bf.add(this.key, value);
    return result;
  }

  async addMany(values) {
    if (!client.isOpen) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }

    const result = await client.bf.madd(this.key, values);
    return result;
  }

  async existsMany(values) {
    if (!client.isOpen) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }

    const result = await client.bf.mexists(this.key, values);
    return result;
  }

  async exists(value) {
    if (!client.isOpen) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }

    const result = await client.bf.exists(this.key, value);
    return result;
  }

  async info() {
    if (!client.isOpen) {
      throw new Error('Bloom filter not initialized. Call init() first.');
    }

    const result = await client.bf.info(this.key);
    return result;
  }
}

module.exports = { RedisBloomFilter };
