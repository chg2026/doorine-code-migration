import { useState } from 'react';
import api from '../lib/api';

// Rendered by consumers of useEmailGate(). Shows when a phone-only user
// attempts a gated feature for the second time.
export default function EmailGateModal({ onSaved, onDismiss }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.patch('/users/complete-profile', { email: trimmed });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save email. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Add your email to continue</h2>
          <p className="text-sm text-gray-500 mt-1">
            You've used this feature once. Add your email to keep going.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-danger-50 border border-danger-500/20 text-danger-500 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              placeholder="you@company.com"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? 'Saving...' : 'Save and Continue'}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Not now
          </button>
        </form>
      </div>
    </div>
  );
}
