import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback } from 'react';
import { loadState, saveState, newId } from './data.js';

const StoreContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'sign_in':
      return { ...state, auth: { signedIn: true } };
    case 'sign_out':
      return { ...state, auth: { signedIn: false } };
    case 'update_profile':
      return { ...state, profile: { ...state.profile, ...action.patch } };
    case 'add_deal': {
      const id = action.deal.id || newId();
      const deal = { id, status: 'active', new: true, hideStreet: false, ...action.deal };
      return { ...state, deals: [deal, ...state.deals] };
    }
    case 'add_deals': {
      const incoming = action.deals.map(d => ({ id: d.id || newId(), status: 'active', new: true, hideStreet: false, ...d }));
      return { ...state, deals: [...incoming, ...state.deals] };
    }
    case 'update_deal':
      return { ...state, deals: state.deals.map(d => d.id === action.id ? { ...d, ...action.patch } : d) };
    case 'remove_deal':
      return {
        ...state,
        deals: state.deals.filter(d => d.id !== action.id),
        profile: state.profile.featuredId === action.id ? { ...state.profile, featuredId: null } : state.profile,
      };
    case 'add_lead':
      return { ...state, leads: [{ id: 'l' + Math.random().toString(36).slice(2, 8), createdAt: Date.now(), ...action.lead }, ...state.leads] };
    case 'update_onboarding':
      return { ...state, onboarding: { ...state.onboarding, ...action.patch } };
    case 'replace':
      return action.state;
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    saveState(state);
  }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
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
  const node = msg ? <div className="toast">{msg}</div> : null;
  return { show, node };
}
