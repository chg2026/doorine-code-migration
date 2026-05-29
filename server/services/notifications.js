const { Resend } = require('resend')
const { supabaseAdmin } = require('../middleware/auth')

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM_ADDRESS = 'REI Flywheel <onboarding@resend.dev>'

/**
 * Insert a notification row into deallink_notifications.
 * @param {string} userId
 * @param {string} type
 * @param {string} title
 * @param {string} body
 * @param {object} metadata
 * @returns {object} The created row.
 */
async function createNotification(userId, type, title, body, metadata = {}) {
  const { data, error } = await supabaseAdmin
    .from('deallink_notifications')
    .insert({ user_id: userId, type, title, body, metadata, read: false })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Send a transactional email via Resend.
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 * @returns {object} The Resend API response.
 */
async function sendEmailNotification(to, subject, html) {
  if (!resend) throw new Error('RESEND_API_KEY is not configured.')

  const response = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  })

  return response
}

/**
 * Mark a single notification as read, scoped to the owning user.
 * @param {string} notificationId
 * @param {string} userId
 */
async function markAsRead(notificationId, userId) {
  const { error } = await supabaseAdmin
    .from('deallink_notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Return the count of unread notifications for a user.
 * @param {string} userId
 * @returns {number}
 */
async function getUnreadCount(userId) {
  const { count, error } = await supabaseAdmin
    .from('deallink_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  if (error) throw error
  return count ?? 0
}

module.exports = { createNotification, sendEmailNotification, markAsRead, getUnreadCount }
