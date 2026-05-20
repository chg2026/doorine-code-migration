import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { DealLinkAPI } from './lib/deallink-api.js';

const StoreContext = createContext(null);

const EMPTY_PROFILE = {
  handle: '', name: '', initials: '', bio: '', city: '', email: '',
  featuredId: null, onboarding: {}, marketplaceOptIn: false,
  avatarUrl: '', backgroundType: 'solid', backgroundValue: '#161b2e',
  socialLinks: {},
};

function defaultState() {
  return {
    profile: { ...EMPTY_PROFILE },
    deals: [], leads: [], buyers: [], offers: [],
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
        buyers: action.buyers || [],
        offers: action.offers || [],
        onboarding: { ...state.onboarding, ...(action.profile?.onboarding || {}) },
        auth: { signedIn: !!action.signedIn },
        loaded: true,
        error: null,
      };
    case 'set_auth': return { ...state, auth: { signedIn: !!action.signedIn } };
    case 'set_profile':
      return {
        ...state,
        profile: { ...state.profile, ...action.profile },
        onboarding: { ...state.onboarding, ...(action.profile?.onboarding || {}) },
      };
    case 'set_deals':   return { ...state, deals: action.deals };
    case 'set_leads':   return { ...state, leads: action.leads };
    case 'set_buyers':  return { ...state, buyers: action.buyers };
    case 'set_offers':  return { ...state, offers: action.offers };
    case '_optimistic_add_deal':   return { ...state, deals: [action.deal, ...state.deals] };
    case '_optimistic_add_deals':  return { ...state, deals: [...action.deals, ...state.deals] };
    case '_optimistic_update_deal':return { ...state, deals: state.deals.map((d) => d.id === action.id ? { ...d, ...action.patch } : d) };
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
    case '_replace_deal':  return { ...state, deals: state.deals.map((d) => d.id === action.tempId ? action.deal : d) };
    case '_optimistic_add_buyer':   return { ...state, buyers: [action.buyer, ...state.buyers] };
    case '_optimistic_update_buyer':return { ...state, buyers: state.buyers.map((b) => b.id === action.id ? { ...b, ...action.patch } : b) };
    case '_optimistic_remove_buyer':return { ...state, buyers: state.buyers.filter((b) => b.id !== action.id) };
    case '_optimistic_add_offer':   return { ...state, offers: [action.offer, ...state.offers] };
    case '_optimistic_update_offer':return { ...state, offers: state.offers.map((o) => o.id === action.id ? { ...o, ...action.patch } : o) };
    case '_optimistic_remove_offer':return { ...state, offers: state.offers.filter((o) => o.id !== action.id) };
    case 'reset':       return defaultState();
    case 'set_error':   return { ...state, error: action.error };
    default:            return state;
  }
}

let _tempCounter = 0;
function tempId() { return `tmp-${Date.now()}-${++_tempCounter}`; }

export function StoreProvider({ children }) {
  const auth = useAuth();
  const [state, rawDispatch] = useReducer(reducer, null, defaultState);
  const [reload, setReload] = useState(0);
  const errorRef = useRef(null);

  const authUserId = auth.user?.id ?? null;
  const deallinkAccess = auth.hasProductAccess('deallink');

  const handleError = useCallback((err, fallback = 'Something went wrong') => {
    const msg = err?.response?.data?.error || err?.message || fallback;
    errorRef.current = msg;
    rawDispatch({ type: 'set_error', error: msg });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (auth.loading) return;
      if (!auth.user) { rawDispatch({ type: 'reset' }); return; }
      if (!auth.hasProductAccess('deallink')) {
        rawDispatch({ type: 'hydrate', signedIn: true, profile: null, deals: [], leads: [], buyers: [], offers: [] });
        return;
      }
      try {
        const [profile, deals, leads, buyersRes, offersRes] = await Promise.all([
          DealLinkAPI.getProfile(),
          DealLinkAPI.listDeals(),
          DealLinkAPI.listLeads(),
          DealLinkAPI.listBuyers().then((d) => ({ ok: true, data: d })).catch((err) => ({ ok: false, err })),
          DealLinkAPI.listOffers().then((d) => ({ ok: true, data: d })).catch((err) => ({ ok: false, err })),
        ]);
        if (cancelled) return;
        if (!buyersRes.ok) handleError(buyersRes.err, 'Failed to load buyers');
        if (!offersRes.ok) handleError(offersRes.err, 'Failed to load offers');
        rawDispatch({
          type: 'hydrate', signedIn: true, profile, deals, leads,
          buyers: buyersRes.ok ? buyersRes.data : [],
          offers: offersRes.ok ? offersRes.data : [],
        });
      } catch (e) {
        if (cancelled) return;
        handleError(e, 'Failed to load REI Flywheel data');
        rawDispatch({ type: 'hydrate', signedIn: true, profile: null, deals: [], leads: [], buyers: [], offers: [] });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [auth.loading, authUserId, deallinkAccess, reload, handleError]);

  const refetchDeals  = useCallback(async () => { try { const d = await DealLinkAPI.listDeals();  rawDispatch({ type: 'set_deals',  deals: d  }); } catch (e) { handleError(e); } }, [handleError]);
  const refetchLeads  = useCallback(async () => { try { const d = await DealLinkAPI.listLeads();  rawDispatch({ type: 'set_leads',  leads: d  }); } catch (e) { handleError(e); } }, [handleError]);
  const refetchBuyers = useCallback(async () => { try { const d = await DealLinkAPI.listBuyers(); rawDispatch({ type: 'set_buyers', buyers: d }); } catch (e) { handleError(e); } }, [handleError]);
  const refetchOffers = useCallback(async () => { try { const d = await DealLinkAPI.listOffers(); rawDispatch({ type: 'set_offers', offers: d }); } catch (e) { handleError(e); } }, [handleError]);

  const dispatch = useCallback(async (action) => {
    switch (action.type) {
      case 'sign_in': return;
      case 'sign_out':
        try { await auth.signOut(); } catch (e) { handleError(e); }
        return;
      case 'update_profile': {
        rawDispatch({ type: '_optimistic_update_profile', patch: action.patch });
        try {
          const updated = { ...state.profile, ...action.patch };
          const p = await DealLinkAPI.putProfile(updated);
          rawDispatch({ type: 'set_profile', profile: p });
        } catch (e) { handleError(e, 'Failed to save profile'); setReload((n) => n + 1); }
        return;
      }
      case 'update_onboarding': {
        const nextOnboarding = { ...state.onboarding, ...action.patch };
        rawDispatch({ type: '_optimistic_update_profile', patch: { onboarding: nextOnboarding } });
        try {
          const updated = { ...state.profile, onboarding: nextOnboarding };
          const p = await DealLinkAPI.putProfile(updated);
          rawDispatch({ type: 'set_profile', profile: p });
        } catch (e) { handleError(e, 'Failed to update onboarding'); }
        return;
      }
      case 'add_deal': {
        const temp = { id: tempId(), status: 'New', new: true, hideStreet: false, tags: [], ...action.deal };
        rawDispatch({ type: '_optimistic_add_deal', deal: temp });
        try {
          const created = await DealLinkAPI.createDeal(action.deal);
          rawDispatch({ type: '_replace_deal', tempId: temp.id, deal: created });
        } catch (e) { handleError(e, 'Failed to add deal'); await refetchDeals(); }
        return;
      }
      case 'add_deals': {
        const stamped = action.deals.map((d) => ({ id: tempId(), status: 'New', new: true, hideStreet: false, tags: [], ...d }));
        rawDispatch({ type: '_optimistic_add_deals', deals: stamped });
        try { await DealLinkAPI.createDeals(action.deals); await refetchDeals(); }
        catch (e) { handleError(e, 'Bulk import failed'); await refetchDeals(); }
        return;
      }
      case 'update_deal': {
        rawDispatch({ type: '_optimistic_update_deal', id: action.id, patch: action.patch });
        if (String(action.id).startsWith('tmp-')) return;
        try {
          const updated = await DealLinkAPI.updateDeal(action.id, action.patch);
          rawDispatch({ type: '_replace_deal', tempId: action.id, deal: updated });
        } catch (e) {
          // Roll back optimistic state by refetching the canonical row.
          await refetchDeals();
          // Callers that need to react to failure (e.g. show their own error
          // toast) can opt in via { throwOnError: true } — otherwise we
          // continue to surface the global error toast as before.
          if (action.throwOnError) throw e;
          handleError(e, 'Failed to save deal');
        }
        return;
      }
      case 'remove_deal': {
        rawDispatch({ type: '_optimistic_remove_deal', id: action.id });
        if (String(action.id).startsWith('tmp-')) return;
        try { await DealLinkAPI.deleteDeal(action.id); }
        catch (e) { handleError(e, 'Failed to delete deal'); await refetchDeals(); }
        return;
      }
      case 'add_buyer': {
        const temp = { id: tempId(), status: 'Active', buyerType: 'Cash Buyer', markets: [], propertyTypes: [], minPrice: 0, maxPrice: 0, ...action.buyer };
        rawDispatch({ type: '_optimistic_add_buyer', buyer: temp });
        try { await DealLinkAPI.createBuyer(action.buyer); await refetchBuyers(); }
        catch (e) { handleError(e, 'Failed to add buyer'); await refetchBuyers(); }
        return;
      }
      case 'update_buyer': {
        rawDispatch({ type: '_optimistic_update_buyer', id: action.id, patch: action.patch });
        if (String(action.id).startsWith('tmp-')) return;
        try { await DealLinkAPI.updateBuyer(action.id, action.patch); }
        catch (e) { handleError(e, 'Failed to save buyer'); await refetchBuyers(); }
        return;
      }
      case 'remove_buyer': {
        rawDispatch({ type: '_optimistic_remove_buyer', id: action.id });
        if (String(action.id).startsWith('tmp-')) return;
        try { await DealLinkAPI.deleteBuyer(action.id); }
        catch (e) { handleError(e, 'Failed to delete buyer'); await refetchBuyers(); }
        return;
      }
      case 'add_offer': {
        const temp = { id: tempId(), status: 'Pending', amount: 0, ...action.offer };
        rawDispatch({ type: '_optimistic_add_offer', offer: temp });
        try { await DealLinkAPI.createOffer(action.offer); await refetchOffers(); }
        catch (e) { handleError(e, 'Failed to add offer'); await refetchOffers(); }
        return;
      }
      case 'update_offer': {
        rawDispatch({ type: '_optimistic_update_offer', id: action.id, patch: action.patch });
        if (String(action.id).startsWith('tmp-')) return;
        try { await DealLinkAPI.updateOffer(action.id, action.patch); }
        catch (e) { handleError(e, 'Failed to save offer'); await refetchOffers(); }
        return;
      }
      case 'remove_offer': {
        rawDispatch({ type: '_optimistic_remove_offer', id: action.id });
        if (String(action.id).startsWith('tmp-')) return;
        try { await DealLinkAPI.deleteOffer(action.id); }
        catch (e) { handleError(e, 'Failed to delete offer'); await refetchOffers(); }
        return;
      }
      default:
        rawDispatch(action);
    }
  }, [auth, state.profile, state.onboarding, handleError, refetchDeals, refetchLeads, refetchBuyers, refetchOffers]);

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

export function useToast() {
  const [msg, setMsg] = React.useState(null);
  const timer = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[rgba(0,0,0,0.06)] border border-[rgba(0,0,0,0.08)] text-[#1d1d1f] text-sm px-4 py-2 rounded-lg shadow-lg animate-fade-in">
      {msg}
    </div>
  ) : null;
  return { show, node };
}
