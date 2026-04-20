---
name: git-autopush
description: >
  After Claude makes and the user approves a set of code or file changes, this skill
  handles staging, committing, and pushing those changes to the GitHub remote repository.
  Trigger this skill whenever the user says "push", "commit and push", "save to GitHub",
  "ship it", "push the changes", or gives any approval signal after a round of edits
  (e.g. "looks good", "do it", "yes go ahead"). Also trigger when the user asks to
  "sync with GitHub" or "update the repo". Use this skill in both Claude Code (VS Code)
  and Replit shell environments.
---

# Git Auto-Push Skill

Stages, commits, and pushes approved changes to the GitHub remote. Works in both
Claude Code (VS Code) and Replit shell environments.

---

## Step 1 — Confirm Before Pushing

Before running any git commands, summarize what changed and ask for explicit approval:

> "Here's what I'm about to commit and push:
> - [list changed files]
> - Commit message: `[proposed message]`
> - Branch: `[current branch]`
>
> Should I go ahead?"

Wait for an affirmative reply ("yes", "go ahead", "ship it", etc.) before proceeding.
Never push without this confirmation.

---

## Step 2 — Pre-Push Checks

Run these checks in order. Stop and report to the user if any fail.

```bash
# 1. Confirm you're on the expected branch (never push directly to main without asking)
git branch --show-current

# 2. Check what's changed
git status

# 3. Show a diff summary so Claude can include it in the commit message
git diff --stat
```

If the current branch is `main` or `master`, warn the user and ask to confirm before
continuing — they may want a feature branch instead.

---

## Step 3 — Stage, Commit, Push

Only run after the user has confirmed in Step 1.

```bash
# Stage all changes (or target specific files if the user specified)
git add .

# Commit with a descriptive message derived from what changed
git commit -m "<type>: <short description of what changed>"

# Push to the tracked remote
git push
```

### Commit message format

Use conventional commits style:
- `feat: add contractor filter to projects view`
- `fix: correct phase budget calculation`
- `style: update sidebar color and spacing`
- `chore: update .env.example`

Derive the message from the actual changes — do not use generic messages like
"update files" or "changes".

---

## Step 4 — Verify and Report

After pushing, confirm success to the user:

```bash
# Confirm the push landed
git log --oneline -3
```

Then tell the user:
> "✅ Pushed to GitHub. Latest commit: `[hash]` — `[message]`"

If the push fails (e.g. rejected, no upstream set), diagnose and report the error
clearly. Common fixes:

| Error | Fix |
|---|---|
| `no upstream branch` | `git push --set-upstream origin <branch>` |
| `rejected (non-fast-forward)` | Pull first: `git pull --rebase`, then push again |
| `Permission denied` | Check SSH key or Replit GitHub integration is connected |

---

## Environment Notes

**Replit:** Git is available in the Shell tab. The GitHub integration must be connected
under *Version Control* for pushes to work. If it isn't, direct the user to connect it
before proceeding.

**Claude Code (VS Code):** Standard git CLI. Ensure the remote `origin` points to the
correct GitHub repo (`git remote -v` to verify).

---

## What This Skill Does NOT Do

- Does not push without explicit user approval
- Does not force-push (`--force`) unless the user explicitly requests it
- Does not merge or rebase branches
- Does not create pull requests (do that manually on GitHub)
