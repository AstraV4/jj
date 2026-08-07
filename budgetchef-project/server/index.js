import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findUserByEmail, findUserById, createUser, markEmailVerified,
  createVerificationToken, consumeVerificationToken,
  listSavedRecipes, addSavedRecipe, removeSavedRecipe,
  saveMenu, listMenus, deleteMenu,
  getState, setState, getShared, setShared,
} from './db.js';
import { sendVerificationEmail, sendAlreadyRegisteredEmail } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
const COOKIE = 'bc_token';
const secureCookies = APP_URL.startsWith('https');

const app = express();
app.use(express.json());
app.use(cookieParser());

/* ---------------- Helpers ---------------- */
const publicUser = (u) => ({ id: u.id, email: u.email, emailVerified: !!u.email_verified });
const validEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

function setAuthCookie(res, userId) {
  const token = jwt.sign({ uid: userId }, SESSION_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: secureCookies,
    maxAge: 30 * 24 * 60 * 60 * 1000, path: '/',
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const { uid } = jwt.verify(token, SESSION_SECRET);
    const user = findUserById(uid);
    if (!user) return res.status(401).json({ error: 'unauthenticated' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthenticated' });
  }
}

/* ---------------- Inscription ---------------- */
// On renvoie toujours un succes generique pour ne pas reveler si une adresse existe.
app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!validEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    if (password.length < 8) return res.status(400).json({ error: 'weak_password' });

    const existing = findUserByEmail.get(email);
    if (existing) {
      if (existing.email_verified) {
        await sendAlreadyRegisteredEmail(email, `${APP_URL}/?login=1`).catch(() => {});
      } else {
        const token = crypto.randomBytes(32).toString('hex');
        createVerificationToken(existing.id, token);
        await sendVerificationEmail(email, `${APP_URL}/api/auth/verify?token=${token}`).catch(() => {});
      }
      return res.json({ ok: true }); // reponse identique dans tous les cas
    }

    const hash = await bcrypt.hash(password, 10);
    const user = createUser(email, hash);
    const token = crypto.randomBytes(32).toString('hex');
    createVerificationToken(user.id, token);
    await sendVerificationEmail(email, `${APP_URL}/api/auth/verify?token=${token}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('signup error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------------- Verification e-mail ---------------- */
app.get('/api/auth/verify', (req, res) => {
  const token = String(req.query.token || '');
  const userId = consumeVerificationToken(token);
  if (!userId) return res.redirect(`${APP_URL}/?verify=invalid`);
  markEmailVerified(userId);
  setAuthCookie(res, userId); // on connecte directement l'utilisateur
  res.redirect(`${APP_URL}/?verified=1`);
});

/* ---------------- Connexion ---------------- */
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = findUserByEmail.get(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (!user.email_verified) return res.status(403).json({ error: 'email_not_verified' });
    setAuthCookie(res, user.id);
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---------------- Renvoyer l'e-mail de verification ---------------- */
app.post('/api/auth/resend', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = findUserByEmail.get(email);
  if (user && !user.email_verified) {
    const token = crypto.randomBytes(32).toString('hex');
    createVerificationToken(user.id, token);
    await sendVerificationEmail(email, `${APP_URL}/api/auth/verify?token=${token}`).catch(() => {});
  }
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.json({ user: null });
  try {
    const { uid } = jwt.verify(token, SESSION_SECRET);
    const user = findUserById(uid);
    res.json({ user: user ? publicUser(user) : null });
  } catch { res.json({ user: null }); }
});

/* ---------------- Recettes favorites ---------------- */
app.get('/api/me/saved', requireAuth, (req, res) => {
  res.json({ recipeIds: listSavedRecipes(req.user.id) });
});
app.post('/api/me/saved', requireAuth, (req, res) => {
  const recipeId = String(req.body?.recipeId || '');
  if (!recipeId) return res.status(400).json({ error: 'missing_recipe' });
  addSavedRecipe(req.user.id, recipeId);
  res.json({ recipeIds: listSavedRecipes(req.user.id) });
});
app.delete('/api/me/saved/:recipeId', requireAuth, (req, res) => {
  removeSavedRecipe(req.user.id, String(req.params.recipeId));
  res.json({ recipeIds: listSavedRecipes(req.user.id) });
});

/* ---------------- Historique des menus ---------------- */
app.get('/api/me/menus', requireAuth, (req, res) => {
  res.json({ menus: listMenus(req.user.id) });
});
app.post('/api/me/menus', requireAuth, (req, res) => {
  const { data, planIds, label } = req.body || {};
  if (!data || !Array.isArray(planIds)) return res.status(400).json({ error: 'invalid_menu' });
  saveMenu(req.user.id, label, data, planIds);
  res.json({ menus: listMenus(req.user.id) });
});
app.delete('/api/me/menus/:id', requireAuth, (req, res) => {
  deleteMenu(req.user.id, Number(req.params.id));
  res.json({ menus: listMenus(req.user.id) });
});

/* ---------------- État utilisateur (notes, déjà cuisiné, préférences…) ---------------- */
app.get('/api/me/state', requireAuth, (req, res) => { res.json({ state: getState(req.user.id) }); });
app.put('/api/me/state', requireAuth, (req, res) => {
  const cur = getState(req.user.id);
  const next = { ...cur, ...(req.body?.patch || {}) };
  setState(req.user.id, next);
  res.json({ state: next });
});

/* ---------------- Liste de courses partagée (temps réel par sondage) ---------------- */
app.post('/api/share', requireAuth, (req, res) => {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  setShared(code, req.body?.items || []);
  res.json({ code });
});
app.get('/api/share/:code', (req, res) => {
  const s = getShared(String(req.params.code).toUpperCase());
  if (!s) return res.status(404).json({ error: 'not_found' });
  res.json(s);
});
app.put('/api/share/:code', (req, res) => {
  const s = setShared(String(req.params.code).toUpperCase(), req.body?.items || []);
  res.json(s);
});

/* ---------------- Photos des plats (proxy Pexels, clé côté serveur) ---------------- */
const _photoCache = new Map();
app.get('/api/photo', async (req, res) => {
  const key = process.env.PEXELS_API_KEY;
  const q = String(req.query.query || '').slice(0, 80).trim();
  if (!key || !q) return res.json({ url: null });
  if (_photoCache.has(q)) return res.json({ url: _photoCache.get(q) });
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=square`, { headers: { Authorization: key } });
    if (!r.ok) throw new Error('pexels');
    const d = await r.json();
    const p = d.photos && d.photos[0];
    const url = p ? (p.src.large || p.src.medium || p.src.small) : null;
    _photoCache.set(q, url);
    res.json({ url });
  } catch { res.json({ url: null }); }
});

/* ---------------- Service du site compile (SPA) ---------------- */
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => console.log(`BudgetChef Pro en écoute sur le port ${PORT} — ${APP_URL}`));
