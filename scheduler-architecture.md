# Scheduler Architecture

## 1. System Overview

```
┌──────────────────────────────────────────────────────┐
│                     VPS (Nuxt/Nitro)                  │
│                                                        │
│  ┌─────────────────┐        ┌──────────────────────┐  │
│  │  Nitro Plugin   │        │     SQLite DB        │  │
│  │  scheduler.ts   │◄──────►│                      │  │
│  │                 │        │  monitors            │  │
│  │  setInterval    │        │  ├─ next_check_at    │  │
│  │  (every 5s)     │        │  ├─ last_checked_at  │  │
│  └────────┬────────┘        │  └─ last_status      │  │
│           │                  │                      │  │
│           │ claims due        │  heartbeats          │  │
│           │ monitors          │  └─ region           │  │
│           ▼                  └──────────────────────┘  │
│  ┌─────────────────┐                                   │
│  │   runCheck()    │                                   │
│  │  (async, fire   │                                   │
│  │   & handle)     │                                   │
│  └────────┬────────┘                                   │
│           │                                            │
└───────────┼────────────────────────────────────────────┘
            │ HTTP POST /check
            ▼
┌───────────────────────────┐
│   uptime-agent (Lambda)   │
│   Stateless worker        │
│   performs HTTP/TCP check │
│   returns result + region │
└───────────────────────────┘
```

---

## 2. Global Tick Loop (every 5 seconds)

```
T+0s ──► tick()
         │
         │  Atomic SQL UPDATE ... RETURNING
         │  ┌──────────────────────────────────────────────┐
         │  │ UPDATE monitors                              │
         │  │ SET next_check_at = NOW + interval_seconds   │  ← advances BEFORE check runs
         │  │     last_checked_at = NOW                    │
         │  │ WHERE enabled = 1                            │
         │  │   AND next_check_at <= NOW                   │
         │  │ LIMIT 50                                     │
         │  │ RETURNING *                                  │
         │  └──────────────────────────────────────────────┘
         │
         │  Returns: [monitor_A, monitor_B, monitor_C, ...]
         │
         ├──► runCheck(monitor_A).catch(log)  ─┐
         ├──► runCheck(monitor_B).catch(log)    │  all fire in parallel
         └──► runCheck(monitor_C).catch(log)  ─┘  tick() returns immediately

T+5s ──► tick() runs again (doesn't wait for checks above)
```

---

## 3. runCheck() Decision Tree

```
runCheck(monitor)
│
├─ monitor still exists in DB? ──NO──► return silently (was deleted)
│
├─ has regions configured AND agents available AND interval >= 30s?
│   │
│   YES                              NO
│   │                                │
│   ▼                                ▼
│  checkViaAgents()            performCheck()
│  [awaits Lambda]             [local HTTP/TCP]
│   │                                │
│   ├─ got results?                  │
│   │   YES          NO              │
│   │   │            │               │
│   │   │            └─► performCheck() (fallback)
│   │   │
│   │   ▼
│   │  insert heartbeat per region  (e.g. asia, europe)
│   │  overallStatus = majority vote
│
├─ insert heartbeat region='local'   ← always — drives stats & notifications
│
├─ prune old heartbeats (keep last HEARTBEAT_LIMIT rows)
│
├─ UPDATE monitors SET last_status = overallStatus
│
└─ last_status changed? (was NOT NULL, now different)
    │
    YES ──► sendNotification()
    NO  ──► done
```

---

## 4. DB Schema — New Columns on `monitors`

```
monitors table
┌──────────────────┬─────────────────┬──────────────────────────────────────────┐
│ column           │ type            │ role                                     │
├──────────────────┼─────────────────┼──────────────────────────────────────────┤
│ next_check_at    │ INTEGER (ms)    │ When this monitor is next due.           │
│                  │                 │ Advanced BEFORE the check runs.          │
│                  │                 │ NULL = not yet scheduled.                │
├──────────────────┼─────────────────┼──────────────────────────────────────────┤
│ last_checked_at  │ INTEGER (ms)    │ Set at claim time (used for durationMs). │
├──────────────────┼─────────────────┼──────────────────────────────────────────┤
│ last_status      │ TEXT / NULL     │ NULL  → first ever check, skip notify.   │
│                  │                 │ 'up'  → was up last check.               │
│                  │                 │ 'down'→ was down last check.             │
│                  │                 │ Only notify when value CHANGES.          │
└──────────────────┴─────────────────┴──────────────────────────────────────────┘
```

---

## 5. Lifecycle: Create / Update / Delete Monitor

```
API: POST /monitors (create)
  └─► INSERT into monitors (next_check_at = NULL)
  └─► scheduleMonitor(id, interval, true)
        └─► UPDATE monitors SET next_check_at = NOW
              └─► picked up on next tick (within 5s)

API: PUT /monitors/:id (update interval or settings)
  └─► UPDATE monitors SET interval_seconds = ...
  └─► scheduleMonitor(id, newInterval, enabled)
        └─► UPDATE monitors SET next_check_at = NOW  (trigger immediate re-check)

API: DELETE /monitors/:id
  └─► unscheduleMonitor(id)  ← no-op
  └─► DELETE FROM monitors   ← cascades heartbeats via FK
        └─► if runCheck() was mid-flight:
              • existence check at top → silent return
              • FK error in catch      → silently swallowed

API: toggle enabled/disabled
  └─► scheduleMonitor(id, interval, false)  ← enabled=false, no-op
        Global tick WHERE enabled=1 skips it automatically
```

---

## 6. Why This Is Safe Under Restart

```
Old design (per-monitor setInterval):
  State lives in memory (Maps) → restart loses all state → staggered re-init needed

New design (DB-driven):
  Restart scenario:
  ┌─────────────────────────────────────────────────────┐
  │  T=0   monitor claimed, next_check_at advanced      │
  │  T=3   process crashes mid-check                    │
  │  T=30  process restarts                             │
  │  T=35  first tick runs                              │
  │        next_check_at is still in the FUTURE         │
  │        → monitor is NOT re-claimed yet              │
  │        → waits for its full interval to elapse      │
  │        → no duplicate execution                     │
  └─────────────────────────────────────────────────────┘
```

---

## Key Design Principles

| Concern | Old Design | New Design |
|---|---|---|
| Scheduling source of truth | In-memory `Map` (lost on restart) | `next_check_at` in SQLite |
| Previous status tracking | In-memory `Map` | `last_status` column (NULL = new) |
| Timer per monitor | Yes — one `setInterval` each | No — single global 5s tick |
| Duplicate execution on restart | Possible (timers reset) | Impossible (next_check_at already advanced) |
| Monitor deletion safety | `clearInterval` required | No-op + existence check in runCheck |
| Notification guard | `prevStatus !== undefined` | `last_status IS NOT NULL` |
