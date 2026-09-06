// Threads interleave their output, so every line carries the elapsed time, the
// node that wrote it, and that node's role. Without this the logs are unusable.

const RESET = '\x1b[0m';
const COLOR = {
  SUPERVISOR: '\x1b[35m',
  LEADER: '\x1b[32m',
  CANDIDATE: '\x1b[33m',
  FOLLOWER: '\x1b[36m',
  DOWN: '\x1b[90m',
};

function seconds(t0) {
  return ((Date.now() - t0) / 1000).toFixed(3).padStart(8);
}

// `context()` is read on every call, so the logger always reflects the current
// tag/role/epoch instead of whatever they were when the logger was created.
// It must return { t0, tag, role, epoch }.
function createLogger(context) {
  return function log(text) {
    const { t0, tag, role, epoch } = context();
    const color = COLOR[role] || '';
    const stamp = `[${seconds(t0)}s]`;
    const who = `[${String(tag).padEnd(10)}]`;
    const what = `[${String(role).padEnd(10)} e=${epoch}]`;
    console.log(`${color}${stamp} ${who} ${what} ${text}${RESET}`);
  };
}

module.exports = { createLogger, COLOR, RESET };
