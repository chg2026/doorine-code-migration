import { useState } from 'react';
import Layout from '../../components/Layout';
import { Card } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import toast from 'react-hot-toast';

export default function Profile() {
  const { profile, updatePassword, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/users/profile', form);
      await refreshProfile();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    }
    setSaving(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPass !== passwordForm.confirm) { toast.error('Passwords do not match'); return; }
    if (passwordForm.newPass.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setChangingPw(true);
    try {
      await updatePassword(passwordForm.newPass);
      toast.success('Password updated');
      setPasswordForm({ current: '', newPass: '', confirm: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    }
    setChangingPw(false);
  };

  return (
    <Layout title="Profile & Settings">
      <div className="max-w-2xl space-y-6">
        <Card className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Profile Information</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={profile?.email || ''} disabled
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <button type="submit" disabled={saving}
              className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Change Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={passwordForm.newPass} onChange={e => setPasswordForm(f => ({ ...f, newPass: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="At least 8 characters" required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="••••••••" required />
            </div>
            <button type="submit" disabled={changingPw}
              className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50">
              {changingPw ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Account Information</h3>
          <div className="text-sm space-y-2 text-gray-600">
            <div className="flex justify-between"><span>Account</span><span className="font-medium text-gray-900">{profile?.account_name || '—'}</span></div>
            <div className="flex justify-between"><span>Plan</span><span className="font-medium text-gray-900 capitalize">{profile?.plan_tier || '—'}</span></div>
            <div className="flex justify-between"><span>Role</span><span className="font-medium text-gray-900">{profile?.role_name || '—'}</span></div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Billing</h3>
          <p className="text-sm text-gray-500 mb-4">Manage your subscription and payment method.</p>
          <button disabled className="bg-gray-100 text-gray-400 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed">
            Manage Billing (Coming Soon)
          </button>
        </Card>
      </div>
    </Layout>
  );
}
