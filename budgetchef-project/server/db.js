// Couche base de donnees : SQLite (via better-sqlite3), stocke dans DATA_DIR.
// Sur Railway, pense a attacher un volume monte sur DATA_DIR pour que les
// comptes soient conserves entre deux deploiements.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'budgetchef.db'));
db.pragma('journal_mode = WAL'); // meilleures perfs en lecture/ecriture concurrente

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS verification_tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS saved_recipes (
    user_id   INTEGER NOT NULL,
    recipe_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, recipe_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS menus (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    label      TEXT,
    data_json  TEXT NOT NULL,
    plan_json  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS user_state (
    user_id   INTEGER PRIMARY KEY,
    json      TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS shared_lists (
    code       TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const now = () => Date.now();

/* ---------------- Utilisateurs ---------------- */
export const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const _findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
export const findUserById = (id) => _findUserById.get(id);

const _createUser = db.prepare('INSERT INTO users (email, password_hash, email_verified, created_at) VALUES (?, ?, 0, ?)');
export function createUser(email, passwordHash) {
  const info = _createUser.run(email, passwordHash, now());
  return findUserById(info.lastInsertRowid);
}

const _verifyUser = db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?');
export const markEmailVerified = (userId) => _verifyUser.run(userId);

/* ---------------- Tokens de verification ---------------- */
const _insertToken = db.prepare('INSERT INTO verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)');
const _deleteUserTokens = db.prepare('DELETE FROM verification_tokens WHERE user_id = ?');
export function createVerificationToken(userId, token, ttlMs = 24 * 60 * 60 * 1000) {
  _deleteUserTokens.run(userId); // un seul token actif par utilisateur
  _insertToken.run(token, userId, now() + ttlMs);
}
const _getToken = db.prepare('SELECT * FROM verification_tokens WHERE token = ?');
const _deleteToken = db.prepare('DELETE FROM verification_tokens WHERE token = ?');
export function consumeVerificationToken(token) {
  const row = _getToken.get(token);
  if (!row) return null;
  _deleteToken.run(token);
  if (row.expires_at < now()) return null; // expire
  return row.user_id;
}

/* ---------------- Recettes sauvegardees ---------------- */
const _listSaved = db.prepare('SELECT recipe_id FROM saved_recipes WHERE user_id = ? ORDER BY created_at DESC');
export const listSavedRecipes = (userId) => _listSaved.all(userId).map(r => r.recipe_id);
const _addSaved = db.prepare('INSERT OR IGNORE INTO saved_recipes (user_id, recipe_id, created_at) VALUES (?, ?, ?)');
export const addSavedRecipe = (userId, recipeId) => _addSaved.run(userId, recipeId, now());
const _delSaved = db.prepare('DELETE FROM saved_recipes WHERE user_id = ? AND recipe_id = ?');
export const removeSavedRecipe = (userId, recipeId) => _delSaved.run(userId, recipeId);

/* ---------------- Menus (historique) ---------------- */
const _insertMenu = db.prepare('INSERT INTO menus (user_id, label, data_json, plan_json, created_at) VALUES (?, ?, ?, ?, ?)');
export function saveMenu(userId, label, data, planIds) {
  const info = _insertMenu.run(userId, label || null, JSON.stringify(data), JSON.stringify(planIds), now());
  return info.lastInsertRowid;
}
const _listMenus = db.prepare('SELECT id, label, data_json, plan_json, created_at FROM menus WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
export function listMenus(userId) {
  return _listMenus.all(userId).map(m => ({
    id: m.id, label: m.label, createdAt: m.created_at,
    data: JSON.parse(m.data_json), planIds: JSON.parse(m.plan_json),
  }));
}
const _delMenu = db.prepare('DELETE FROM menus WHERE id = ? AND user_id = ?');
export const deleteMenu = (userId, id) => _delMenu.run(id, userId);

/* ---------------- État utilisateur (notes, déjà cuisiné, préférences, éco) ---------------- */
const _getState = db.prepare('SELECT json FROM user_state WHERE user_id = ?');
export function getState(userId) { const r = _getState.get(userId); return r ? JSON.parse(r.json) : {}; }
const _setState = db.prepare('INSERT INTO user_state (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json');
export function setState(userId, obj) { _setState.run(userId, JSON.stringify(obj || {})); return obj; }

/* ---------------- Liste de courses partagée (par code) ---------------- */
const _getShared = db.prepare('SELECT json, updated_at FROM shared_lists WHERE code = ?');
export function getShared(code) { const r = _getShared.get(code); return r ? { items: JSON.parse(r.json), updatedAt: r.updated_at } : null; }
const _setShared = db.prepare('INSERT INTO shared_lists (code, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at');
export function setShared(code, items) { _setShared.run(code, JSON.stringify(items || []), Date.now()); return { items, updatedAt: Date.now() }; }

export default db;
