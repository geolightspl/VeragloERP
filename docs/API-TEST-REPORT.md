# Veraglo ERP — API Test Report

**Run date:** 2026-06-14  
**Command:** `npm run test:api`  
**Backend:** Node.js / Express (`server/index.js`)  
**Storage mode:** File storage (`USE_FILE_STORAGE=1`, isolated temp directory per run)  
**Node.js:** 20.x  
**Test framework:** Node.js built-in test runner + Supertest  

---

## Executive summary

| Metric | Result |
|--------|--------|
| **Overall status** | **PASS** |
| Test suites | 16 |
| Test cases | 37 |
| Passed | 37 |
| Failed | 0 |
| Skipped | 0 |
| Total duration | ~360 ms |

All automated API integration tests completed successfully. No failures were found; no code fixes were required for this run.

---

## Environment

| Setting | Value |
|---------|--------|
| `USE_FILE_STORAGE` | `1` (portable file DB, no PostgreSQL required for tests) |
| `VERAGLO_DATA_DIR` | Isolated temp dir (`veraglo-api-test-*`) |
| `VERAGLO_DEBUG_RESET` | `1` (OTP/link logged in forgot-password tests) |
| `NODE_ENV` | `test` |

Tests bootstrap the Express app in-process via Supertest — no separate server process or port conflicts.

---

## Results by suite

### 1. GET /api/health (1 test) — PASS

| Test | Status | Notes |
|------|--------|-------|
| returns ok with storage metadata | PASS | `ok: true`, `storage: file`, `postgres: false`, `serverTime` present |

### 2. GET /api/auth/status (2 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| reports needsSetup on empty database | PASS | `needsSetup: true`, `hasUsers: false` |
| reports hasUsers after bootstrap | PASS | After admin bootstrap, `hasUsers: true` |

### 3. POST /api/setup/bootstrap-admin (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| creates first administrator on fresh install | PASS | HTTP 201, returns `userId` and generated password |
| rejects second bootstrap with 403 | PASS | `error: users_exist` |
| rejects password shorter than 8 characters | PASS | HTTP 500, `error: bootstrap_failed` |

### 4. GET/PUT /api/state (4 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET returns 404 when database is empty | PASS | `error: no_state` |
| PUT saves ERP state and GET returns it | PASS | Company name round-trips |
| PUT rejects body without _v | PASS | HTTP 400, `error: invalid_body` |
| PUT merge protects erpUsers from empty client overwrite | PASS | Users preserved after stale client sync |

### 5. POST /api/sessions/heartbeat (1 test) — PASS

| Test | Status | Notes |
|------|--------|-------|
| records active session heartbeat | PASS | Session listed via GET /api/sessions |

### 6. POST /api/auth/repair (2 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| returns 404 when no state exists | PASS | |
| repairs auth index when state exists | PASS | `hasUsers: true` after repair |

### 7. POST /api/numbering/next (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| returns sequential numbers for the same key | PASS | `seq` increments |
| requires key | PASS | HTTP 400 |
| respects min seed value | PASS | First seq = min + 1 |

### 8. Snapshots API (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| creates, lists, and retrieves snapshots | PASS | CRUD via POST/GET |
| returns 404 for missing snapshot | PASS | |
| POST rejects payload without data._v | PASS | HTTP 400 |

### 9. Forgot password API (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET settings returns public config | PASS | |
| POST request returns generic message without user enumeration | PASS | SMTP not configured; debug OTP logged |
| POST verify-otp rejects invalid otp | PASS | HTTP 400 |

### 10. Weather API (2 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET settings returns weather login config | PASS | |
| GET current responds when weather is disabled | PASS | `disabled: true` |

### 11. Themes API (4 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET /api/themes returns custom theme list | PASS | |
| GET /api/themes/current returns defaults on empty state | PASS | |
| POST /api/themes/apply persists theme settings | PASS | `defaultMode: dark` persisted |
| POST /api/themes/custom creates and DELETE removes theme | PASS | |

### 12. Email integration API (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET/POST settings mask passwords | PASS | Password stored as `***` in responses |
| POST sync requires configuration | PASS | HTTP 400 when not configured |
| POST convert-to-enquiry creates enquiry record | PASS | Enquiry number generated |

### 13. Customer portal API (3 tests) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET quote returns not_found for invalid token | PASS | |
| GET quote returns sanitized payload for valid token | PASS | Quotation + company data |
| POST view records portal view count | PASS | `views: 1` |

### 14. Notifications API (1 test) — PASS

| Test | Status | Notes |
|------|--------|-------|
| POST send rejects missing to/subject | PASS | HTTP 400 |

### 15. Data path API (1 test) — PASS

| Test | Status | Notes |
|------|--------|-------|
| POST validate returns empty result for blank path | PASS | `readOk: false`, `writeOk: false` |

### 16. Static UI (1 test) — PASS

| Test | Status | Notes |
|------|--------|-------|
| GET / serves index.html | PASS | Response contains "Veraglo ERP" |

---

## API route coverage

The Express server exposes **36 HTTP routes**. This suite exercises **28 route handlers** directly or indirectly.

| Area | Routes tested | Routes not yet covered |
|------|---------------|------------------------|
| Auth / setup | status, bootstrap, repair, forgot-password (partial) | verify-link, reset |
| State / snapshots | GET/PUT state, snapshots CRUD | — |
| Sessions | heartbeat, list | — |
| Numbering | next | — |
| Weather | settings, current | — |
| Themes | list, current, apply, custom CRUD | — |
| Email integration | settings, sync, convert-to-enquiry | send-reply, logs |
| Portal | quote, view | portal.html |
| Notifications | send (validation only) | successful send (needs SMTP) |
| Datapath | validate (blank path) | valid path validation |
| Static | index.html | — |

**Note:** Business logic (inventory, sales, purchase, production, etc.) runs client-side against `/api/state`; module behaviour is covered in `docs/TEST-SCENARIOS.md` as manual/E2E scenarios, not in this API suite.

---

## Observations (non-blocking)

These items did **not** cause test failures but are worth tracking:

1. **Bootstrap validation HTTP status** — Short password returns HTTP **500** (`bootstrap_failed`) instead of **400**. Tests expect 500; consider returning 400 for client validation errors in a future API polish pass.

2. **npm audit (server dependencies)** — 4 high-severity advisories in transitive deps:
   - `nodemailer` ≤8.0.4 (SMTP/email parsing issues; fix: upgrade to 9.x)
   - `semver` via `imap`/`utf7` (ReDoS; fix requires dependency chain update)

   Run `npm audit` in `server/` for details. Not related to test failures.

3. **PostgreSQL mode** — CI and local tests use file storage only. Postgres-backed runs are documented in `docs/TEST-SCENARIOS.md` but not executed in this run.

---

## How to re-run

```bash
# From repository root (recommended)
npm run test:api

# Or directly in server/
cd server && npm test
```

Optional Postgres test database (not required for default suite):

```bash
USE_FILE_STORAGE=0 DATABASE_URL=postgresql://veraglo:veraglo@localhost:5432/veraglo_erp_test npm run test:api
```

---

## Conclusion

**All 37 API integration tests passed.** The Express API health, authentication bootstrap, state persistence, sessions, numbering, snapshots, forgot-password, weather, themes, email integration, customer portal, notifications, datapath validation, and static UI delivery endpoints behave as expected under isolated file storage.

No fixes were applied in this run because no test failures or regressions were detected.
