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

module.exports = { client };
