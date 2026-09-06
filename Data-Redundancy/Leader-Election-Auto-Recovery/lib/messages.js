// Every message on the wire has the same shape:
//   { from, to, type, epoch, ts, ...payload }
// `from` / `to` are node ids, or SUPERVISOR, or BROADCAST for `to`.

const SUPERVISOR = 'SUPERVISOR';
const BROADCAST = 'ALL';

const TYPES = {
  // supervisor -> node
  INIT: 'INIT',
  SHUTDOWN: 'SHUTDOWN',

  // node -> supervisor
  STATE_CHANGE: 'STATE_CHANGE',

  // node -> node
  HEARTBEAT: 'HEARTBEAT',

  // node -> node, phase 2 (bully election)
  ELECTION: 'ELECTION',
  ANSWER: 'ANSWER',
  COORDINATOR: 'COORDINATOR',
};

const ROLES = {
  FOLLOWER: 'FOLLOWER',
  CANDIDATE: 'CANDIDATE',
  LEADER: 'LEADER',
};

function message(from, to, type, payload = {}) {
  return { from, to, type, epoch: 0, ts: Date.now(), ...payload };
}

module.exports = { SUPERVISOR, BROADCAST, TYPES, ROLES, message };
