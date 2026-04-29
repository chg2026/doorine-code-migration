import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

// Returns { gate, showModal, handleEmailSaved, handleDismiss }.
// Call gate(action) before any gated feature. If the user has an email it
// resolves immediately. For email-less users, the first call increments their
// counter and proceeds; the second call opens the modal and waits for
// email submission before resolving.
//
// Usage:
//   const { gate, showModal, handleEmailSaved, handleDismiss } = useEmailGate();
//   // In JSX: {showModal && <EmailGateModal onSaved={handleEmailSaved} onDismiss={handleDismiss} />}
//   // Before feature: await gate(() => doThing());
export function useEmailGate() {
  const { profile, refreshProfile } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const gate = useCallback(async (action) => {
    if (profile?.email) {
      return action();
    }

    const uses = profile?.unverified_feature_uses ?? 0;

    if (uses < 1) {
      // First use — increment server-side counter, refresh profile so the next
      // call to gate() sees uses=1, then proceed with the feature.
      try {
        await api.patch('/users/complete-profile', {});
        await refreshProfile();
      } catch {
        // fail-open: don't block the user if the increment call fails
      }
      return action();
    }

    // Second+ use — show modal before proceeding
    return new Promise((resolve) => {
      setPendingAction(() => async () => {
        await action();
        resolve();
      });
      setShowModal(true);
    });
  }, [profile, refreshProfile]);

  const handleEmailSaved = useCallback(async () => {
    setShowModal(false);
    await refreshProfile();
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction, refreshProfile]);

  const handleDismiss = useCallback(() => {
    setShowModal(false);
    setPendingAction(null);
  }, []);

  return { gate, showModal, handleEmailSaved, handleDismiss };
}
