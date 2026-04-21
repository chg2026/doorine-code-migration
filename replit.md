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
      ResetPassword.jsx          - Password reset form
      /admin
        AdminDashboard.jsx       - Super Admin: accounts, users, roles mgmt
      /dashboard
        Dashboard.jsx            - Main dashboard with stats
        PropertiesPage.jsx       - Properties CRUD (list, add, edit, delete)
        ConstructionPage.jsx     - Construction projects + phases + budgets
        ContractorsPage.jsx      - Contractor directory (list, add, edit, delete)
        AcquisitionsPage.jsx     - Deal pipeline with stage tracking + ROI
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
    auth.js                      - GET /me (profile + permissions)
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

## Database Migration

Run `scripts/saas-migration.sql` in Supabase SQL Editor to:
1. Create `accounts`, `roles`, `role_permissions`, `user_profiles`, `subscription_tiers`, `activity_log` tables
2. Add `account_id` to all existing data tables
3. Enable RLS on all tables with tenant isolation policies
4. Create helper functions (`is_super_admin()`, `current_account_id()`)
5. Seed a default "CHG Internal" account + Super Admin role
6. Link existing data to CHG Internal account

## Running the App

- **Development**: `npm run dev` — starts both frontend and backend concurrently
- **Backend only**: `npm run start:server`
- **Frontend only**: `npm run start:client`

## Deployment

- Target: autoscale
- Build: `cd client && npm run build`
- Run: `node server/index.js & npx serve -s client/build -l 5000`
