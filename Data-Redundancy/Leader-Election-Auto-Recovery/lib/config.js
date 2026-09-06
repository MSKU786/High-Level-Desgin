// All the knobs live here. Tune these to make failures easier or harder to see.
module.exports = {
  // How many peer nodes the supervisor keeps alive. Ids are 1..NODE_COUNT.
  NODE_COUNT: 5,

  // Leader broadcasts a heartbeat this often.
  HEARTBEAT_INTERVAL: 500,

  // A follower declares the leader dead after this long without a heartbeat.
  // The jitter is per-node and randomised at startup so that all followers do
  // not time out on the exact same tick.
  ELECTION_TIMEOUT: 2000,
  ELECTION_TIMEOUT_JITTER: 500,

  // How often a follower checks its own heartbeat clock.
  MONITOR_INTERVAL: 200,

  // Delay before the supervisor brings a dead node back. Keep it larger than
  // ELECTION_TIMEOUT, otherwise the leader is replaced so fast that the
  // followers never notice it was gone.
  RESPAWN_DELAY: 3000,
  AUTO_RESPAWN: true,

  // Phase 2 (elections) uses these. Unused for now.
  ANSWER_TIMEOUT: 800,
  COORDINATOR_TIMEOUT: 2000,
};
