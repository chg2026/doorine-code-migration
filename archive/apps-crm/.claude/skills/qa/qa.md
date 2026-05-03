---
name: qa
description: >
  QA testing for the CHG CRM dashboard. Trigger when the user asks to test the site,
  verify a deployment, check that a new form works, test a user flow end-to-end, find
  bugs after a sprint, or confirm chg-crm.replit.app is working correctly. Run this
  after every sprint before marking it done. Also trigger when the user says
  "does this work", "test it", "check the deployment", or "is it broken".
---

# QA — CHG CRM Testing

## Purpose
Structured testing checklist after every sprint. Catches bugs before Nicole hits them
in real use. Always run against the live Replit URL, not just localhost.

## QA Workflow

### Step 1 — Deployment Check
Before testing features, confirm the app is actually running:

```bash
# Test the live URL responds
curl -I https://chg-crm.replit.app

# Test the API is healthy
curl https://chg-crm.replit.app/api/properties

# Confirm React is loading (not JSON)
curl https://chg-crm.replit.app | head -20
# Should contain: <!DOCTYPE html> — NOT {"status":"CHG CRM is running"}
```

If React is not loading → stop and invoke `/investigate` before continuing.

### Step 2 — API Smoke Tests
Run these curl tests against the live app after every sprint:

```bash
BASE="https://chg-crm.replit.app/api"

# Properties
curl -s $BASE/properties | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Properties: {len(d)} records')"

# Contractors
curl -s $BASE/contractors | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Contractors: {len(d)} records')"

# Projects
curl -s $BASE/projects | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Projects: {len(d)} records')"

# Tenants
curl -s $BASE/tenants | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Tenants: {len(d)} records')"

# Deals
curl -s $BASE/deals | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Deals: {len(d)} records')"

# Tasks
curl -s $BASE/tasks | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Tasks: {len(d)} records')"
```

All should return arrays (even if empty `[]`). A non-JSON response or 500 error = broken route.

### Step 3 — Sprint-Specific Feature Tests

Run the checklist for the sprint just completed:

#### Sprint 0 — Deployment
- [ ] Visiting root URL shows React dashboard (not JSON)
- [ ] All 6 tabs are visible: Overview, Construction, Property Mgmt, Acquisitions, Finance, Tasks
- [ ] No blank white screen or JavaScript errors in browser console
- [ ] Bernard Ave data visible in Construction tab

#### Sprint 1 — Properties & Contractors
- [ ] "Add Property" button opens a modal
- [ ] All required fields validated (address cannot be empty)
- [ ] Property type is a dropdown (not free text)
- [ ] Submitting form creates record — appears in list immediately
- [ ] Clicking a property row opens edit modal with pre-filled data
- [ ] Saving edit updates the record
- [ ] Delete button shows confirmation dialog before deleting
- [ ] Same flow works for Contractors
- [ ] Toast notification shows on success and error

#### Sprint 2 — Construction Projects & Phases
- [ ] "Add Project" dropdown loads real properties and contractors from API
- [ ] Creating project appears in Construction tab
- [ ] Phases list visible inside each project
- [ ] Phase completion % slider works and saves
- [ ] Updating a phase % updates the parent project overall_pct
- [ ] ON TIME / BEHIND badge shows correctly based on timeline logic
- [ ] Progress bar reflects current completion %

#### Sprint 3 — Tenants
- [ ] "Add Tenant" form works, appears in Property Mgmt tab
- [ ] Unit field is free text (Upper, Lower, Unit 1, etc.)
- [ ] Payment status dropdown has all options
- [ ] "Mark Late" increments late_fee_count and shows calculated fee
- [ ] 1st late = $69, 2nd+ = 10% of rent amount
- [ ] "Mark Paid" sets status back to current

#### Sprint 4 — Acquisitions
- [ ] "Add Deal" form works
- [ ] ROI field is read-only and auto-calculates after save
- [ ] Pipeline stages show correct deal counts
- [ ] Moving a deal to a new stage updates status

#### Sprint 5 — Finance
- [ ] "Log Invoice" form works with all fields
- [ ] Classification dropdown has expense and capital
- [ ] Invoice appears in Finance tab list
- [ ] Utility log form works
- [ ] Vacant property utility alert triggers correctly

#### Sprint 6 — Recurring Tasks
- [ ] Pending tasks list shows in Tasks tab
- [ ] "Complete Task" opens confirmation number modal
- [ ] Completing a task updates status and timestamps
- [ ] Overdue tasks show red badge

#### Sprint 7 — Authentication
- [ ] Root URL redirects to login page when not authenticated
- [ ] Wrong password shows error message
- [ ] Correct credentials load the dashboard
- [ ] JWT persists across page refresh
- [ ] Logout button clears session and returns to login

### Step 4 — Mobile QA (Nicole's Phone)
Test on mobile after every sprint that builds UI:

```
Resize browser to 375px width (iPhone) and verify:
- [ ] No horizontal scrolling
- [ ] All buttons tappable (minimum 44px height)
- [ ] Forms stack vertically
- [ ] Tables collapse to card view
- [ ] Modal fits on screen without overflow
- [ ] Input font size 16px (no iOS zoom on focus)
```

### Step 5 — Bug Report Format
When a bug is found, document it:

```
BUG: [short title]
Sprint: [which sprint introduced this]
Steps to reproduce:
  1. [step]
  2. [step]
  3. [step]
Expected: [what should happen]
Actual: [what happens instead]
Severity: Critical / High / Medium / Low
  Critical = blocks Nicole from doing her job
  High = feature broken but workaround exists
  Medium = visual glitch or minor wrong behavior
  Low = cosmetic only
```

Then invoke `/investigate` to diagnose and fix.

### Step 6 — QA Sign-Off
Sprint is done when:
- [ ] All sprint checklist items pass
- [ ] No Critical or High severity bugs open
- [ ] Mobile tested
- [ ] Git pushed to GitHub
- [ ] Replit showing latest build
