---
name: investigate
description: >
  Debug broken behavior, errors, and bugs in the CHG CRM. Trigger when the user reports
  something is broken, an API returns unexpected results, the UI isn't displaying data,
  a form submission fails, a cron job doesn't run, or any behavior doesn't match what
  was expected. Always invoke this before making random code changes to fix a bug.
---

# Investigate — CHG CRM Debugger

## Purpose
Structured diagnosis before any fix. Never change code until the root cause is confirmed.
Random changes without diagnosis make bugs worse and create new ones.

## Investigation Workflow

### Step 1 — Reproduce First
Before looking at any code, reproduce the issue:
- What exact action causes the problem?
- What was expected to happen?
- What actually happened?
- Does it happen every time or intermittently?
- Does it happen on Replit (production) or only locally?

### Step 2 — Classify the Bug
Identify which layer the bug lives in:

```
[ ] Frontend only     — UI renders wrong, component crashes, state not updating
[ ] API/Backend       — Route returns error, wrong data, missing fields
[ ] Database          — Supabase query wrong, RLS blocking, missing record
[ ] Network           — Request not reaching server, CORS error, timeout
[ ] Auth              — JWT invalid, unauthorized 401, missing token
[ ] Cron/Automation   — Job not running, wrong schedule, silent failure
[ ] Build/Deploy      — Replit serving stale code, React build outdated
```

### Step 3 — Layer-Specific Diagnosis

#### Frontend Bug
```bash
# Check browser console for errors
# In Replit: open the app URL, right-click → Inspect → Console tab

# Common CHG frontend issues:
# 1. API call returns data but UI doesn't update → check useEffect dependencies
# 2. Modal doesn't open → check state variable controlling isOpen
# 3. Form submits but nothing happens → check axios call and .catch handler
# 4. Data shows as undefined → API response shape changed, check field names
```

Check the component:
- Is `useEffect` fetching on mount? (`[]` dependency array)
- Is the axios base URL correct? (`/api/...` not `http://localhost:3000/api/...`)
- Is the state setter being called after the API response?

#### Backend/API Bug
```bash
# Test the route directly in Replit Shell
curl http://localhost:3000/api/properties
curl http://localhost:3000/api/projects
curl -X POST http://localhost:3000/api/properties \
  -H "Content-Type: application/json" \
  -d '{"address":"test","city":"Cleveland"}'

# Check server logs — look at Replit console output
# Common errors:
# 500 → Supabase query failed (check error.message in response)
# 404 → Route not registered in server/index.js
# 400 → Required field missing from request body
```

#### Supabase/Database Bug
```bash
# Go to Supabase → Table Editor → check if data exists
# Go to Supabase → SQL Editor → run the query manually

# Common issues:
# 1. RLS blocking reads → RLS is currently DISABLED, but check if it got enabled
# 2. Foreign key constraint → property_id doesn't exist in properties table
# 3. Column name mismatch → code uses 'pct' but schema uses 'completion_pct'
# 4. Insert missing required field → check schema for NOT NULL columns
```

#### Build/Deploy Bug (most common on Replit)
```bash
# Check what code Replit is actually running
cat server/index.js | head -50

# Check if React build is current
ls -la client/build/
cat client/build/index.html | head -5

# Check if Replit has latest from GitHub
git log --oneline -5
git status

# If Replit is running stale code:
git pull origin main
# Then restart the Replit process
```

### Step 4 — Confirm Root Cause
State the root cause clearly before writing any fix:
> "The bug is: [specific cause]. Evidence: [what confirmed it]. Fix: [exact change needed]."

Do not proceed to Step 5 until root cause is confirmed.

### Step 5 — Apply Minimal Fix
- Change only what is necessary to fix the confirmed root cause
- Do not refactor surrounding code during a bug fix
- Do not "clean up" unrelated things while fixing

### Step 6 — Verify Fix
After applying the fix:
- Reproduce the original steps — confirm bug is gone
- Check adjacent behavior — did the fix break anything nearby?
- Check Replit console — no new errors introduced

### Step 7 — Document
Brief note on what was broken and what was changed:
```
Bug: [description]
Root cause: [layer + specific cause]
Fix: [file changed + what changed]
Verified: [how confirmed fixed]
```

## CHG-Specific Known Issues

| Issue | Likely Cause | Quick Check |
|---|---|---|
| Root URL shows JSON not React | Express catch-all missing or stale build | `cat server/index.js` — look for `app.use(express.static(...))` |
| API returns empty array | Supabase table empty OR wrong table name | Check Supabase Table Editor directly |
| Form submits, nothing happens | axios error swallowed silently | Add `.catch(err => console.error(err))` temporarily |
| Phase % not updating on project | Rollup logic not triggering | Check projects.js route for the overall_pct recalculation |
| Cron job not running | Not imported in server/index.js | Check `import './cron.js'` exists in server/index.js |
| Git push rejected | Branch out of sync | `git pull --rebase origin main` then push again |
