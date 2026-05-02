You are a senior backend architect.

I currently have an uptime monitoring system built with Node.js (Hono + Nitro) + SQLite (Drizzle ORM). It supports:
- HTTP/TCP monitors
- multi-region checks (agents)
- heartbeats storage
- notifications
- interval-based monitoring

However, the current scheduler design uses setInterval per monitor, which causes:
- possible overlapping executions
- memory-based state (Maps)
- poor scalability for multi-instance / serverless environments
- no proper centralized scheduling or locking mechanism

---

## Current goals

I want to refactor the system into a production-grade architecture that:

### Must have
1. Replace setInterval-based scheduler with a centralized DB-driven scheduler
2. Prevent overlapping checks per monitor (strong locking mechanism)
3. Support multi-region checks (Asia, Australia, etc.)
4. Keep retry/failure logic safe and consistent
5. Ensure safe execution under concurrency (multiple workers possible)
6. Reduce reliance on in-memory state (Maps should not be required for correctness)

### Nice to have
- Ability to scale horizontally (multiple instances)
- Minimal changes to existing business logic (reuse performCheck, checkViaAgents, etc.)
- Keep SQLite + Drizzle ORM
- Keep current notification system

---

## Current schema behavior (important context)

Each monitor has:
- id
- intervalSeconds
- enabled
- url/type
- regions (optional)

Heartbeats are stored per check and per region.

---

## What I want you to design

Please provide:

### 1. New architecture design
Explain clearly:
- scheduler role
- worker role
- DB role
- execution flow

### 2. Database changes (if needed)
Suggest fields like:
- next_check_at
- locked_until
- last_status
- last_checked_at

### 3. New scheduler algorithm
Replace setInterval logic with:
- polling approach OR cron-based approach
- batching strategy (LIMIT)
- safe concurrency handling

### 4. Locking strategy
Design a safe mechanism using SQL/SQLite to prevent:
- duplicate execution
- race conditions
- multi-instance conflicts

### 5. Execution flow
Step-by-step flow from:
scheduler → worker → DB update → notification

### 6. Minimal refactor plan
Explain how to migrate from current code with minimal disruption.

---

## Constraints
- Keep SQLite compatible (no heavy infra like Redis required unless optional)
- Keep it simple but production-safe
- Avoid overengineering (no Kafka unless necessary)
- Must work in serverless environments (like AWS Lambda)
- Keep multi-region agent logic intact

---

## Existing code context
(Assume current system uses setInterval per monitor + Maps for state + Drizzle ORM + SQLite + region-based agents)

Now redesign it properly.