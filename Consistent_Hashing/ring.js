const { hashKey, RING_SIZE } = require('./utils');

/**
 * Consistent hashing over a circular space [0, RING_SIZE).
 *
 * A node is a SERVER: { id, pos, store }
 *   id    - its identity (what you would send a request to)
 *   pos   - where it sits on the ring, COMPUTED as hashKey(id), never assigned
 *   store - its local storage, keyed by the real key (the hash is only routing)
 *
 * Ownership is derived, not stored: a key belongs to the first node clockwise
 * from hashKey(key), wrapping past the top of the ring back to the first node.
 */
class ConsistentHashRing {
  constructor(nodeIds = []) {
    this.ring = []; // always sorted by pos
    for (const id of nodeIds) this.addNode(id);
  }

  // ---- routing -----------------------------------------------------------

  /** The node that owns `key`. This is the whole algorithm. */
  findNode(key) {
    const h = hashKey(key);
    return this.ring.find((n) => n.pos >= h) ?? this.ring[0]; // ?? is the wrap
  }

  // ---- key/value ---------------------------------------------------------

  set(key, value) {
    this.findNode(key).store.set(key, value);
    return this;
  }

  get(key) {
    const { store } = this.findNode(key);
    return store.has(key) ? store.get(key) : null; // `has` so a stored 0/'' survives
  }

  delete(key) {
    return this.findNode(key).store.delete(key);
  }

  // ---- membership --------------------------------------------------------

  addNode(id) {
    const node = { id, pos: hashKey(id), store: new Map() };

    const at = this.ring.findIndex((n) => n.pos > node.pos);
    if (at === -1) this.ring.push(node);
    else this.ring.splice(at, 0, node);

    // Everything the new node now owns was, a moment ago, owned by its
    // successor -- so that is the only node we have to talk to.
    const successor = this._successorOf(node);
    if (successor && successor !== node) {
      for (const [k, v] of successor.store) {
        if (this.findNode(k) === node) {
          node.store.set(k, v);
          successor.store.delete(k);
        }
      }
    }
    return node;
  }

  removeNode(id) {
    const at = this.ring.findIndex((n) => n.id === id);
    if (at === -1) return null;

    const [node] = this.ring.splice(at, 1);

    // After the splice, index `at` IS the successor (wrapping if it was last).
    const successor = this.ring.length ? this.ring[at % this.ring.length] : null;
    if (successor) {
      for (const [k, v] of node.store) successor.store.set(k, v);
      node.store.clear();
    }
    return node;
  }

  _successorOf(node) {
    const at = this.ring.indexOf(node);
    return this.ring[(at + 1) % this.ring.length];
  }

  // ---- introspection (the range still exists -- you just never stored it) --

  /** Width of the arc `node` owns, as a fraction of the whole ring. */
  shareOf(node) {
    if (this.ring.length === 1) return 1;
    const at = this.ring.indexOf(node);
    const prev = this.ring[(at - 1 + this.ring.length) % this.ring.length];
    return ((node.pos - prev.pos + RING_SIZE) % RING_SIZE) / RING_SIZE;
  }

  /** The derived range, for eyeballing: node owns (prevPos, pos]. */
  arcOf(node) {
    if (this.ring.length === 1) return [0, RING_SIZE - 1];
    const at = this.ring.indexOf(node);
    const prev = this.ring[(at - 1 + this.ring.length) % this.ring.length];
    return [(prev.pos + 1) % RING_SIZE, node.pos];
  }
}

module.exports = { ConsistentHashRing };
