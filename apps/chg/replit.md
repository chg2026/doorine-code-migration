# CHG CRM — Multi-Tenant SaaS Platform

Operations platform for Cleveland Holding Group — real estate portfolio management, construction project tracking, property management, contractor directory, and acquisitions. Now built as a multi-tenant SaaS with Supabase Auth, role-based access control, and client account isolation.

## Architecture

- **Frontend**: React (CRA) + Tailwind CSS 3 running on port 5000
- **Backend**: Node.js + Express API running on port 3000
- **Database + Auth**: Supabase (PostgreSQL + Supabase Auth)
- **Proxy**: React dev server proxies `/api/*` to `http://localhost:3000`

## Project Structure

```
/client                          - React frontend (Create React App + Tailwind)
  /src
    AppRouter.jsx                - Main router with protected routes
    App.js                       - Legacy CRM UI (preserved)
    /context
      AuthContext.jsx            - Supabase auth state + permissions
    /components
      Sidebar.jsx                - Dynamic permission-based navigation
      TopBar.jsx                 - Page header with user dropdown
      Layout.jsx                 - Sidebar + TopBar wrapper
      ProtectedRoute.jsx         - Auth + role + department guard
      ui.jsx                     - Shared UI (StatusBadge, Card, Modal, etc.)
    /pages
      Login.jsx                  - Email/password login + forgot password
      Signup.jsx                 - New account registration (company + user)
      ResetPassword.jsx          - Password reset form
      /admin
        AdminDashboard.jsx       - Super Admin: accounts, users, roles mgmt
      /dashboard
        Dashboard.jsx            - Main dashboard with stats
        PropertiesPage.jsx       - Properties CRUD (list, add, edit, delete)
        ConstructionPage.jsx     - Construction projects + phases + budgets
        ContractorsPage.jsx      - Contractor directory (list, add, edit, delete)
        AcquisitionsPage.jsx     - Deal pipeline with status tracking
        FinancePage.jsx          - Invoices + expense tracking
        TasksPage.jsx            - Recurring tasks (list, filter, complete)
        TenantsPage.jsx          - Tenant management (list, add, edit, payments)
        Profile.jsx              - User profile, password change, billing
    /lib
      supabase.js                - Supabase client init
      api.js                     - Axios instance with Supabase token injection
  tailwind.config.js             - Design system colors + config
  tailwind.css                   - Tailwind directives (input)
  tailwind.output.css            - Generated CSS (gitignored)

/server                          - Express backend
  index.js                       - Entry point (v2.0.0 — mounts all routes)
  db.js                          - Legacy Supabase client (anon key)
  /middleware
    auth.js                      - Supabase Auth token validation + user profile loading
    permissions.js               - Department access + account scoping
  /routes
    auth.js                      - POST /signup + GET /me (signup + profile)
    admin.js                     - Super Admin CRUD (accounts, users, roles)
    users.js                     - User profile updates
    dashboard.js                 - Dashboard stats (account-scoped)
    properties.js                - Properties CRUD (account-scoped)
    contractors.js               - Contractors CRUD (account-scoped)
    projects.js                  - Projects + phases + expenses (account-scoped)
    tenants.js                   - Tenants CRUD (account-scoped)
    deals.js                     - Deals/acquisitions CRUD (account-scoped)
    tasks.js                     - Recurring tasks (account-scoped)
    invoices.js                  - Invoices CRUD (account-scoped)

/scripts
  schema.sql                     - Original DB schema
  saas-migration.sql             - Multi-tenant tables + RLS policies
  construction-migration.sql     - Construction module tables + storage bucket
```

## Environment Variables / Secrets Required

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anonymous key (client-safe)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only, admin ops)
- `REACT_APP_SUPABASE_URL` — Forwarded to React (set in client/.env)
- `REACT_APP_SUPABASE_ANON_KEY` — Forwarded to React (set in client/.env)

Legacy (can be removed after migration):
- `APP_PASSWORD` — Old shared team password
- `JWT_SECRET` — Old JWT signing secret

## Authentication

Uses **Supabase Auth** natively:
- Email/password login via `supabase.auth.signInWithPassword()`
- Password reset via `supabase.auth.resetPasswordForEmail()`
- Session tokens automatically managed by Supabase client
- Server validates tokens via `supabase.auth.getUser(token)` with service role key
- All `/api/*` routes (except `/api/auth/*` and `/api/health`) require valid Supabase session
- 401 response triggers automatic sign-out and redirect to login

## Multi-Tenancy

- Each client organization is an **account** in the `accounts` table
- All data tables have `account_id` column for tenant isolation
- **Row Level Security (RLS)** policies enforce isolation at the database level
- Server middleware (`scopeToAccount`) adds account filtering to all queries
- Super Admins bypass account filtering (can see all data)

## User Roles & Permissions

- **Super Admin**: Full access to everything, can manage all accounts/users/roles
- **Account Admin**: Can manage users within their own account
- **Custom Roles**: Per-department permissions (view/edit/none) for:
  - Acquisitions, Construction, Property Management, Contractors, Finance, Tasks
- Sidebar navigation dynamically shows/hides based on permissions
- API routes enforce permissions server-side

## Design System (Tailwind)

- Primary: `#1a56db` (deep blue)
- Success: `#057a55` (green)
- Warning: `#c27803` (amber)
- Danger: `#c81e1e` (red)
- Dark sidebar (`gray-900`) + white content area
- Font: Inter (system fallback)

## Known Issue: Signup Trigger

The `handle_new_user` trigger in Supabase crashes on NULL metadata, blocking all new user creation. To fix, run `scripts/fix-trigger.sql` in Supabase SQL Editor. This replaces the trigger with a NULL-safe version that guards against missing account_id metadata. Until this is applied, the signup page will show an error.

## Database Schema (actual column names)

- **properties**: id, name, address, street, city, state, zip, type, property_type, status, acquisition_date, purchase_date, purchase_price, photo_url, insurance_policy, rental_registration_status, rental_registration_expiry, lead_safe_expiry, mortgage_due_day, tax_due_date, unit_count, account_id, created_by
- **units**: id, property_id, account_id, label, sort_order, created_at, updated_at
- **contractors**: id, name, contact_name, trade, phone, email, w9_status, w9_url, insurance_url, insurance_expiry, coi_expiry, agreement_signed, performance_score (1–10), notes, account_id
- **construction_projects**: id, name, property_id, unit_id, contractor_id, description, status, labor_budget, material_budget, labor_spent, material_spent, overall_pct, start_date, target_completion, agreement_url, w9_url, insurance_url, account_id, created_by
- **construction_phases** (the spec's "phases"): id, project_id, name, contractor_id, completion_pct, status, payment_approved, checklist_complete, labor_budget, materials_budget, labor_spent, materials_spent, estimated_start, estimated_completion, sort_order, notes
- **master_phases**: id, account_id, name, sort_order, is_active (per-account customizable phase library; 19 standard phases seeded per account)
- **addendums**: id, project_id, account_id, title, description, change_types[], budget_delta_labor, budget_delta_materials, proposed_delivery_date, document_url, status (pending/approved/rejected), requested_by, request_date, reviewed_by, review_date, review_comment
- **project_notes**: id, project_id, account_id, content, note_type (note/update/reminder/issue/meeting), visibility (all/admin), created_by
- **project_activity**: id, project_id, account_id, event_type, description, metadata (jsonb), created_by — read-only audit log
- **invoices**: id, property_id, project_id, phase_id, vendor, amount, category (Labor/Materials/Equipment Rental/Permits & Fees/Other), classification, invoice_date, invoice_number, notes, submitted_by, date, file_url, account_id
- **tenants**: id, name, unit, lease_start, lease_end, payment_status, property_id, rent_amount, late_fee_count, account_id
- **deals**: id, address, asking_price, arv, status, notes, source, account_id
- **recurring_tasks**: id, name, status, property_id, due_date, type, account_id

### Storage Buckets

- **project-documents** (private) — agreement, W9, insurance, invoice files, addendum docs. File path convention: `<account_id>/<project_id>/<filename>`. RLS scopes access by the first path segment matching the user's `account_id`.

## Database Migration

Run migrations in this order in the Supabase SQL Editor:

**1. `scripts/saas-migration.sql`** — multi-tenant foundation:
- Creates `accounts`, `roles`, `role_permissions`, `user_profiles`, `subscription_tiers`, `activity_log`
- Adds `account_id` to all existing data tables
- Enables RLS with tenant isolation policies
- Creates helper functions (`is_super_admin()`, `current_account_id()`)
- Seeds a default "CHG Internal" account + Super Admin role
- Links existing data to CHG Internal

**2. `scripts/fix-trigger.sql`** — patches the `handle_new_user` trigger to be NULL-safe (one-time fix; required for signup to work).

**3. `scripts/construction-migration.sql`** — Construction module foundation:
- Creates `units`, `master_phases`, `addendums`, `project_notes`, `project_activity`
- Extends `properties` (name/street/state/zip/photo_url/purchase_date), `construction_projects` (unit_id/description/agreement_url/w9_url/insurance_url), `construction_phases` (full phase fields per spec), `invoices` (phase_id/project_id/category/etc.), `contractors` (contact_name/W9 + insurance URLs/expiry/notes/score)
- Enables RLS on all new tables with tenant isolation
- Seeds 19 standard master phases per account; auto-seeds on new account creation
- Backfills 1 default unit for every existing property
- Creates the `project-documents` Supabase Storage bucket with account-scoped RLS (file path = `<account_id>/<project_id>/<filename>`)

## Test Users

After running the migration, seed test users with:
```
node scripts/seed-test-users.js
```
This creates 3 test accounts (blocked in production via NODE_ENV check):
- **Super Admin**: `admin@chg.com` / `admin123`
- **Account Admin**: `manager@chg.com` / `manager123`
- **Regular User**: `user@chg.com` / `user1234`

New users can also self-register via the Sign Up page (`/signup`).

## Running the App

- **Development**: `npm run dev` — starts both frontend and backend concurrently
- **Backend only**: `npm run start:server`
- **Frontend only**: `npm run start:client`

## Deployment

- Target: autoscale
- Build: `cd client && npm run build`
- Run: `node server/index.js & npx serve -s client/build -l 5000`
