---
name: review
description: >
  Code review for CHG CRM changes before pushing to GitHub. Trigger when the user
  asks to review code, check a diff, do a pre-push review, or wants a second set of
  eyes before shipping. Always invoke before git push on any sprint-completing commit.
  Also triggers on "check my code", "review this", "is this ready to push", "looks good?".
---

# Review — CHG CRM Pre-Push Code Review

## Purpose
Catch bugs, regressions, and bad patterns before they reach GitHub and Replit production.
Run this before every meaningful git push. Takes 2 minutes and saves hours of debugging.

## Review Workflow

### Step 1 — See What Changed
```bash
# Full diff of all uncommitted changes
git diff

# Or if already staged
git diff --staged

# Summary of changed files
git diff --stat

# Changed files only (quick overview)
git status
```

### Step 2 — Backend Review Checklist
For every changed file in `server/`:

**Route files (server/routes/*.js)**
- [ ] Every route has error handling (`if (error) return res.status(500).json(...)`)
- [ ] No raw Supabase client calls in routes without error checking
- [ ] POST routes return 201, not 200
- [ ] PUT/DELETE routes use `.eq('id', req.params.id)`
- [ ] No hardcoded IDs or test data left in the code
- [ ] Business logic preserved:
  - Late fee: 1st = $69, subsequent = 10% of rent
  - ROI: `((arv - totalCost) / totalCost) * 100`
  - Phase rollup: updating phase triggers project overall_pct recalculation

**server/index.js**
- [ ] React static serving uses `app.use(express.static(...))` not `app.get('*')`
- [ ] Catch-all uses `app.use()` (Express 5 compatible)
- [ ] All new route files are imported and registered
- [ ] CORS is configured
- [ ] No API keys or secrets hardcoded (use `process.env.*`)

**server/cron.js (if changed)**
- [ ] Cron is imported in server/index.js
- [ ] Schedules are correct (utility = 10th, mortgage = 11th)
- [ ] Each job has a console.log for confirmation

### Step 3 — Frontend Review Checklist
For every changed file in `client/src/`:

**API calls**
- [ ] All axios calls use relative paths (`/api/...` not `http://localhost:3000/api/...`)
- [ ] Every axios call has a `.catch()` or try/catch
- [ ] Success shows toast notification (react-hot-toast)
- [ ] Error shows toast notification with readable message

**Forms**
- [ ] Required fields are validated before submit
- [ ] Enum fields use `<select>` dropdowns (not free text `<input>`)
- [ ] Submit button disabled while request is in flight (prevent double-submit)
- [ ] Modal closes after successful submit
- [ ] List refreshes after add/edit/delete without full page reload

**State management**
- [ ] `useEffect` has correct dependency array
- [ ] No infinite re-render loops (state set inside useEffect without deps)
- [ ] Loading state shown while fetching

**Mobile**
- [ ] No fixed pixel widths that break on mobile
- [ ] Touch targets are at least 44px height

### Step 4 — Security Spot Check
- [ ] No API keys, passwords, or Supabase URLs in any committed file
- [ ] `.env` is in `.gitignore` (never commit this)
- [ ] `client/build/` IS in git (Replit needs it)
- [ ] No `console.log` statements containing sensitive data

### Step 5 — Diff Quality Check
Read through the full diff and flag:

**Red flags — stop and fix before pushing:**
- Any hardcoded credential or secret
- A route without error handling
- `npm audit fix --force` in recent commands (can break React)
- Removing the Express catch-all for React serving
- Changing `overall_pct` calculation logic without testing

**Yellow flags — note but can push:**
- Commented-out code left in
- `console.log` debug statements (remove before final push)
- Duplicate CSS or redundant state variables
- Missing loading state on a form

### Step 6 — Commit Message Review
The commit message should follow conventional commits:
```
feat: add property form with all fields and validation
fix: correct phase completion rollup calculation
style: update badge colors to match design system
chore: add cron.js to server startup
```

Not acceptable:
```
updates
fix stuff
changes
wip
```

### Step 7 — Push Decision
- All red flags resolved → ✅ safe to push
- Yellow flags noted → ✅ push with note to clean up
- Any red flag unresolved → ❌ fix first, then re-run review

```bash
# Once review passes:
git add .
git commit -m "feat/fix/style/chore: [description]"
git push origin main
```
