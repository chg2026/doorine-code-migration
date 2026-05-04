import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { DealLinkAPI } from './lib/deallink-api.js';

// ─── STORE ────────────────────────────────────────────────────────────────
// Replaces the original localStorage-backed reducer. The reducer is still
// the source of truth for the UI, but every mutation now flows through
// the Express API (`/api/deallink/*`) and is hydrated from Supabase.
//
// Pages keep dispatching the same action shapes they always have
// (`add_deal`, `update_deal`, `update_profile`, `update_onboarding`,
// `add_deals`, `remove_deal`, `sign_out`) — `dispatch` is wrapped so each
// of those triggers an optimistic local update + the corresponding API
// call. On API failure we toast and refetch the affected list to recover.

const StoreContext = createContext(null);

const EMPTY_PROFILE = {
  handle: '', name: '', initials: '', bio: '', city: '', email: '',
  featuredId: null, onboarding: {},
};

function defaultState() {
  return {
    profile: { ...EMPTY_PROFILE },
    deals: [],
    leads: [],
    onboarding: { claimed: false, addedDeal: false, uploadedPhotos: false, shared: false },
    auth: { signedIn: false },
    loaded: false,
    error: null,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        profile: action.profile || { ...EMPTY_PROFILE },
        deals: action.deals || [],
        leads: action.leads || [],
        onboarding: { ...state.onboarding, ...(action.profile?.onboarding || {}) },
        auth: { signedIn: !!action.signedIn },
        loaded: true,
        error: null,
      };
    case 'set_auth':
      return { ...state, auth: { signedIn: !!action.signedIn } };
    case 'set_profile':
      return {
        ...state,
        profile: { ...state.profile, ...action.profile },
        onboarding: { ...state.onboarding, ...(action.profile?.onboarding || {}) },
      };
    case 'set_deals':
      return { ...state, deals: action.deals };
    case 'set_leads':
      return { ...state, leads: action.leads };
    case '_optimistic_add_deal':
      return { ...state, deals: [action.deal, ...state.deals] };
    case '_optimistic_add_deals':
      return { ...state, deals: [...action.deals, ...state.deals] };
    case '_optimistic_update_deal':
      return { ...state, deals: state.deals.map((d) => d.id === action.id ? { ...d, ...action.patch } : d) };
    case '_optimistic_remove_deal':
      return {
        ...state,
        deals: state.deals.filter((d) => d.id !== action.id),
        profile: state.profile.featuredId === action.id ? { ...state.profile, featuredId: null } : state.profile,
      };
    case '_optimistic_update_profile':
      return {
        ...state,
        profile: { ...state.profile, ...action.patch },
        onboarding: action.patch.onboarding ? { ...state.onboarding, ...action.patch.onboarding } : state.onboarding,
      };
    case '_replace_deal':
      return { ...state, deals: state.deals.map((d) => d.id === action.tempId ? action.deal : d) };
    case 'reset':
      return defaultState();
    case 'set_error':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

let _tempCounter = 0;
function tempId() { return `tmp-${Date.now()}-${++_tempCounter}`; }

export function StoreProvider({ children }) {
  const auth = useAuth();
  const [state, rawDispatch] = useReducer(reducer, null, defaultState);
  const [reload, setReload] = useState(0);
  const errorRef = useRef(null);

  // Stable primitives derived from auth — used as dep-array values below so
  // the hydration effect doesn't re-run on every render caused by entitlements
  // being a new array reference after each fetchMe() call.
  const authUserId = auth.user?.id ?? null;
  const deallinkAccess = auth.hasProductAccess('deallink');

  const handleError = useCallback((err, fallback = 'Something went wrong') => {
    const msg = err?.response?.data?.error || err?.message || fallback;
    errorRef.current = msg;
    rawDispatch({ type: 'set_error', error: msg });
  }, []);

  // Hydrate when auth + entitlement are ready. If the user lacks the
  // deallink entitlement, AccessDenied renders before this provider's
  // children mount real admin UI, so we don't try to hit /api/deallink.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (auth.loading) return;
      if (!auth.user) {
        rawDispatch({ type: 'reset' });
        return;
      }
      if (!auth.hasProductAccess('deallink')) {
        // Mark loaded so AccessDenied has a known state to render against.
        rawDispatch({ type: 'hydrate', signedIn: true, profile: null, deals: [], leads: [] });
        return;
      }
      try {
        const [profile, deals, leads] = await Promise.all([
          DealLinkAPI.getProfile(),
          DealLinkAPI.listDeals(),
          DealLinkAPI.listLeads(),
        ]);
        if (cancelled) return;
        rawDispatch({ type: 'hydrate', signedIn: true, profile, deals, leads });
      } catch (e) {
        if (cancelled) return;
        handleError(e, 'Failed to load Deal Link data');
        rawDispatch({ type: 'hydrate', signedIn: true, profile: null, deals: [], leads: [] });
      }
    }

    load();
    return () => { cancelled = true; };
  }, [auth.loading, authUserId, deallinkAccess, reload, handleError]);

  const refetchDeals = useCallback(async () => {
    try {
      const deals = await DealLinkAPI.listDeals();
      rawDispatch({ type: 'set_deals', deals });
    } catch (e) { handleError(e); }
  }, [handleError]);

  const refetchLeads = useCallback(async () => {
    try {
      const leads = await DealLinkAPI.listLeads();
      rawDispatch({ type: 'set_leads', leads });
    } catch (e) { handleError(e); }
  }, [handleError]);

  // Wrapped dispatch — keeps the page-side action contract identical to
  // the localStorage version. Each mutating action does an optimistic
  // local apply, then fires the API call. On error we refetch.
  const dispatch = useCallback(async (action) => {
    switch (action.type) {
      case 'sign_in':
        // Real sign-in happens in the Login page via supabase.auth. This
        // shim is kept so legacy dispatch sites still compile.
        return;
      case 'sign_out':
        try { await auth.signOut(); } catch (e) { handleError(e); }
        return;
      case 'update_profile': {
        rawDispatch({ type: '_optimistic_update_profile', patch: action.patch });
        try {
          const updated = { ...state.profile, ...action.patch };
          const p = await DealLinkAPI.putProfile(updated);
          rawDispatch({ type: 'set_profile', profile: p });
        } catch (e) {
          handleError(e, 'Failed to save profile');
          setReload((n) => n + 1);
        }
        return;
      }
      case 'update_onboarding': {
        const nextOnboarding = { ...state.onboarding, ...action.patch };
        rawDispatch({ type: '_optimistic_update_profile', patch: { onboarding: nextOnboarding } });
        try {
          const updated = { ...state.profile, onboarding: nextOnboarding };
          const p = await DealLinkAPI.putProfile(updated);
          rawDispatch({ type: 'set_profile', profile: p });
        } catch (e) {
          handleError(e, 'Failed to update onboarding');
        }
        return;
      }
      case 'add_deal': {
        const temp = { id: tempId(), status: 'active', new: true, hideStreet: false, ...action.deal };
        rawDispatch({ type: '_optimistic_add_deal', deal: temp });
        try {
          const created = await DealLinkAPI.createDeal(action.deal);
          rawDispatch({ type: '_replace_deal', tempId: temp.id, deal: created });
        } catch (e) {
          handleError(e, 'Failed to add deal');
          await refetchDeals();
        }
        return;
      }
      case 'add_deals': {
        const stamped = action.deals.map((d) => ({ id: tempId(), status: 'active', new: true, hideStreet: false, ...d }));
        rawDispatch({ type: '_optimistic_add_deals', deals: stamped });
        try {
          await DealLinkAPI.createDeals(action.deals);
          await refetchDeals();
        } catch (e) {
          handleError(e, 'Bulk import failed');
          await refetchDeals();
        }
        return;
      }
      case 'update_deal': {
        rawDispatch({ type: '_optimistic_update_deal', id: action.id, patch: action.patch });
        // tempIds aren't on the server yet; let the create complete first.
        if (String(action.id).startsWith('tmp-')) return;
        try {
          const updated = await DealLinkAPI.updateDeal(action.id, action.patch);
          rawDispatch({ type: '_replace_deal', tempId: action.id, deal: updated });
        } catch (e) {
          handleError(e, 'Failed to save deal');
          await refetchDeals();
        }
        return;
      }
      case 'remove_deal': {
        rawDispatch({ type: '_optimistic_remove_deal', id: action.id });
        if (String(action.id).startsWith('tmp-')) return;
        try {
          await DealLinkAPI.deleteDeal(action.id);
        } catch (e) {
          handleError(e, 'Failed to delete deal');
          await refetchDeals();
        }
        return;
      }
      // NOTE: There is intentionally no `add_lead` action. Public lead
      // capture goes through `PublicAPI.submitLead` from the public
      // pages directly (PublicProfile, DealDetail) — those forms run
      // without a store/StoreProvider context. Authenticated admin code
      // never creates leads, only reads them via `state.leads`. If you
      // need to add a lead from inside the admin app, call the API
      // directly and refetch.
      default:
        // Unknown actions fall through to the raw reducer (useful for
        // future additions and tests).
        rawDispatch(action);
    }
  }, [auth, state.profile, state.onboarding, handleError, refetchDeals, refetchLeads]);

  return (
    <StoreContext.Provider value={{ state, dispatch, refresh: () => setReload((n) => n + 1) }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// Toast hook — unchanged from the original prototype.
export function useToast() {
  const [msg, setMsg] = React.useState(null);
  const timer = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const node = msg ? <div className="toast">{msg}</div> : null;
  return { show, node };
}
