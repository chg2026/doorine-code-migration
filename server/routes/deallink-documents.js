// Deal Link — documents on a deal.
// Mounted at /api/deallink/deals/:dealId/documents in server/index.js behind
// requireAuth + requireProduct('deallink') + scopeToAccount, so every handler
// already has req.account_filter / req.user.
//
// Upload flow (client never streams files through Express):
//   1. Client POST /signed-upload  -> { storagePath, token, signedUrl }
//   2. Client uploads directly to Supabase Storage with uploadToSignedUrl(...)
//   3. Client POST /                -> commits a row in deallink_documents
//
// Download flow:
//   GET /:docId/download -> { signedUrl } valid for 1h.

const express = require('express')
const crypto = require('crypto')
const { supabaseAdmin } = require('../middleware/auth')

const router = express.Router({ mergeParams: true })

const BUCKET = 'deallink-documents'
const VALID_CATEGORIES = new Set(['Contract', 'Inspection', 'Photos', 'Title', 'Other'])
const SIGNED_DOWNLOAD_TTL = 60 * 60          // 1h
const SIGNED_UPLOAD_TTL   = 60 * 5           // 5m (Supabase enforces its own min)

function dbOrFail(res) {
  if (!supabaseAdmin) {
    res.status(503).json({ error: 'Supabase admin client not configured.' })
    return null
  }
  return supabaseAdmin
}

function accountIdFor(req) {
  if (req.user?.is_super_admin && req.query?.account_id) return req.query.account_id
  return req.account_filter || req.user?.account_id || null
}

// Verify the deal belongs to the caller's account; otherwise 404 (don't leak
// existence across tenants). Returns the deal row on success, null on miss
// (response already sent).
async function loadOwnedDeal(req, res, db, accountId) {
  const dealId = req.params.dealId
  if (!dealId) { res.status(400).json({ error: 'Missing deal id.' }); return null }
  const { data, error } = await db
    .from('deallink_deals')
    .select('id,account_id')
    .eq('id', dealId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) { res.status(500).json({ error: error.message }); return null }
  if (!data)  { res.status(404).json({ error: 'Deal not found.' }); return null }
  return data
}

function sanitizeFilename(name) {
  // Strip path separators + control chars, trim, default if empty.
  const cleaned = String(name || '').replace(/[\\/\x00-\x1f]+/g, '_').trim()
  return cleaned || 'document'
}

// ─── LIST ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const deal = await loadOwnedDeal(req, res, db, accountId); if (!deal) return

  const { data, error } = await db
    .from('deallink_documents')
    .select('*')
    .eq('deal_id', deal.id)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ documents: data || [] })
})

// ─── SIGNED UPLOAD URL ────────────────────────────────────────────────────

router.post('/signed-upload', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const deal = await loadOwnedDeal(req, res, db, accountId); if (!deal) return

  const filename = sanitizeFilename(req.body?.filename)
  const storagePath = `${accountId}/${deal.id}/${crypto.randomUUID()}-${filename}`

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (error) return res.status(500).json({ error: error.message })
  res.json({
    storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
    bucket: BUCKET,
    expiresIn: SIGNED_UPLOAD_TTL,
  })
})

// ─── COMMIT METADATA ──────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const deal = await loadOwnedDeal(req, res, db, accountId); if (!deal) return

  const name          = sanitizeFilename(req.body?.name)
  const categoryRaw   = req.body?.category || 'Other'
  const category      = VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : 'Other'
  const storagePath   = String(req.body?.storage_path || '').trim()
  const fileSizeBytes = Number(req.body?.file_size_bytes) || 0
  const mimeType      = String(req.body?.mime_type || '').slice(0, 200)

  if (!storagePath) return res.status(400).json({ error: 'storage_path is required.' })
  // Belt-and-braces: the path must start with this account's folder. This
  // protects against a client lying about which storage object to commit.
  const expectedPrefix = `${accountId}/${deal.id}/`
  if (!storagePath.startsWith(expectedPrefix)) {
    return res.status(400).json({ error: 'storage_path does not match this deal.' })
  }

  const row = {
    account_id:      accountId,
    deal_id:         deal.id,
    name,
    category,
    storage_path:    storagePath,
    file_size_bytes: fileSizeBytes,
    mime_type:       mimeType,
  }

  const { data, error } = await db
    .from('deallink_documents')
    .insert(row)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ document: data })
})

// ─── SIGNED DOWNLOAD URL ──────────────────────────────────────────────────

router.get('/:docId/download', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const deal = await loadOwnedDeal(req, res, db, accountId); if (!deal) return

  const { data: doc, error } = await db
    .from('deallink_documents')
    .select('storage_path,name')
    .eq('id', req.params.docId)
    .eq('deal_id', deal.id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  if (!doc)  return res.status(404).json({ error: 'Document not found.' })

  const { data, error: sErr } = await db.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_DOWNLOAD_TTL, { download: doc.name })

  if (sErr) return res.status(500).json({ error: sErr.message })
  res.json({ signedUrl: data.signedUrl, expiresIn: SIGNED_DOWNLOAD_TTL })
})

// ─── DELETE ───────────────────────────────────────────────────────────────

router.delete('/:docId', async (req, res) => {
  const db = dbOrFail(res); if (!db) return
  const accountId = accountIdFor(req)
  if (!accountId) return res.status(400).json({ error: 'No account_id available.' })
  const deal = await loadOwnedDeal(req, res, db, accountId); if (!deal) return

  // Read first so we know which storage object to remove and so we can
  // confirm tenant ownership before any side effects.
  const { data: doc, error: rErr } = await db
    .from('deallink_documents')
    .select('id,storage_path')
    .eq('id', req.params.docId)
    .eq('deal_id', deal.id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (rErr) return res.status(500).json({ error: rErr.message })
  if (!doc)  return res.status(404).json({ error: 'Document not found.' })

  // Best-effort storage removal first; if this fails the row stays, so the
  // user can retry. If the row delete fails after storage removal, the file
  // is gone and a stale row would remain — log so we'd see this in practice.
  const { error: sErr } = await db.storage.from(BUCKET).remove([doc.storage_path])
  if (sErr) return res.status(500).json({ error: sErr.message })

  const { error: dErr } = await db
    .from('deallink_documents')
    .delete()
    .eq('id', doc.id)
    .eq('account_id', accountId)
  if (dErr) {
    // eslint-disable-next-line no-console
    console.error('[deallink-documents] storage object removed but row delete failed', dErr)
    return res.status(500).json({ error: dErr.message })
  }

  res.json({ ok: true })
})

module.exports = router
