const { ConsistentHashRing } = require('./ring');
const { hashKey, RING_SIZE } = require('./utils');

const KEYS = Array.from({ length: 10000 }, (_, i) => `user:${i}`);
const pct = (x) => (x * 100).toFixed(1) + '%';

function report(ring, label) {
  console.log(`\n${label}`);
  let sum = 0;
  for (const n of ring.ring) {
    sum += ring.shareOf(n);
    console.log(
      `  ${n.id.padEnd(10)} pos=${String(n.pos).padStart(7)}  ` +
        `owns ${pct(ring.shareOf(n)).padStart(6)} of ring  ` +
        `holds ${String(n.store.size).padStart(5)} keys`
    );
  }
  console.log(`  arcs sum to ${pct(sum)}  <- must be 100.0%`);
}

// --- invariant: every key is findable, and lives on exactly one node --------
function checkNoKeyLost(ring, keys) {
  let missing = 0,
    duplicated = 0;
  for (const k of keys) {
    const holders = ring.ring.filter((n) => n.store.has(k));
    if (holders.length === 0) missing++;
    if (holders.length > 1) duplicated++;
    if (holders.length === 1 && ring.findNode(k) !== holders[0]) missing++; // stored somewhere unreachable
  }
  console.log(`  integrity: ${missing} unreachable, ${duplicated} duplicated`);
}

const ring = new ConsistentHashRing(['server-1', 'server-2', 'server-3']);
for (const k of KEYS) ring.set(k, k.toUpperCase());

report(ring, 'EXPERIMENT 1 - balance with 3 nodes, 10k keys');
checkNoKeyLost(ring, KEYS);

// --- experiment 2: add a node, count what moved ----------------------------
const before = new Map(KEYS.map((k) => [k, ring.findNode(k).id]));
ring.addNode('server-4');
let moved = 0;
for (const k of KEYS) if (ring.findNode(k).id !== before.get(k)) moved++;

report(ring, 'EXPERIMENT 2 - after adding server-4');
checkNoKeyLost(ring, KEYS);
console.log(`  keys that changed owner: ${moved} (${pct(moved / KEYS.length)})`);

// the naive alternative, for contrast
let modMoved = 0;
for (const k of KEYS) if (hashKey(k) % 3 !== hashKey(k) % 4) modMoved++;
console.log(`  same change under hash(key) %% N: ${modMoved} (${pct(modMoved / KEYS.length)})`);

// --- experiment 3: remove a node -------------------------------------------
const victim = ring.ring.find((n) => n.id === 'server-3');
const successorId = ring._successorOf(victim).id;
const hadKeys = victim.store.size;
ring.removeNode('server-3');

report(ring, 'EXPERIMENT 3 - after removing server-3');
checkNoKeyLost(ring, KEYS);
console.log(`  server-3 held ${hadKeys} keys; all went to its successor ${successorId}`);

// --- experiment 4: values survive membership churn -------------------------
const sample = ['user:0', 'user:4999', 'user:9999'];
console.log('\nEXPERIMENT 4 - values after all that churn');
for (const k of sample) {
  console.log(`  ${k} -> ${ring.findNode(k).id}  value=${ring.get(k)}`);
}
