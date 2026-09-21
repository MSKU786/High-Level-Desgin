const { createHash } = require('crypto');

const RANGE_BITS = 20;
const RING_SIZE = 2 ** RANGE_BITS; // 1,048,576 — the ONLY definition of the space

// Maps any key onto a point in [0, RING_SIZE).
// Truncating the top bits (rather than `% RING_SIZE`) keeps the distribution
// unbiased, because RING_SIZE divides 2^32 exactly.
function hashKey(key) {
  const digest = createHash('md5').update(String(key)).digest();
  const n = digest.readUInt32BE(0);
  return n >>> (32 - RANGE_BITS);
}

module.exports = { hashKey, RANGE_BITS, RING_SIZE };
