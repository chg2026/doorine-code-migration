// Team management routes — mounted at /api/team in server/index.js.
//
// All authenticated endpoints use requireAuth. Mutating endpoints
// (remove member, revoke invite) additionally enforce account admin status.
// POST /accept-invite is public — invitees may not be signed in.

const express = require('express')
const router  = express.Router()
const crypto  = require('crypto')
const { requireAuth, requireAccountAdmin, supabaseAdmin } = require('../middleware/auth')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── helpers ─────────────────────────────────────────────────────────────────

function emailDomain(email) {
  return (email || '').toLowerCase().split('@')[1] || ''
}

// requireAccountAdmin is defined in middleware/auth.js.
// Inline guard used where we need it only on specific routes without a
// separate middleware layer.
function assertAccountAdmin(req, res) {
  if (!req.user?.is_super_admin && !req.user?.is_account_admin) {
    res.status(403).json({ error: 'Account admin access required.' })
    return false
  }
  return true
}

// ─── POST /api/team/invite ────────────────────────────────────────────────────

router.post('/invite', requireAuth, async (req, res) => {
  try {
    const { email, role } = req.body
    const accountId = req.user.account_id

    // Validate inputs.
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' })
    }
    if (!['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'viewer'." })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Determine member vs guest by domain comparison with the inviting user.
    const inviterDomain  = emailDomain(req.user.email)
    const inviteeDomain  = emailDomain(normalizedEmail)
    const inviteType     = (inviterDomain && inviterDomain === inviteeDomain) ? 'member' : 'guest'

    // Load billing limits for this account.
    const { data: ap } = await supabaseAdmin
      .from('account_products')
      .select('plan, seat_limit, guest_limit')
      .eq('account_id', accountId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (inviteType === 'member') {
      // Personal plan cannot have team members at all.
      if (ap?.plan === 'personal') {
        return res.status(403).json({
          error:   'upgrade_required',
          message: 'Team members require a Team plan.',
        })
      }

      if (ap?.seat_limit != null) {
        // Count accepted member invites + the account owner (1).
        const { count: acceptedMembers } = await supabaseAdmin
          .from('invites')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('type', 'member')
          .eq('status', 'accepted')

        const membersUsed = 1 + (acceptedMembers || 0)   // +1 for the owner
        if (membersUsed >= ap.seat_limit) {
          return res.status(403).json({
            error:   'seat_limit_reached',
            message: `Seat limit of ${ap.seat_limit} reached. Upgrade your plan to add more members.`,
          })
        }
      }
    } else {
      // Guest — check guest_limit.
      if (ap?.guest_limit != null) {
        const { count: acceptedGuests } = await supabaseAdmin
          .from('invites')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('type', 'guest')
          .eq('status', 'accepted')

        if ((acceptedGuests || 0) >= ap.guest_limit) {
          return res.status(403).json({
            error:   'guest_limit_reached',
            message: `Guest limit of ${ap.guest_limit} reached.`,
          })
        }
      }
    }

    // Reject if the email is already an active member of this account.
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('email', normalizedEmail)
      .eq('status', 'active')
      .maybeSingle()

    if (existingProfile) {
      return res.status(409).json({ error: 'This person is already a member of your account.' })
    }

    // Reject if a pending invite already exists for this email + account.
    const { data: existingInvite } = await supabaseAdmin
      .from('invites')
      .select('id')
      .eq('account_id', accountId)
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvite) {
      return res.status(409).json({ error: 'A pending invite already exists for this email.' })
    }

    const token     = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invite, error: insertError } = await supabaseAdmin
      .from('invites')
      .insert({
        account_id:  accountId,
        email:       normalizedEmail,
        role,
        type:        inviteType,
        token,
        status:      'pending',
        invited_by:  req.user.id,
        expires_at:  expiresAt,
      })
      .select('id, email, type, role, token, expires_at')
      .single()

    if (insertError) {
      console.error('[team/invite] Insert error:', insertError.message)
      return res.status(500).json({ error: 'Failed to create invite.' })
    }

    // TODO: send invite email — e.g. call supabaseAdmin.auth.admin.inviteUserByEmail
    // or a transactional email service — once email infrastructure is configured.
    // For now, the token is returned so the frontend can build the accept link.

    res.status(201).json({ invite })
  } catch (e) {
    console.error('[team/invite] Error:', e.message)
    res.status(500).json({ error: 'Failed to send invite.' })
  }
})

// ─── GET /api/team/members ────────────────────────────────────────────────────

router.get('/members', requireAuth, async (req, res) => {
  try {
    const accountId = req.user.account_id

    const [membersResult, invitesResult] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('id, email, full_name, phone, avatar_url, status, is_account_admin, role_id, created_at, last_login')
        .eq('account_id', accountId)
        .order('created_at', { ascending: true }),

      supabaseAdmin
        .from('invites')
        .select('id, email, role, type, token, status, expires_at, created_at')
        .eq('account_id', accountId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    if (membersResult.error) {
      console.error('[team/members] Members query error:', membersResult.error.message)
      return res.status(500).json({ error: 'Failed to load team members.' })
    }

    res.json({
      members:         membersResult.data || [],
      pending_invites: invitesResult.data || [],
    })
  } catch (e) {
    console.error('[team/members] Error:', e.message)
    res.status(500).json({ error: 'Failed to load team.' })
  }
})

// ─── DELETE /api/team/members/:userId ────────────────────────────────────────

router.delete('/members/:userId', requireAuth, async (req, res) => {
  if (!assertAccountAdmin(req, res)) return

  try {
    const { userId }  = req.params
    const accountId   = req.user.account_id

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself from the account.' })
    }

    // Confirm the target user belongs to this account.
    const { data: target, error: lookupError } = await supabaseAdmin
      .from('user_profiles')
      .select('id, status')
      .eq('id', userId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (lookupError) {
      console.error('[team/members/delete] Lookup error:', lookupError.message)
      return res.status(500).json({ error: 'Failed to look up member.' })
    }
    if (!target) {
      return res.status(404).json({ error: 'Member not found in this account.' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({ status: 'suspended' })
      .eq('id', userId)
      .eq('account_id', accountId)

    if (updateError) {
      console.error('[team/members/delete] Update error:', updateError.message)
      return res.status(500).json({ error: 'Failed to remove member.' })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('[team/members/delete] Error:', e.message)
    res.status(500).json({ error: 'Failed to remove member.' })
  }
})

// ─── DELETE /api/team/invites/:inviteId ──────────────────────────────────────

router.delete('/invites/:inviteId', requireAuth, async (req, res) => {
  if (!assertAccountAdmin(req, res)) return

  try {
    const { inviteId } = req.params
    const accountId    = req.user.account_id

    // Scope the delete to this account so admins can't remove other accounts' invites.
    const { error } = await supabaseAdmin
      .from('invites')
      .delete()
      .eq('id', inviteId)
      .eq('account_id', accountId)

    if (error) {
      console.error('[team/invites/delete] Error:', error.message)
      return res.status(500).json({ error: 'Failed to revoke invite.' })
    }

    res.json({ ok: true })
  } catch (e) {
    console.error('[team/invites/delete] Error:', e.message)
    res.status(500).json({ error: 'Failed to revoke invite.' })
  }
})

// ─── POST /api/team/accept-invite ────────────────────────────────────────────
// Public — invitee may not be signed in yet.

router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password, full_name } = req.body

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required.' })
    }

    // Validate invite: must exist, not expired, not already accepted.
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('invites')
      .select('id, account_id, email, role, type, status, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (inviteError) {
      console.error('[team/accept-invite] Invite lookup error:', inviteError.message)
      return res.status(500).json({ error: 'Failed to look up invite.' })
    }
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or already used.' })
    }
    if (invite.status === 'accepted') {
      return res.status(409).json({ error: 'This invite has already been accepted.' })
    }
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invite has expired.' })
    }

    const { account_id: accountId, email: inviteEmail, role } = invite

    // Look up the account's products so new users get the right entitlement.
    const { data: accountProducts } = await supabaseAdmin
      .from('account_products')
      .select('product_id, plan, status')
      .eq('account_id', accountId)
      .eq('status', 'active')

    // Find the account's first role to assign the new user.
    const { data: accountRoles } = await supabaseAdmin
      .from('roles')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })
      .limit(2)

    // Pick the role that best matches: admin → first role, viewer → second role
    // (falls back to first if there's only one).
    const roleRow = role === 'admin'
      ? (accountRoles?.[0] || null)
      : (accountRoles?.[1] || accountRoles?.[0] || null)
    const roleId = roleRow?.id || null

    // Check if a Supabase auth user already exists with this email.
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = authList?.users?.find(
      u => u.email?.toLowerCase() === inviteEmail.toLowerCase()
    )

    let session = null

    if (existingAuthUser) {
      // ── Existing user ── link them to this account. ──────────────────────
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id:               existingAuthUser.id,
          email:            inviteEmail,
          account_id:       accountId,
          role_id:          roleId,
          is_account_admin: role === 'admin',
          is_super_admin:   false,
          status:           'active',
        })
      if (profileError) {
        console.error('[team/accept-invite] Profile upsert error:', profileError.message)
        return res.status(500).json({ error: 'Failed to link account.' })
      }

      // Grant entitlements for every active product on the account.
      if (accountProducts?.length) {
        for (const ap of accountProducts) {
          await supabaseAdmin
            .from('account_products')
            .upsert({
              account_id:  accountId,
              product_id:  ap.product_id,
              plan:        ap.plan,
              status:      'active',
              started_at:  new Date().toISOString(),
            }, { onConflict: 'account_id,product_id', ignoreDuplicates: true })
        }
      }

      // Sign the existing user in to get a session.
      if (password) {
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin
          .generateLink({ type: 'magiclink', email: inviteEmail })
        // We can't sign in on behalf of the user server-side with a password
        // (the service role key doesn't support signInWithPassword).
        // Return a magic link token instead so the frontend can exchange it.
        if (!signInError && signInData?.properties?.hashed_token) {
          session = { magic_link_token: signInData.properties.hashed_token }
        }
      }
    } else {
      // ── New user ── create Supabase auth user + profile + entitlements. ──
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'A password of at least 6 characters is required.' })
      }

      const sanitizedName = (full_name || '').slice(0, 100).trim()

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email:         inviteEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: sanitizedName, account_id: accountId, role_id: roleId },
      })

      if (createError) {
        console.error('[team/accept-invite] Auth user create error:', createError.message)
        return res.status(500).json({ error: 'Failed to create user account.' })
      }

      const newUserId = createData.user.id

      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id:               newUserId,
          email:            inviteEmail,
          full_name:        sanitizedName,
          account_id:       accountId,
          role_id:          roleId,
          is_account_admin: role === 'admin',
          is_super_admin:   false,
          status:           'active',
        })
      if (profileError) {
        console.error('[team/accept-invite] Profile create error:', profileError.message)
        // Non-fatal — auth user exists; profile can be retried.
      }

      // Grant entitlements for every active product on the account.
      if (accountProducts?.length) {
        for (const ap of accountProducts) {
          await supabaseAdmin
            .from('account_products')
            .upsert({
              account_id:  accountId,
              product_id:  ap.product_id,
              plan:        ap.plan,
              status:      'active',
              started_at:  new Date().toISOString(),
            }, { onConflict: 'account_id,product_id', ignoreDuplicates: true })
        }
      }

      // Generate a session link the frontend can use to log the new user in.
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type:     'magiclink',
        email:    inviteEmail,
      })
      if (linkData?.properties?.hashed_token) {
        session = { magic_link_token: linkData.properties.hashed_token }
      }
    }

    // Mark invite as accepted.
    await supabaseAdmin
      .from('invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('token', token)

    res.json({ session })
  } catch (e) {
    console.error('[team/accept-invite] Error:', e.message)
    res.status(500).json({ error: 'Failed to accept invite.' })
  }
})

module.exports = router
