import { useState } from 'react';
import { Link } from 'react-router-dom';

const DISMISSED_KEY = 'chg_profile_banner_dismissed';

function nextAction(score) {
  if (score < 40) return { label: 'Add your name to personalize your account →', href: null };
  if (score < 65) return { label: 'Add your email to unlock reports →', href: '/settings/profile' };
  if (score < 85) return { label: 'Add your company name →', href: '/settings/profile' };
  if (score < 100) return { label: 'Add a profile photo →', href: '/settings/profile' };
  return null;
}

export default function ProfileCompletionBanner({ profileScore }) {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === '1'
  );

  if (dismissed || profileScore == null || profileScore >= 100) return null;
  const action = nextAction(profileScore);
  if (!action) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-24 h-1.5 bg-amber-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all"
            style={{ width: `${profileScore}%` }}
          />
        </div>
        <span className="truncate">
          Profile {profileScore}% complete &mdash;{' '}
          {action.href ? (
            <Link to={action.href} className="font-medium underline underline-offset-2 hover:text-amber-900">
              {action.label}
            </Link>
          ) : (
            <span className="font-medium">{action.label}</span>
          )}
        </span>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 text-amber-600 hover:text-amber-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
