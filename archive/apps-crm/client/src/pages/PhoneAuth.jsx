import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NameModal from '../components/NameModal';
import { resolveChgPlatformUrl } from '../lib/chgPlatformUrl';

const PHONE_RE = /^\+1[2-9]\d{9}$/;

export default function PhoneAuth() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('ENTER_PHONE'); // 'ENTER_PHONE' | 'ENTER_CODE'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showNameModal, setShowNameModal] = useState(false);
  const codeRef = useRef(null);
  const cooldownRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(cooldownRef.current);
  }, []);

  const startCooldown = () => {
    setResendCooldown(30);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendOtp = async (phoneNumber) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/phone/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code.');
      setStage('ENTER_CODE');
      startCooldown();
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    if (!PHONE_RE.test(phone)) {
      setError('Enter a valid US number in +1XXXXXXXXXX format.');
      return;
    }
    sendOtp(phone);
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/phone/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      // Hydrate the Supabase client with the session so AuthContext picks it up.
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (data.isNewUser) {
        setShowNameModal(true);
      } else {
        const target = await resolveChgPlatformUrl();
        if (target) {
          window.location.href = target;
          return;
        }
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (showNameModal) {
    return (
      <NameModal
        onComplete={async () => {
          const target = await resolveChgPlatformUrl();
          if (target) {
            window.location.href = target;
            return;
          }
          navigate('/');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign up with your phone</h1>
          <p className="text-gray-500 mt-1">We'll text you a verification code</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
          {error && (
            <div className="bg-danger-50 border border-danger-500/20 text-danger-500 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {stage === 'ENTER_PHONE' ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                  placeholder="+12125551234"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">US numbers only · format: +1XXXXXXXXXX</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? 'Sending...' : 'Send Code'}
              </button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-primary-500 hover:text-primary-600 font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  6-digit code sent to {phone}
                </label>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm tracking-widest text-center text-lg"
                  placeholder="••••••"
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>

              <button
                type="button"
                disabled={resendCooldown > 0}
                onClick={() => sendOtp(phone)}
                className="w-full text-sm text-primary-500 hover:text-primary-600 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Cleveland Holding Group · Operations Platform
        </p>
      </div>
    </div>
  );
}
