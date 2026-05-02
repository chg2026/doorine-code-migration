---
name: design-consultation
description: >
  Design system, brand, and visual identity decisions for the CHG CRM dashboard.
  Trigger when the user asks about colors, typography, component styles, layout decisions,
  visual consistency, or wants to define or review the design direction before building UI.
  Use before any new tab, form, or component is built to ensure it matches CHG standards.
---

# Design Consultation — CHG CRM

## Purpose
Run this skill before building any new UI component, tab, or form. It ensures every
visual decision is intentional and consistent with the CHG dashboard aesthetic.

## Consultation Workflow

### Step 1 — Define the Context
Answer these before making any design decision:
- What screen/component are we designing?
- Who uses it — Nicole (daily operations) or Roey (strategic overview)?
- Is this a data-entry surface (form/modal) or a data-display surface (table/dashboard)?
- Will Nicole use this on her phone at a job site?

### Step 2 — CHG Design System Reference

**Color Palette**
```
Primary blue:     #1a56db  — buttons, links, active states
Success green:    #057a55  — complete, current, on-time
Warning amber:    #c27803  — delayed, upcoming, partial
Danger red:       #c81e1e  — overdue, late, behind, delete
Neutral gray:     #6b7280  — secondary text, inactive
Background:       #f9fafb  — page background
Card background:  #ffffff  — all cards and modals
Border:           #e5e7eb  — dividers, input borders
```

**Typography**
- Headings: Semi-bold, #111827
- Body: Regular, #374151
- Labels/captions: 0.875rem, #6b7280
- Never use Arial, Inter, or Roboto — use system-ui or a distinctive pairing

**Spacing**
- Card padding: 24px
- Modal padding: 32px
- Section gap: 16px
- Input height: 40px minimum (44px for mobile tap targets)

**Border Radius**
- Cards: 8px
- Inputs: 4px
- Badges: 9999px (pill)
- Buttons: 6px

### Step 3 — Component Patterns

**Status Badges** — always pills, never plain text
```
complete / current / on_time   → green bg, green text
in_progress / upcoming         → blue bg, blue text
delayed / late / behind        → red bg, red text
not_started / vacant           → gray bg, gray text
under_construction / partial   → amber bg, amber text
```

**Buttons**
- Primary action: #1a56db bg, white text, 6px radius
- Destructive action: #c81e1e bg, white text
- Secondary/cancel: white bg, #e5e7eb border, #374151 text
- Minimum width: 80px, height: 40px

**Forms / Modals**
- Max width: 560px, centered
- Backdrop: rgba(0,0,0,0.5)
- All inputs full-width
- Required fields marked with red asterisk
- Error state: red border (#c81e1e) + error message below field

**Data Tables**
- Sticky header, alternating rows (#f9fafb on odd)
- Actions column right-aligned (edit pencil + delete trash)
- Empty state: centered text + call-to-action button

**KPI Cards**
- 4-column grid desktop, 2-column tablet, 1-column mobile
- Large metric number (2rem bold), label below (0.875rem gray)
- Optional trend arrow (↑ green, ↓ red)

### Step 4 — Mobile-First Checklist
Before approving any design:
- [ ] All tap targets minimum 44px height
- [ ] Forms stack vertically on mobile
- [ ] Tables collapse to card list below 768px
- [ ] No horizontal scroll on mobile
- [ ] Font size minimum 16px on inputs (prevents iOS zoom)

### Step 5 — Design Decision Output
Document the decisions made:
- Component name
- Layout choice and rationale
- Colors used and why
- Any deviations from the design system and why
- Mobile behavior

## Anti-Patterns — Never Do These
- Free-text for enum fields (always use dropdowns)
- Tables without empty states
- Actions without confirmation (especially delete)
- Forms without loading/error states
- Purple gradients, generic shadows, cookie-cutter layouts
- Inconsistent spacing between similar components
