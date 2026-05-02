import { useState } from 'react';
import api from '../lib/api';

// Non-dismissable modal — appears immediately after a new phone signup.
// Cannot be closed without submitting a first name (WhatsApp-style).
export default function NameModal({ onComplete }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (firstName.trim().length < 2) return;
    setError('');
    setLoading(true);
    try {
      await api.patch('/users/complete-profile', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">C</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">What should we call you?</h2>
          <p className="text-sm text-gray-500 mt-1">This helps your team know who you are.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-danger-50 border border-danger-500/20 text-danger-500 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              First name <span className="text-danger-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              placeholder="Jane"
              autoFocus
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Last name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
              placeholder="Smith"
              maxLength={50}
            />
          </div>

          <button
            type="submit"
            disabled={loading || firstName.trim().length < 2}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm mt-2"
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
