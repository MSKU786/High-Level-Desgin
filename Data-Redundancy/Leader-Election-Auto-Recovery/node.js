// A peer node. It knows nothing about the supervisor's plans - it only reacts
// to messages from its peers and to its own timers.
//
// PHASE 1: the leader is statically the highest id in the roster. Followers do
// nothing but watch for missing heartbeats and shout when the leader dies.
// PHASE 2 replaces the static rule with a real bully election.

const { parentPort } = require('worker_threads');
const config = require('./lib/config');
const { SUPERVISOR, BROADCAST, TYPES, ROLES, message } = require('./lib/messages');
const { createLogger } = require('./lib/logger');

const state = {
  id: null,
  roster: [],
  role: ROLES.FOLLOWER,
  epoch: 0,
  leaderId: null,
  leaderMissing: false,
  lastHeartbeatAt: 0,
  electionTimeout: 0,
  t0: Date.now(),
};

let heartbeatTimer = null;
let monitorTimer = null;

const log = createLogger(() => ({
  t0: state.t0,
  tag: state.id === null ? 'node ?' : `node ${state.id}`,
  role: state.role,
  epoch: state.epoch,
}));

function send(to, type, payload = {}) {
  parentPort.postMessage(message(state.id, to, type, { epoch: state.epoch, ...payload }));
}

// Keeps the supervisor's status table in sync. Purely for observability - no
// part of the algorithm depends on it.
function report() {
  send(SUPERVISOR, TYPES.STATE_CHANGE, {
    role: state.role,
    leaderId: state.leaderId,
  });
}

function becomeLeader() {
  if (state.role === ROLES.LEADER) return;
  state.role = ROLES.LEADER;
  state.leaderId = state.id;
  state.leaderMissing = false;
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    send(BROADCAST, TYPES.HEARTBEAT);
  }, config.HEARTBEAT_INTERVAL);
  log('I am the leader - broadcasting heartbeats');
  report();
}

function becomeFollower(leaderId) {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  state.role = ROLES.FOLLOWER;
  state.leaderId = leaderId;
  state.lastHeartbeatAt = Date.now();
  report();
}

function onInit(msg) {
  state.id = msg.nodeId;
  state.roster = msg.roster;
  state.t0 = msg.t0;
  // Per-node jitter. Without it every follower times out on the same tick and
  // phase 2 turns into an election storm.
  state.electionTimeout =
    config.ELECTION_TIMEOUT + Math.floor(Math.random() * config.ELECTION_TIMEOUT_JITTER);
  state.lastHeartbeatAt = Date.now();

  log(`online - roster ${state.roster.join(',')}, election timeout ${state.electionTimeout}ms`);

  // PHASE 1 shortcut: highest id in the roster leads, no votes involved.
  const highest = Math.max(...state.roster);
  if (state.id === highest) {
    becomeLeader();
  } else {
    becomeFollower(null);
    log(`waiting for heartbeats from node ${highest}`);
  }

  monitorTimer = setInterval(checkLeaderLiveness, config.MONITOR_INTERVAL);
}

function onHeartbeat(msg) {
  if (state.role === ROLES.LEADER) return;
  state.lastHeartbeatAt = Date.now();

  if (state.leaderId !== msg.from || state.leaderMissing) {
    state.leaderMissing = false;
    state.leaderId = msg.from;
    log(`heartbeat from node ${msg.from} - following it`);
    report();
  }
}

// The failure detector. This is the whole point of phase 1: a node decides its
// leader is dead purely from local information - no one tells it.
function checkLeaderLiveness() {
  if (state.role === ROLES.LEADER) return;
  if (state.leaderMissing) return; // already reported, do not spam

  const silence = Date.now() - state.lastHeartbeatAt;
  if (silence <= state.electionTimeout) return;

  const lost = state.leaderId;
  state.leaderMissing = true;
  state.leaderId = null;
  log(`silence for ${silence}ms > ${state.electionTimeout}ms - leader ${lost === null ? '?' : lost} is DOWN`);
  log('phase 2 would start an election right here');
  report();
}

function shutdown() {
  clearInterval(heartbeatTimer);
  clearInterval(monitorTimer);
  process.exit(0);
}

parentPort.on('message', (msg) => {
  switch (msg.type) {
    case TYPES.INIT:
      return onInit(msg);
    case TYPES.HEARTBEAT:
      return onHeartbeat(msg);
    case TYPES.SHUTDOWN:
      return shutdown();
    default:
      log(`ignoring unknown message ${msg.type} from ${msg.from}`);
  }
});
