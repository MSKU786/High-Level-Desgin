const { distributeRange, hashKey } = require('./utils');

class ConsistentHash {
  size = null;
  mapArray = null;

  constructor(size, n) {
    this.size = size;
    this.mapArray = new Array(n).fill(null);
    this.init(n);
  }

  init(n) {
    const ranges = distributeRange(0, this.size, n);
    for (let i = 0; i < n; i++) {
      this.mapArray[i] = {
        range: ranges[i],
        map: new Map(),
      };
    }
  }

  assignValue(key, value) {
    const hashvalue = hashKey(key);
    const map = this.findServer(hashvalue);
    map.set(hashKey, value);
  }

  findServer(val) {
    for (let i of this.mapArray) {
      const { range, map } = i;
      if (val >= range[0] && val < range[1]) {
        return map;
      }
    }
  }

  deleteValue(key) {
    const hashvalue = hashKey(key);
    const map = this.findServer(hashvalue);
    map.delete(hashvalue);
  }

  getValue(key) {
    const hashvalue = hashKey(key);
    const map = this.findServer(hashvalue);
    return map.get(hashvalue) || null;
  }

  assignServer() {
    const { index, server } = this._findBusiestServer();

    const [startN, endN] = [
      server.range[0],
      (server.range[0] + server.map.size) / 2,
    ];
    const newServer = {
      range: [startN, endN],
      map: new Map(),
    };

    this._reassignValue(newServer, server, startN, endN);
    server.range[0] = endN + 1;
    this.mapArray.splice(index - 1, newServer);
  }

  _reassignValue(s1, s2, startN, endN) {
    for (let i = startN; i <= endN; i++) {
      if (s2.map.has(i)) {
        s1.set(i, s2.map.get(i));
        s2.map.delete(i);
      }
    }
  }

  _findBusiestServer() {
    let server = null,
      index = 0;

    for (let i = 0; i < this.mapArray.length; i++) {
      let currentS = this.mapArray[i];
      if (server == null) {
        server = currentS;
        index = i;
        continue;
      }

      if (currentS.map.size > server.map.size) {
        server = currentS;
        index = i;
      }
    }

    return { index, server };
  }

  deleteServer(index) {}
}
