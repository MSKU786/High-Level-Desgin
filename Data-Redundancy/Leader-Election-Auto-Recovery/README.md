# Leader Election & Auto-Recovery

A supervisor thread keeps N peer nodes (worker threads) alive. One of them is the
leader; the rest follow it. The supervisor restarts whatever dies.

    npm start

## Roles

| | |
|---|---|
| `main.js` | **Supervisor.** Spawns nodes, relays messages between them, respawns the dead. Never decides who leads. |
| `node.js` | **Peer node.** Leader broadcasts heartbeats; followers watch for their absence. |

Worker threads live inside the supervisor's process - if the supervisor dies they
all die with it, so a worker can never be promoted to supervisor. That needs
child processes instead of threads (phase 5).

## Commands (type into the running process)

```
status                 print every node's role, epoch and who it thinks leads
kill <id> | kill leader   terminate a node; the supervisor brings it back
pause <id> [ms]        partition a node - it keeps running, its traffic is dropped
resume <id>            end the partition early
respawn on|off         stop the supervisor from reviving dead nodes
quit
```

## Phase 1 (this code)

The leader is **statically the highest id** - there is no election yet. What is
real is the **failure detector**: each follower decides on its own, from nothing
but a local clock and missing heartbeats, that the leader is gone.

Try:

- `kill leader` - every follower reports the leader DOWN after its own timeout,
  then the supervisor respawns node 5 and they fall back in line.
- `kill 2` - a follower dies and returns. Nobody else reacts. Correct.
- `pause 5 6000` - followers declare the leader dead while the leader itself
  still believes it leads. That disagreement is what phase 3's epochs fix.

Each node picks a random timeout in `[ELECTION_TIMEOUT, +JITTER)` at startup, so
they never all time out on the same tick. Set `ELECTION_TIMEOUT_JITTER: 0` in
`lib/config.js` to see why that matters once elections exist.

## Next phases

2. Replace the static rule with the **bully algorithm** (`ELECTION` / `ANSWER` /
   `COORDINATOR` are already declared in `lib/messages.js`).
3. **Epochs** - every message carries one, stale ones are ignored. Stops the
   returning partitioned leader from causing split brain.
4. Give the leader **exclusive work** (append to `work.log`), plus a `verify.js`
   that fails if one epoch ever contains two different node ids.
5. Swap worker threads for `child_process.fork()` so the peers survive the
   supervisor and can elect a replacement for it.
