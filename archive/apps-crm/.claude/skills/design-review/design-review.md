---
name: design-review
description: >
  Visual polish audit of the live CHG CRM dashboard. Trigger when the user wants to
  review how the app looks, audit visual consistency, check if a new component matches
  the design system, identify UI improvements, or do a design pass before showing the
  app to Roey or Nicole for the first time. Also triggers on "how does it look",
  "review the UI", "does this look good", "visual audit", "polish the dashboard".
---

# Design Review — CHG CRM Visual Audit

## Purpose
Systematic visual audit of the live dashboard. Identifies inconsistencies, broken layouts,
and polish issues before Nicole or Roey see the app. Run after Sprint 8 (UI Polish) and
any time significant UI changes are made.

## Review Workflow

### Step 1 — Audit Scope
Identify what to review:
- [ ] Full dashboard (all 6 tabs)
- [ ] Specific tab: Overview / Construction / Property Mgmt / Acquisitions / Finance / Tasks
- [ ] Specific component: forms, modals, tables, badges, cards, navigation
- [ ] Mobile layout only

### Step 2 — Desktop Visual Audit

Go through each tab and check against the CHG design system:

#### Navigation / Tab Bar
- [ ] Active tab clearly distinguished from inactive
- [ ] Tab labels match: Overview, Construction, Property Mgmt, Acquisitions, Finance, Tasks
- [ ] No tab wrapping or overflow on standard desktop width (1280px)
- [ ] Consistent height and padding across all tabs

#### Overview Tab
- [ ] KPI cards in a 4-column grid
- [ ] Metric numbers large and bold (2rem)
- [ ] All cards same height
- [ ] Trend indicators consistent (↑ green, ↓ red)
- [ ] No empty or zero values showing as "NaN" or "undefined"

#### Construction Tab
- [ ] Each project shows: name, contractor, status badge, progress bar, % complete
- [ ] ON TIME badge is green, BEHIND badge is red
- [ ] Progress bars use correct colors (blue = in progress, green = complete, red = stuck)
- [ ] Phase breakdown readable — not too dense
- [ ] Budget figures formatted as currency ($32,000 not 32000)

#### Property Mgmt Tab
- [ ] Tenant status badges correct colors (current = green, late = red, partial = amber)
- [ ] Lease dates formatted consistently (Apr 1, 2026 not 2026-04-01)
- [ ] Unit labels clear (Upper Unit, Lower Unit)
- [ ] No tenant data bleeding between properties

#### Acquisitions Tab
- [ ] Pipeline stages clearly labeled
- [ ] Opportunity badges: hot = red, warm = amber, cold = gray
- [ ] ROI displayed as percentage with 1 decimal (12.4%)
- [ ] Dollar amounts formatted consistently

#### Finance Tab
- [ ] Invoices sorted by date (newest first)
- [ ] Classification badge: expense = gray, capital = blue
- [ ] Amount formatted as currency
- [ ] Property name visible on each invoice row

#### Tasks Tab
- [ ] Overdue tasks visually distinct (red highlight or badge)
- [ ] Completed tasks visually separated from pending
- [ ] Due dates formatted consistently
- [ ] Confirmation number visible on completed tasks

### Step 3 — Component Consistency Audit

**Buttons**
- [ ] All primary buttons same color (#1a56db)
- [ ] All delete/danger buttons same color (#c81e1e)
- [ ] Consistent border radius (6px)
- [ ] Consistent padding (horizontal 16px, vertical 8px minimum)

**Form Inputs**
- [ ] All inputs same height (40px minimum)
- [ ] Consistent border color (#e5e7eb)
- [ ] Focus state visible (blue border or outline)
- [ ] Error state visible (red border)
- [ ] Label above every input (not placeholder-only)

**Modals**
- [ ] Consistent max-width (560px)
- [ ] Consistent padding (32px)
- [ ] Close button (×) in top-right corner
- [ ] Backdrop dims the page behind
- [ ] Scrollable if content is tall

**Tables**
- [ ] Alternating row shading consistent across all tabs
- [ ] Column widths don't cause awkward wrapping
- [ ] Action buttons right-aligned in last column
- [ ] Empty state message present when no data

**Badges/Pills**
- [ ] Consistent border radius (9999px)
- [ ] Consistent padding (4px 10px)
- [ ] Font size consistent (0.75rem or 0.875rem — pick one)
- [ ] Never using colored text without colored background

### Step 4 — Mobile Audit (375px width)

Resize browser to 375px and check every tab:
- [ ] No horizontal scrollbar
- [ ] Navigation accessible (hamburger menu or scrollable tabs)
- [ ] All buttons tappable (minimum 44px height)
- [ ] Forms single-column layout
- [ ] Tables converted to card list
- [ ] Modals fit within viewport
- [ ] Text not truncated or overlapping
- [ ] Input font size 16px (prevents iOS zoom)

### Step 5 — Visual Issues Log

Document every issue found:

```
VISUAL ISSUE: [short title]
Tab/Component: [where it is]
Description: [what looks wrong]
Severity:
  - Critical: broken layout, unreadable content, data hidden
  - High: inconsistent with design system, looks unprofessional
  - Medium: minor spacing or color inconsistency
  - Low: cosmetic preference
Fix: [suggested change]
```

### Step 6 — Design Review Sign-Off

Dashboard is visually ready when:
- [ ] Zero Critical visual issues
- [ ] Zero High visual issues
- [ ] All tabs reviewed on desktop (1280px)
- [ ] All tabs reviewed on mobile (375px)
- [ ] Currency formatted consistently across all tabs
- [ ] Date formatted consistently across all tabs
- [ ] No "undefined", "null", or "NaN" visible anywhere
- [ ] Empty states present on all tables

## Quick Fixes Reference

| Issue | Fix |
|---|---|
| Currency shows as raw number | Wrap in `new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(amount)` |
| Date shows as ISO string | Use `new Date(date).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})` |
| "undefined" showing in UI | Add optional chaining: `property?.address` and fallback: `?? '—'` |
| Table too wide on mobile | Add `overflow-x: auto` to table wrapper div |
| Button too small on mobile | Add `min-height: 44px` to button CSS |
| Input zooms on iOS | Add `font-size: 16px` to all input CSS |
