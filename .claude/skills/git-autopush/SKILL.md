---
name: git-autopush
description: >
  Automated git review, commit, and push for CHG CRM. Trigger when the user says
  "push it", "ship it", "autopush", "commit and push", or "push to GitHub". Runs
  the review checklist, stages all changes, generates a conventional commit message,
  and pushes to origin main in one shot.
---

# git-autopush — Auto Commit & Push to GitHub

## Purpose
Run review, commit with a good message, and push to GitHub in one command. Reduces
friction at the end of a sprint while keeping quality gates in place.

## Workflow

### Step 1 — Snapshot current state
```bash
git status
git diff --stat
git log --oneline -5
```

### Step 2 — Quick review gate
Before committing, scan the diff for red-flag blockers:

- Hardcoded secrets or API keys → **STOP**, fix first
- Route added without error handling → **STOP**, fix first
- `client/build/` missing or excluded → **STOP**, rebuild first
- `.env` staged for commit → **STOP**, unstage it

If any red flag is present, report it and do not push. Fix and re-run.

### Step 3 — Stage changes
```bash
# Stage all tracked + untracked changes (excluding .env)
git add -A
git reset HEAD .env 2>/dev/null || true
```

### Step 4 — Generate commit message
Infer the type from what changed:

| Changed files | Type |
|---|---|
| New feature / new route / new tab | `feat` |
| Bug fix, wrong value, broken behavior | `fix` |
| CSS, colors, layout only | `style` |
| Cron, config, tooling, no user-facing change | `chore` |
| Tests | `test` |
| Refactor (behavior unchanged) | `refactor` |

Format: `<type>: <short imperative description>`

Examples:
```
feat: add lease renewal form with late fee calculation
fix: correct ROI formula to use totalCost not purchasePrice
style: update sidebar active state to CHG brand blue
chore: register new properties route in server/index.js
```

### Step 5 — Commit and push
```bash
git commit -m "<generated message>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push origin main
```

### Step 6 — Confirm
After push, confirm with:
```bash
git log --oneline -3
```

Report the pushed commit hash and message to the user.

## Abort conditions
- User has uncommitted merge conflicts
- Remote has diverged (non-fast-forward) → report and ask user how to resolve
- Push rejected for any reason → report the error verbatim, do not force push
