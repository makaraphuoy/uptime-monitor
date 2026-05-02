
---

## System Architecture

I have a hybrid system:

### 1. uptime-monitor (VPS)
- Node.js (Hono/Nitro)
- SQLite database (Drizzle ORM)
- Responsible for scheduling + storing state

### 2. uptime-agent (AWS Lambda)
- Stateless execution worker
- Performs HTTP/TCP uptime checks
- Returns results per region (e.g. Asia, Australia)

---

## Core Goal

Refactor the scheduler into a **simple, correct, production-safe VPS-based design** using SQLite.

NOT distributed. NOT multi-instance. NOT overengineered.

---

## Hard constraints

- SQLite remains (no migration to Postgres/Redis)
- Single VPS only
- AWS Lambda only executes checks (no scheduling logic in Lambda)
- Must avoid setInterval-per-monitor design
- Must be safe under restart and avoid duplicate execution
- Must NOT use distributed locking systems

---

## Required architecture

### 1. Scheduler (VPS global loop)
- Single global setInterval (3–10 seconds)
- Queries due monitors:
  - enabled = true
  - next_check_at <= NOW()
  - LIMIT batch size (10–50)

---

### 2. Atomic scheduling (VERY IMPORTANT)

Each monitor must be claimed using a single atomic SQL UPDATE:

- next_check_at is updated BEFORE execution
- last_checked_at is updated at the same time
- claim succeeds only if next_check_at <= NOW() AND enabled = 1

This ensures:
- no duplicate execution
- no overlapping checks
- safe restart recovery

---

### 3. Execution model (IMPORTANT CLARIFICATION)

The scheduler MUST be NON-BLOCKING.

- Scheduler tick must NOT await monitor execution
- Checks must run asynchronously in background
- Scheduler continues polling immediately

Correct pattern:

for each due monitor:
  runCheck(monitor).catch(log error)

NOT true fire-and-forget where results are lost.

---

### 4. Worker execution (Lambda side)

Lambda:
- performs HTTP/TCP check
- returns result per region
- execution is awaited inside runCheck()

---

### 5. Result handling

After Lambda completes:
- store heartbeat in SQLite
- update last_status
- update last_checked_at (if needed)
- trigger notification only on status change

---

### 6. Multi-region logic

Keep existing region-based agent system:
- run checks across regions
- aggregate using majority status
- store per-region heartbeats

---

## Required DB schema updates

Add fields:

- next_check_at (CRITICAL — scheduling source of truth)
- last_checked_at
- last_status (DEFAULT NULL — no default value, NULL means "no status known yet")

### last_status rules

- Schema: `last_status TEXT` with no default (NULL)
- NULL = new monitor or no check has completed yet → skip notification
- Notification guard: `last_status IS NOT NULL AND last_status != overallStatus`
- Never use 'pending' or 'unknown' as defaults — NULL is the correct sentinel

---

## What to avoid

- No per-monitor setInterval
- No in-memory Maps as source of truth
- No locked_until system
- No queue system (not required)
- No distributed architecture assumptions
- No true fire-and-forget (results must be handled)

---

## Expected output

Please provide:

1. Final architecture design
2. Scheduler algorithm (step-by-step)
3. Atomic SQL claim query
4. Correct async execution model explanation
5. Minimal migration plan from current system