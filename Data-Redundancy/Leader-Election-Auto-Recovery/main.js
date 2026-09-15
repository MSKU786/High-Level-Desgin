// The supervisor.
//
// It is deliberately dumb about the algorithm: it spawns nodes, relays their
// messages, and restarts whatever dies. It never decides who the leader is -
// that has to come out of the nodes themselves, otherwise there is no election
// happening at all.
//
// Note: worker threads live inside this process. If the supervisor dies, they
// all die with it. Promoting a worker to supervisor needs child processes, not
// threads - that is the phase 5 variant.

const path = require('path');
const readline = require('readline');
const { Worker } = require('worker_threads');
const config = require('./lib/config');
const {
  SUPERVISOR,
  BROADCAST,
  TYPES,
  ROLES,
  message,
} = require('./lib/messages');
const { createLogger } = require('./lib/logger');

const T0 = Date.now();
const log = createLogger(() => ({
  t0: T0,
  tag: 'supervisor',
  role: 'SUPERVISOR',
  epoch: '-',
}));

const ROSTER = Array.from({ length: config.NODE_COUNT || 3 }, (_, i) => i + 1);
const nodes = new Map(); // id -> record

let shuttingDown = false;
let autoRespawn = config.AUTO_RESPAWN;

function spawnNode(id) {
  const worker = new Worker(path.join(__dirname, 'node.js'));

  const record = {
    id,
    worker,
    alive: true,
    partitioned: false,
    role: ROLES.FOLLOWER,
    epoch: 0,
    leaderId: null,
    spawnedAt: Date.now(),
  };
  nodes.set(id, record);

  worker.on('message', route);
  worker.on('error', (err) => log(`node ${id} threw: ${err.message}`));
  worker.on('exit', (code) => onNodeExit(id, code));

  worker.postMessage(
    message(SUPERVISOR, id, TYPES.INIT, { nodeId: id, roster: ROSTER, t0: T0 }),
  );

  log(`spawned node ${id}`);
}

// A relay, nothing more. It does not read election semantics - it only knows
// how to deliver an envelope, and how to drop traffic for a partitioned node.
function route(msg) {
  if (msg.to === SUPERVISOR) return onNodeReport(msg);

  const sender = nodes.get(msg.from);
  if (sender && sender.partitioned) return;

  const targets =
    msg.to === BROADCAST ? ROSTER.filter((id) => id !== msg.from) : [msg.to];

  for (const id of targets) {
    const target = nodes.get(id);
    if (!target || !target.alive || target.partitioned) continue;
    target.worker.postMessage(msg);
  }
}

function onNodeReport(msg) {
  const record = nodes.get(msg.from);
  if (!record) return;
  if (msg.type !== TYPES.STATE_CHANGE) return;

  record.role = msg.role;
  record.epoch = msg.epoch;
  record.leaderId = msg.leaderId;
}

function onNodeExit(id, code) {
  const record = nodes.get(id);
  if (record) {
    record.alive = false;
    record.role = 'DOWN';
    record.leaderId = null;
  }
  log(`node ${id} exited (code ${code})`);

  if (shuttingDown) return;
  if (!autoRespawn) {
    log(`auto-respawn is off - node ${id} stays down`);
    return;
  }

  log(`bringing node ${id} back in ${config.RESPAWN_DELAY}ms`);
  setTimeout(() => {
    if (!shuttingDown) spawnNode(id);
  }, config.RESPAWN_DELAY);
}

/* ------------------------------- operator CLI ------------------------------ */

function currentLeaderId() {
  for (const record of nodes.values()) {
    if (record.alive && record.role === ROLES.LEADER) return record.id;
  }
  return null;
}

function killNode(id) {
  const record = nodes.get(id);
  if (!record || !record.alive) return log(`node ${id} is not running`);
  log(`killing node ${id}`);
  record.worker.terminate();
}

// Simulates a partition, not a crash: the node keeps running and keeps its
// timers, but none of its traffic reaches anyone. This is how you reproduce the
// "old leader comes back and still thinks it leads" case that epochs fix.
function partitionNode(id, ms) {
  const record = nodes.get(id);
  if (!record || !record.alive) return log(`node ${id} is not running`);
  record.partitioned = true;
  log(`node ${id} is now partitioned for ${ms}ms`);
  setTimeout(() => {
    const current = nodes.get(id);
    if (current && current.alive) {
      current.partitioned = false;
      log(`node ${id} rejoined the network`);
    }
  }, ms);
}

function printStatus() {
  const rows = ROSTER.map((id) => {
    const r = nodes.get(id);
    if (!r) return `  ${String(id).padEnd(4)} ${'(missing)'.padEnd(12)}`;
    const state = !r.alive
      ? 'DOWN'
      : r.partitioned
        ? `${r.role} (cut off)`
        : r.role;
    const leader = r.leaderId === null ? '-' : String(r.leaderId);
    return `  ${String(id).padEnd(4)} ${state.padEnd(20)} ${String(r.epoch).padEnd(7)} ${leader}`;
  });

  console.log('');
  console.log(
    `  ${'ID'.padEnd(4)} ${'ROLE'.padEnd(20)} ${'EPOCH'.padEnd(7)} BELIEVES LEADER IS`,
  );
  console.log(`  ${'-'.repeat(58)}`);
  rows.forEach((row) => console.log(row));
  console.log(
    `  auto-respawn: ${autoRespawn ? 'on' : 'off'}   leader: ${currentLeaderId() ?? 'none'}`,
  );
  console.log('');
}

function handleCommand(line) {
  const [cmd, ...args] = line.trim().split(/\s+/);

  switch (cmd) {
    case '':
      return;
    case 'status':
      return printStatus();
    case 'kill': {
      const target = args[0] === 'leader' ? currentLeaderId() : Number(args[0]);
      if (!target) return log('usage: kill <id> | kill leader');
      return killNode(target);
    }
    case 'pause': {
      const id = Number(args[0]);
      const ms = Number(args[1]) || 3000;
      if (!id) return log('usage: pause <id> [ms]');
      return partitionNode(id, ms);
    }
    case 'resume': {
      const record = nodes.get(Number(args[0]));
      if (!record) return log('usage: resume <id>');
      record.partitioned = false;
      return log(`node ${record.id} rejoined the network`);
    }
    case 'respawn':
      autoRespawn = args[0] !== 'off';
      return log(`auto-respawn ${autoRespawn ? 'on' : 'off'}`);
    case 'quit':
    case 'exit':
      return shutdown();
    default:
      return log(`unknown command: ${cmd}`);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down');
  for (const record of nodes.values()) {
    if (record.alive) record.worker.terminate();
  }
  setTimeout(() => process.exit(0), 200);
}

/* --------------------------------- startup -------------------------------- */

log(`starting ${config.NODE_COUNT} nodes`);
log(
  `heartbeat ${config.HEARTBEAT_INTERVAL}ms, election timeout ${config.ELECTION_TIMEOUT}ms (+jitter), respawn delay ${config.RESPAWN_DELAY}ms`,
);
log(
  'commands: status | kill <id> | kill leader | pause <id> [ms] | resume <id> | respawn on|off | quit',
);

ROSTER.forEach(spawnNode);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
});
rl.on('line', handleCommand);
rl.on('SIGINT', shutdown);
process.on('SIGINT', shutdown);
