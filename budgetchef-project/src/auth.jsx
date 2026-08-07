import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Mail, Lock, X, Loader2, CheckCircle2, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { api, DEMO } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [savedIds, setSavedIds] = useState(new Set());
  const [menus, setMenus] = useState([]);
  const [ustate, setUstate] = useState({}); // { ratings:{}, cooked:[], prefs:{} }
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login | signup

  const loadUserData = useCallback(async () => {
    try {
      const [s, m, st] = await Promise.all([api('/api/me/saved'), api('/api/me/menus'), api('/api/me/state')]);
      setSavedIds(new Set(s.recipeIds || []));
      setMenus(m.menus || []);
      setUstate(st.state || {});
    } catch { /* non connecte : on ignore */ }
  }, []);

  useEffect(() => {
    api('/api/auth/me')
      .then(d => { setUser(d.user); if (d.user) loadUserData(); })
      .catch(() => {})
      .finally(() => setLoadingAuth(false));
  }, [loadUserData]);

  const login = async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setUser(d.user);
    await loadUserData();
    return d.user;
  };
  const signup = async (email, password) => {
    const d = await api('/api/auth/signup', { method: 'POST', body: { email, password } });
    if (d && d.demoLogin) { setUser(d.user); await loadUserData(); return { demo: true }; }
    return d;
  };
  const resend = (email) => api('/api/auth/resend', { method: 'POST', body: { email } });
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null); setSavedIds(new Set()); setMenus([]); setUstate({});
  };

  const openAuth = (mode = 'login') => { setAuthMode(mode); setAuthOpen(true); };
  const closeAuth = () => setAuthOpen(false);

  const isSaved = (recipeId) => savedIds.has(recipeId);
  const toggleSaved = async (recipeId) => {
    if (!user) { openAuth('login'); return; }
    try {
      const res = savedIds.has(recipeId)
        ? await api(`/api/me/saved/${recipeId}`, { method: 'DELETE' })
        : await api('/api/me/saved', { method: 'POST', body: { recipeId } });
      setSavedIds(new Set(res.recipeIds || []));
    } catch { /* ignore */ }
  };

  const saveCurrentMenu = async (data, planIds, label) => {
    if (!user) { openAuth('login'); return false; }
    const res = await api('/api/me/menus', { method: 'POST', body: { data, planIds, label } });
    setMenus(res.menus || []);
    return true;
  };
  const removeMenu = async (id) => {
    const res = await api(`/api/me/menus/${id}`, { method: 'DELETE' });
    setMenus(res.menus || []);
  };

  // État utilisateur : fusion optimiste + persistance serveur
  const patchState = async (patch) => {
    if (!user) { openAuth('login'); return; }
    setUstate(s => ({ ...s, ...patch }));
    try { const r = await api('/api/me/state', { method: 'PUT', body: { patch } }); setUstate(r.state || {}); } catch { /* ignore */ }
  };
  const ratingOf = (id) => (ustate.ratings || {})[id] || 0;
  const setRating = (id, n) => patchState({ ratings: { ...(ustate.ratings || {}), [id]: n } });
  const isCooked = (id) => (ustate.cooked || []).includes(id);
  const toggleCooked = (id) => { const c = new Set(ustate.cooked || []); c.has(id) ? c.delete(id) : c.add(id); patchState({ cooked: [...c] }); };
  const prefs = ustate.prefs || null;
  const savePrefs = (p) => patchState({ prefs: p });

  // Liste de courses partagée (par code) — persistée serveur, sondage côté client
  const createShared = async (items) => { if (!user) { openAuth('login'); return null; } try { const r = await api('/api/share', { method: 'POST', body: { items } }); return r.code; } catch { return null; } };
  const fetchShared = async (code) => { try { return await api(`/api/share/${code}`); } catch { return null; } };
  const putShared = async (code, items) => { try { return await api(`/api/share/${code}`, { method: 'PUT', body: { items } }); } catch { return null; } };

  const value = {
    user, loadingAuth, savedIds, menus, ustate,
    login, signup, resend, logout,
    authOpen, authMode, openAuth, closeAuth,
    isSaved, toggleSaved, saveCurrentMenu, removeMenu,
    ratingOf, setRating, isCooked, toggleCooked, prefs, savePrefs,
    createShared, fetchShared, putShared,
  };
  return (
    <AuthCtx.Provider value={value}>
      {children}
      {authOpen && <AuthModal />}
      {DEMO && (
        <div className="fixed bottom-20 sm:bottom-3 left-3 z-[80] rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg">
          Aperçu démo — les comptes ne sont pas sauvegardés
        </div>
      )}
    </AuthCtx.Provider>
  );
}

const ERR_MSG = {
  invalid_email: 'Adresse e-mail invalide.',
  weak_password: 'Le mot de passe doit faire au moins 8 caractères.',
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_verified: 'Ton adresse n\'est pas encore vérifiée. Vérifie ta boîte mail.',
  error: 'Une erreur est survenue, réessaie.',
};

function AuthModal() {
  const { authMode, closeAuth, login, signup, resend } = useAuth();
  const [mode, setMode] = useState(authMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);        // e-mail de verification envoye (apres inscription)
  const [showResend, setShowResend] = useState(false); // proposer de renvoyer (login non verifie)

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setShowResend(false); setBusy(true);
    try {
      if (mode === 'signup') {
        const res = await signup(email, password);
        if (res && res.demo) closeAuth(); else setSent(true);
      } else {
        await login(email, password);
        closeAuth();
      }
    } catch (ex) {
      setErr(ERR_MSG[ex.error] || ERR_MSG.error);
      if (ex.error === 'email_not_verified') setShowResend(true);
    } finally { setBusy(false); }
  };

  const doResend = async () => { await resend(email).catch(() => {}); setSent(true); setShowResend(false); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={closeAuth}
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl animate-[modalRise_0.35s_cubic-bezier(0.16,1,0.3,1)]">
        <button onClick={closeAuth} className="absolute top-4 right-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><X className="h-4 w-4" /></button>

        {sent ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50"><Mail className="h-6 w-6 text-emerald-600" /></div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Vérifie ta boîte mail</h3>
            <p className="text-sm text-slate-500 leading-relaxed">On a envoyé un lien de confirmation à <b className="text-slate-700">{email}</b>. Clique dessus pour activer ton compte, puis connecte-toi.</p>
            <button onClick={closeAuth} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">J'ai compris</button>
            <button onClick={doResend} className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">Renvoyer l'e-mail</button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">🥗</div>
              <span className="font-bold text-slate-900">Budget<span className="text-emerald-600">Chef</span></span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">{mode === 'signup' ? 'Créer un compte' : 'Se connecter'}</h3>
            <p className="text-sm text-slate-500 mb-5">{mode === 'signup' ? 'Sauvegarde tes recettes et retrouve tes menus.' : 'Ravi de te revoir.'}</p>

            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Adresse e-mail" autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe (8 caractères min.)" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
              </div>

              {err && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-none" /> <span>{err}</span>
                </div>
              )}
              {showResend && (
                <button type="button" onClick={doResend} className="w-full text-xs font-semibold text-emerald-600 hover:text-emerald-700">Renvoyer l'e-mail de vérification</button>
              )}

              <button type="submit" disabled={busy}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />)}
                {mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-500">
              {mode === 'signup' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); setShowResend(false); }} className="font-semibold text-emerald-600 hover:text-emerald-700">
                {mode === 'signup' ? 'Se connecter' : 'Créer un compte'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Petite banniere de confirmation apres verification e-mail (?verified=1)
export function VerifiedBanner() {
  const [show, setShow] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('verified') === '1') setShow(true);
    if (p.get('verify') === 'invalid') setInvalid(true);
    if (p.get('verified') || p.get('verify') || p.get('login')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  if (!show && !invalid) return null;
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg animate-[fadeIn_0.3s_ease-out] ${invalid ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
      {invalid ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      {invalid ? 'Lien de vérification invalide ou expiré.' : 'Adresse vérifiée — te voilà connecté !'}
      <button onClick={() => { setShow(false); setInvalid(false); }} className="ml-1 opacity-80 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}
