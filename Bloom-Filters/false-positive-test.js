// Measures the real false positive rate of a Redis Bloom filter.
// Inserted names ("user_*") and probe names ("other_*") never overlap,
// so every "exists" for a probe name is a false positive.
//
// Usage: node false-positive-test.js [capacity] [errorRate] [probes]

const { RedisBloomFilter, disconnect } = require('./redis');

const CAPACITY = Number(process.argv[2]) || 10000;
const ERROR_RATE = Number(process.argv[3]) || 0.01;
const PROBES = Number(process.argv[4]) || 100000;

// Fill levels to measure at, as a multiple of capacity
const FILL_LEVELS = [0.1, 0.5, 1, 2, 5];

const names = (prefix, from, to) =>
  Array.from({ length: to - from }, (_, i) => `${prefix}_${from + i}`);

async function measure(filter) {
  const results = await filter.existsMany(names('other', 0, PROBES));
  const falsePositives = results.filter((r) => r.exists).length;
  return { falsePositives, rate: falsePositives / PROBES };
}

async function run(label, options) {
  const filter = new RedisBloomFilter(`fp_test_${label}`, ERROR_RATE, CAPACITY, options);
  await filter.reset();

  console.log(`\n=== ${label} | capacity ${CAPACITY}, target rate ${ERROR_RATE}, ${PROBES} probes ===`);
  const rows = [];
  let inserted = 0;

  for (const level of FILL_LEVELS) {
    const target = Math.round(CAPACITY * level);

    try {
      await filter.addMany(names('user', inserted, target));
      inserted = target;
    } catch (error) {
      // NONSCALING filters reject adds once full
      console.log(`Stopped at ${level}x capacity: ${error.message}`);
      break;
    }

    const { falsePositives, rate } = await measure(filter);
    const info = await filter.info();

    rows.push({
      fill: `${level}x`,
      inserted,
      falsePositives,
      measuredRate: rate.toFixed(4),
      targetRate: ERROR_RATE,
      subFilters: info.filters,
      sizeKB: (info.sizeBytes / 1024).toFixed(1),
    });
  }

  console.table(rows);
}

(async () => {
  try {
    await run('scaling');
    await run('nonscaling', { nonScaling: true });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
})();
