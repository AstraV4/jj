// Petit wrapper fetch : envoie/recoit du JSON, inclut le cookie de session,
// et leve une erreur { status, error } exploitable par l'UI.
//
// MODE DÉMO : quand la build est faite avec VITE_DEMO=1 (fichier HTML autonome,
// sans serveur), les appels /api/* sont servis par un mock EN MÉMOIRE ci-dessous.
// Rien n'est persisté : c'est uniquement pour prévisualiser l'app.
export const DEMO = import.meta.env.VITE_DEMO === '1';

const demo = { user: null, saved: [], menus: [], seq: 1 };
function ok(data) { return Promise.resolve(data); }

function demoApi(path, method, body) {
  // Auth
  if (path === '/api/auth/me') return ok({ user: demo.user });
  if (path === '/api/auth/signup') {
    demo.user = { id: 1, email: (body.email || 'demo@budgetchef.fr'), emailVerified: true };
    return ok({ demoLogin: true, user: demo.user }); // en démo : connexion directe, pas d'e-mail
  }
  if (path === '/api/auth/login') {
    if (!body.email || !body.password) return Promise.reject({ status: 400, error: 'invalid_credentials' });
    demo.user = { id: 1, email: body.email, emailVerified: true };
    return ok({ user: demo.user });
  }
  if (path === '/api/auth/logout') { demo.user = null; demo.saved = []; demo.menus = []; return ok({ ok: true }); }
  if (path === '/api/auth/resend') return ok({ ok: true });
  // Favoris
  if (path === '/api/me/saved' && method === 'GET') return ok({ recipeIds: demo.saved });
  if (path === '/api/me/saved' && method === 'POST') { if (!demo.saved.includes(body.recipeId)) demo.saved.unshift(body.recipeId); return ok({ recipeIds: demo.saved }); }
  if (path.startsWith('/api/me/saved/') && method === 'DELETE') { const id = path.split('/').pop(); demo.saved = demo.saved.filter(r => r !== id); return ok({ recipeIds: demo.saved }); }
  // Menus
  if (path === '/api/me/menus' && method === 'GET') return ok({ menus: demo.menus });
  if (path === '/api/me/menus' && method === 'POST') { demo.menus.unshift({ id: demo.seq++, label: body.label, data: body.data, planIds: body.planIds, createdAt: Date.now() }); return ok({ menus: demo.menus }); }
  if (path.startsWith('/api/me/menus/') && method === 'DELETE') { const id = Number(path.split('/').pop()); demo.menus = demo.menus.filter(m => m.id !== id); return ok({ menus: demo.menus }); }
  return Promise.reject({ status: 404, error: 'not_found' });
}

export async function api(path, { method = 'GET', body } = {}) {
  if (DEMO) return demoApi(path, method, body || {});
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* pas de corps JSON */ }
  if (!res.ok) throw { status: res.status, error: (data && data.error) || 'error' };
  return data;
}
