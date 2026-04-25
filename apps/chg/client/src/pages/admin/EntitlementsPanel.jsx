import { useEffect, useState } from 'react';
import { Card, StatusBadge, LoadingSpinner, EmptyState, ConfirmModal } from '../../components/ui';
import api from '../../lib/api';
import toast from 'react-hot-toast';

// Mirrors server/routes/admin.js → PLANS_BY_PRODUCT.
// Keep in sync; the server is authoritative and will reject mismatches.
const PLANS_BY_PRODUCT = {
  chg: ['starter', 'pro', 'enterprise'],
  deallink: ['free', 'pro'],
};

const PRODUCT_LABEL = {
  chg: 'CHG CRM',
  deallink: 'Deal Link',
};

/**
 * EntitlementsPanel — modal overlay for managing one account's product entitlements.
 *
 * Server contract (server/routes/admin.js):
 *   GET    /admin/accounts/:id/entitlements                  → list
 *   POST   /admin/accounts/:id/entitlements                  → grant   { product_code, plan }
 *   PATCH  /admin/accounts/:id/entitlements/:product_code    → re-plan { plan }
 *   DELETE /admin/accounts/:id/entitlements/:product_code    → revoke (soft, idempotent)
 *
 * Soft-delete model: revoke flips status='disabled' + stamps disabled_at/by.
 * Re-granting clears those audit fields. Plan picked at grant time.
 */
export default function EntitlementsPanel({ account, onClose, onChanged }) {
  const [entitlements, setEntitlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const fetchEntitlements = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/accounts/${account.id}/entitlements`);
      setEntitlements(r.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to load entitlements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account?.id) fetchEntitlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const notifyParent = () => { if (onChanged) onChanged(); };

  const handleGrant = async ({ product_code, plan }) => {
    try {
      await api.post(`/admin/accounts/${account.id}/entitlements`, { product_code, plan });
      toast.success(`Granted ${PRODUCT_LABEL[product_code] || product_code} (${plan})`);
      setShowGrant(false);
      await fetchEntitlements();
      notifyParent();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Grant failed');
    }
  };

  const handlePlanChange = async (product_code, plan) => {
    try {
      await api.patch(`/admin/accounts/${account.id}/entitlements/${product_code}`, { plan });
      toast.success('Plan updated');
      await fetchEntitlements();
      notifyParent();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Plan change failed');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.delete(`/admin/accounts/${account.id}/entitlements/${revokeTarget.product_code}`);
      toast.success(`Revoked ${PRODUCT_LABEL[revokeTarget.product_code] || revokeTarget.product_code}`);
      setRevokeTarget(null);
      await fetchEntitlements();
      notifyParent();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Revoke failed');
    } finally {
      setRevoking(false);
    }
  };

  // Products eligible for the Grant modal: those NOT currently active for this
  // account. Disabled entitlements ARE eligible (re-grant clears disabled_at).
  const grantableProducts = Object.keys(PLANS_BY_PRODUCT).filter(code => {
    const ent = entitlements.find(e => e.product_code === code);
    return !ent || ent.status === 'disabled';
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Entitlements</h3>
            <p className="text-sm text-gray-500">{account?.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" title="Close" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowGrant(true)}
            disabled={grantableProducts.length === 0}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={grantableProducts.length === 0 ? 'All products are already active for this account' : ''}>
            + Grant Entitlement
          </button>
        </div>

        <Card>
          {loading ? <LoadingSpinner /> : entitlements.length === 0 ? (
            <EmptyState
              title="No entitlements yet"
              description="Grant CHG or Deal Link access to give this account's users a product."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Product</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Plan</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Started</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>
                </tr></thead>
                <tbody>
                  {entitlements.map(e => {
                    const isActive = e.status === 'active';
                    const plans = PLANS_BY_PRODUCT[e.product_code] || [];
                    return (
                      <tr key={e.product_code} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{PRODUCT_LABEL[e.product_code] || e.product_name || e.product_code}</div>
                          <div className="text-xs text-gray-500">{e.product_code}</div>
                        </td>
                        <td className="px-4 py-3">
                          {isActive && plans.length > 0 ? (
                            <select
                              value={e.plan}
                              onChange={ev => handlePlanChange(e.product_code, ev.target.value)}
                              className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 capitalize">
                              {plans.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          ) : (
                            <span className="capitalize text-gray-500">{e.plan}</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                        <td className="px-4 py-3 text-gray-500">
                          {e.started_at ? new Date(e.started_at).toLocaleDateString() : '—'}
                          {!isActive && e.disabled_at && (
                            <div className="text-xs text-gray-400">
                              revoked {new Date(e.disabled_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isActive ? (
                            <button
                              onClick={() => setRevokeTarget(e)}
                              className="text-sm text-danger-500 hover:text-danger-600 font-medium">
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => setShowGrant(true)}
                              className="text-sm text-primary-500 hover:text-primary-600 font-medium">
                              Re-grant
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
            Close
          </button>
        </div>
      </div>

      {showGrant && (
        <GrantEntitlementModal
          grantableProducts={grantableProducts}
          existing={entitlements}
          onCancel={() => setShowGrant(false)}
          onSubmit={handleGrant}
        />
      )}
      {revokeTarget && (
        <ConfirmModal
          title="Revoke entitlement"
          message={`Revoke ${PRODUCT_LABEL[revokeTarget.product_code] || revokeTarget.product_code} access for "${account.name}"? Users in this account will lose access immediately. This is reversible — re-granting restores the entitlement.`}
          confirmLabel="Revoke"
          danger
          loading={revoking}
          onConfirm={handleRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}

function GrantEntitlementModal({ grantableProducts, existing, onCancel, onSubmit }) {
  const initialProduct = grantableProducts[0] || 'chg';
  const [productCode, setProductCode] = useState(initialProduct);
  const [plan, setPlan] = useState((PLANS_BY_PRODUCT[initialProduct] || [])[0] || '');
  const [saving, setSaving] = useState(false);

  const plans = PLANS_BY_PRODUCT[productCode] || [];
  const priorDisabled = existing.find(e => e.product_code === productCode && e.status === 'disabled');

  const handleProductChange = (code) => {
    setProductCode(code);
    setPlan((PLANS_BY_PRODUCT[code] || [])[0] || '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSubmit({ product_code: productCode, plan });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Grant Entitlement</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
            <select
              value={productCode}
              onChange={ev => handleProductChange(ev.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500">
              {grantableProducts.map(code => (
                <option key={code} value={code}>{PRODUCT_LABEL[code] || code}</option>
              ))}
            </select>
            {priorDisabled && (
              <p className="text-xs text-gray-500 mt-1">
                Previously revoked on {new Date(priorDisabled.disabled_at).toLocaleDateString()} —
                granting will reactivate.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={plan}
              onChange={ev => setPlan(ev.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 capitalize">
              {plans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" disabled={saving || !plan}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg disabled:opacity-50">
              {saving ? 'Granting...' : 'Grant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
