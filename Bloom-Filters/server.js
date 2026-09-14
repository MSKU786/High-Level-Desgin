const express = require('express');
const { RedisBloomFilter } = require('./redis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const bloomFilter = new RedisBloomFilter('my_bloom_filter', 0.01, 1000);

(async () => {
  await bloomFilter.init();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();
