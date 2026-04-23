const { createClient } = require('@supabase/supabase-js')

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed test users in production. Set NODE_ENV to development.')
  process.exit(1)
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CHG_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'
const SUPER_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000010'

const TEST_USERS = [
  {
    email: 'admin@chg.com',
    password: 'admin123',
    full_name: 'Super Admin',
    account_id: CHG_ACCOUNT_ID,
    role_id: SUPER_ADMIN_ROLE_ID,
    is_super_admin: true,
    is_account_admin: true,
  },
  {
    email: 'manager@chg.com',
    password: 'manager123',
    full_name: 'Account Manager',
    account_id: CHG_ACCOUNT_ID,
    role_id: SUPER_ADMIN_ROLE_ID,
    is_super_admin: false,
    is_account_admin: true,
  },
  {
    email: 'user@chg.com',
    password: 'user1234',
    full_name: 'Regular User',
    account_id: CHG_ACCOUNT_ID,
    role_id: SUPER_ADMIN_ROLE_ID,
    is_super_admin: false,
    is_account_admin: false,
  },
]

async function seed() {
  console.log('Seeding test users...\n')

  for (const u of TEST_USERS) {
    let userId = null

    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, is_super_admin, is_account_admin')
      .eq('email', u.email)
      .maybeSingle()

    if (existingProfile) {
      console.log(`  [exists] ${u.email} — profile already exists`)
      continue
    }

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: {
        full_name: u.full_name,
        account_id: u.account_id,
        role_id: u.role_id,
      },
    })

    if (authError) {
      if (authError.message.includes('already been registered')) {
        const { data: { users } } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 })
        const found = users.find(au => au.email === u.email)
        if (found) {
          userId = found.id
          console.log(`  [auth exists] ${u.email} — creating missing profile`)
        } else {
          console.error(`  [error] ${u.email}: registered but not found`)
          continue
        }
      } else {
        console.error(`  [error] ${u.email}: ${authError.message}`)
        continue
      }
    } else {
      userId = authUser.user.id
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email: u.email,
        full_name: u.full_name,
        account_id: u.account_id,
        role_id: u.role_id,
        is_super_admin: u.is_super_admin,
        is_account_admin: u.is_account_admin,
        status: 'active',
      })

    if (profileError) {
      console.error(`  [error] ${u.email} profile: ${profileError.message}`)
      continue
    }

    const role = u.is_super_admin ? 'Super Admin' : u.is_account_admin ? 'Account Admin' : 'User'
    console.log(`  [created] ${u.email} (${role})`)
  }

  console.log('\n--- Test Credentials ---')
  console.log('Super Admin:    admin@chg.com     / admin123')
  console.log('Account Admin:  manager@chg.com   / manager123')
  console.log('Regular User:   user@chg.com      / user1234')
  console.log('------------------------\n')
}

seed().catch(console.error)
