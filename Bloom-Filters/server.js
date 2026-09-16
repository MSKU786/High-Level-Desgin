const express = require('express');
const { RedisBloomFilter } = require('./redis');

const app = express();
app.use(express.json());

// Stands in for the real database: the source of truth the filter is checked against
const usernameMap = new Map();
let falsePositiveCount = 0;
let checkCount = 0;
const PORT = process.env.PORT || 3000;

const bloomFilter = new RedisBloomFilter('username', 0.01, 10000);

app.post('/add', async (req, res) => {
  const { username } = req.body;
  try {
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Rate denominator is names that truly don't exist; real duplicates can't be false positives
    if (!usernameMap.has(username)) {
      checkCount++;
    }
    const exist = await bloomFilter.exists(username);

    if (exist) {
      if (usernameMap.has(username)) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      // Filter said "maybe" but the source of truth says no: false positive.
      // Without this check the user would be wrongly rejected.
      falsePositiveCount++;
      console.log('False positive:', username, '| count:', falsePositiveCount);
    }

    await bloomFilter.add(username);
    usernameMap.set(username, true);
    res.status(201).json({ message: 'Username added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/add-many', async (req, res) => {
  const { usernames } = req.body;
  try {
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'usernames must be a non-empty array' });
    }

    const results = await bloomFilter.addMany(usernames);
    usernames.forEach((username) => usernameMap.set(username, true));
    res.status(201).json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/exists', async (req, res) => {
  const { value } = req.query;

  try {
    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const exist = await bloomFilter.exists(value);
    res.status(200).json({ exists: exist });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/exists-many', async (req, res) => {
  const { values } = req.body;

  try {
    if (!Array.isArray(values) || values.length === 0) {
      return res.status(400).json({ error: 'values must be a non-empty array' });
    }

    const results = await bloomFilter.existsMany(values);
    res.status(200).json({ results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/info', async (_req, res) => {
  try {
    const info = await bloomFilter.info();
    res.status(200).json({
      ...info,
      checks: checkCount,
      falsePositives: falsePositiveCount,
      observedFalsePositiveRate: checkCount ? falsePositiveCount / checkCount : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

(async () => {
  await bloomFilter.init();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();
