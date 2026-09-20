const { createHash } = require('crypto');

const RANGE_BITS = 20; // range is 0 .. 2^30 - 1

export function hashKey(key) {
  const digest = createHash('md5').update(key).digest(); // 16 bytes
  const n = digest.readUInt32BE(0); // take the first 4 bytes as an unsigned 32-bit int
  return n >>> (32 - RANGE_BITS); // keep the top 30 bits
}

export function distributeRange(start, end, n) {
  if (n <= 1) {
    return [[start, end]];
  }

  let gap = parseInt((end - start) / n);

  let ranges = [];

  for (let i = start; i < end; i += gap) {
    ranges.push([i, i + gap]);
  }
  return ranges;
}
