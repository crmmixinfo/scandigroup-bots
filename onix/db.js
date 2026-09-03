// ONIX — baza qatlami

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
});

const q = (sql, params = []) => pool.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0] || null;
const all = async (sql, params) => (await q(sql, params)).rows;

// ================= Foydalanuvchilar =================

const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID, 10);

// @ belgisi va harf registrini tozalaydi
const normUsername = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase() || null;

async function getUser(tgId) {
  const row = await one('SELECT * FROM onix_users WHERE tg_id = $1 AND active = true', [tgId]);
  if (row) return row;

  // Super admin bazada bo'lmasa ham kira oladi — birinchi ishga tushirish uchun.
  // Lekin uni darhol yozib qo'yamiz: onix_operations.created_by bu jadvalga
  // bog'langan, shuning uchun yozilmagan admin operatsiya saqlay olmaydi.
  if (tgId && tgId === SUPER_ADMIN_ID) return addUser(tgId, 'Super admin', 'admin', tgId);
  return null;
}

const listUsers = () =>
  all("SELECT * FROM onix_users WHERE active = true ORDER BY array_position(ARRAY['admin','cashier','staff','manager'], role), full_name");

async function addUser(tgId, fullName, role, addedBy, username = null) {
  const user = await one(`
    INSERT INTO onix_users (tg_id, full_name, role, active, added_by, username)
    VALUES ($1, $2, $3, true, $4, $5)
    ON CONFLICT (tg_id) DO UPDATE SET full_name = $2, role = $3, active = true,
                                      username = COALESCE($5, onix_users.username)
    RETURNING *`, [tgId, fullName, role, addedBy, normUsername(username)]);

  // Hodimga ikkala valyutada podotchyot hisobi ochiladi
  if (role === 'staff') await ensurePodotchet(tgId, fullName);
  return user;
}

const deactivateUser = (tgId) =>
  q('UPDATE onix_users SET active = false WHERE tg_id = $1', [tgId]);

// ---------- Username bo'yicha oldindan ro'yxatga olish ----------

const addPendingUser = (username, fullName, role, addedBy) =>
  one(`INSERT INTO onix_pending_users (username, full_name, role, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET full_name = $2, role = $3, added_by = $4, added_at = NOW()
       RETURNING *`, [normUsername(username), fullName, role, addedBy]);

const listPendingUsers = () =>
  all('SELECT * FROM onix_pending_users ORDER BY added_at');

const removePendingUser = (username) =>
  q('DELETE FROM onix_pending_users WHERE username = $1', [normUsername(username)]);

// Hodim /start bosganda: username bo'yicha kutayotgan yozuvni topib,
// haqiqiy tg_id bilan bog'laydi. Topilmasa null qaytaradi.
async function bindPendingUser(tgId, username) {
  const key = normUsername(username);
  if (!key) return null;
  const pending = await one('SELECT * FROM onix_pending_users WHERE username = $1', [key]);
  if (!pending) return null;
  const user = await addUser(tgId, pending.full_name, pending.role, pending.added_by, key);
  await removePendingUser(key);
  return user;
}

// Username o'zgargan bo'lsa yangilab turamiz — keyingi safar topilishi uchun
const touchUsername = (tgId, username) =>
  q('UPDATE onix_users SET username = $2 WHERE tg_id = $1 AND username IS DISTINCT FROM $2',
    [tgId, normUsername(username)]);

async function ensurePodotchet(tgId, fullName) {
  for (const currency of ['UZS', 'USD']) {
    await q(`
      INSERT INTO onix_accounts (name, kind, currency, owner_tg_id, emoji, sort_order)
      VALUES ($1, 'podotchet', $2, $3, '👛', 200)
      ON CONFLICT (owner_tg_id, currency) WHERE kind = 'podotchet'
      DO UPDATE SET name = $1, active = true`,
      [`${fullName} (${currency === 'UZS' ? 'sum' : '$'})`, currency, tgId]);
  }
}

// ================= Sozlamalar =================

const getSetting = async (key) => {
  const row = await one('SELECT value FROM onix_settings WHERE key = $1', [key]);
  return row ? row.value : null;
};

const setSetting = (key, value) =>
  q(`INSERT INTO onix_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`, [key, value]);

// ================= Hisoblar =================

// kind: 'kassa' — podotchyot bo'lmagan hisoblar; 'podotchet' — hodim qo'lidagi pul
function listAccounts({ kind, currency, ownerTgId } = {}) {
  const where = ['active = true'];
  const params = [];
  if (kind === 'kassa')          where.push("kind <> 'podotchet'");
  else if (kind)                 where.push(`kind = $${params.push(kind)}`);
  if (currency)                  where.push(`currency = $${params.push(currency)}`);
  if (ownerTgId)                 where.push(`owner_tg_id = $${params.push(ownerTgId)}`);
  return all(`SELECT * FROM onix_accounts WHERE ${where.join(' AND ')} ORDER BY sort_order, id`, params);
}

const getAccount = (id) => one('SELECT * FROM onix_accounts WHERE id = $1', [id]);

// Qoldiqlar — onix_balances ko'rinishidan
function balances({ kind, currency, ownerTgId } = {}) {
  const where = ['active = true'];
  const params = [];
  if (kind === 'kassa')          where.push("kind <> 'podotchet'");
  else if (kind)                 where.push(`kind = $${params.push(kind)}`);
  if (currency)                  where.push(`currency = $${params.push(currency)}`);
  if (ownerTgId)                 where.push(`owner_tg_id = $${params.push(ownerTgId)}`);
  return all(`SELECT * FROM onix_balances WHERE ${where.join(' AND ')} ORDER BY sort_order, account_id`, params);
}

// ================= Kategoriyalar =================

// Daraxt: 1 — guruh, 2 — kategoriya, 3 — podkategoriya

const listGroups = (flow) =>
  all('SELECT * FROM onix_categories WHERE level = 1 AND flow = $1 AND active = true ORDER BY sort_order, id', [flow]);

const listChildren = (parentId) =>
  all('SELECT * FROM onix_categories WHERE parent_id = $1 AND active = true ORDER BY sort_order, id', [parentId]);

// Tugun + uning to'liq yo'li (guruh › kategoriya › podkategoriya)
const getCategory = (id) =>
  one(`SELECT n.*,
              COALESCE(g.id, p.id)       AS group_id,
              COALESCE(g.name, p.name)   AS group_name,
              COALESCE(g.emoji, p.emoji) AS group_emoji,
              CASE WHEN g.id IS NOT NULL THEN p.id   ELSE n.id   END AS cat_id,
              CASE WHEN g.id IS NOT NULL THEN p.name ELSE n.name END AS cat_name
       FROM onix_categories n
       LEFT JOIN onix_categories p ON p.id = n.parent_id
       LEFT JOIN onix_categories g ON g.id = p.parent_id
       WHERE n.id = $1`, [id]);

// Tugunning ostida aktiv bolasi bormi (barg ekanini aniqlash uchun)
const hasChildren = async (id) =>
  (await one('SELECT 1 FROM onix_categories WHERE parent_id = $1 AND active LIMIT 1', [id])) !== null;

const addCategory = (parentId, level, name, flow, emoji) =>
  one(`INSERT INTO onix_categories (parent_id, level, name, flow, emoji) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [parentId, level, name, flow, emoji]);

// Guruhni o'chirsa — ostidagi kategoriya va podkategoriyalar ham yashiriladi
const deactivateCategory = (id) =>
  q(`WITH RECURSIVE tree AS (
       SELECT id FROM onix_categories WHERE id = $1
       UNION ALL
       SELECT c.id FROM onix_categories c JOIN tree t ON c.parent_id = t.id
     )
     UPDATE onix_categories SET active = false WHERE id IN (SELECT id FROM tree)`, [id]);

// To'liq daraxt — /cats va tekshiruvlar uchun
const categoryTree = (flow) =>
  all(`SELECT g.id AS group_id, g.name AS group_name, g.emoji AS group_emoji,
              c.id AS cat_id,   c.name AS cat_name,   c.emoji AS cat_emoji,
              s.id AS sub_id,   s.name AS sub_name
       FROM onix_categories g
       LEFT JOIN onix_categories c ON c.parent_id = g.id AND c.active
       LEFT JOIN onix_categories s ON s.parent_id = c.id AND s.active
       WHERE g.level = 1 AND g.flow = $1 AND g.active
       ORDER BY g.sort_order, g.id, c.sort_order, c.id, s.sort_order, s.id`, [flow]);

// ================= Operatsiyalar =================

async function addOperation(op) {
  return one(`
    INSERT INTO onix_operations
      (type, account_id, to_account_id, category_id, amount, to_amount, currency,
       paid_at, period, note, photo_file_id, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *`,
    [op.type, op.account_id, op.to_account_id || null, op.category_id || null,
     op.amount, op.to_amount || null, op.currency,
     op.paid_at, op.period, op.note || null, op.photo_file_id || null, op.created_by]);
}

const getOperation = (id) =>
  one(`SELECT o.*,
              a.name AS account_name,  a.emoji AS account_emoji,
              t.name AS to_account_name,
              COALESCE(g.name, p.name) AS group_name,
              CASE WHEN g.id IS NOT NULL THEN p.name ELSE n.name END AS cat_name,
              CASE WHEN g.id IS NOT NULL THEN n.name END AS category_name,
              u.full_name AS author_name
       FROM onix_operations o
       JOIN onix_accounts a  ON a.id = o.account_id
       LEFT JOIN onix_accounts t ON t.id = o.to_account_id
       LEFT JOIN onix_categories n ON n.id = o.category_id
       LEFT JOIN onix_categories p ON p.id = n.parent_id
       LEFT JOIN onix_categories g ON g.id = p.parent_id
       LEFT JOIN onix_users u ON u.tg_id = o.created_by
       WHERE o.id = $1`, [id]);

const softDelete = (id, byTgId, reason) =>
  one(`UPDATE onix_operations SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3,
                                  restored_at = NULL, restored_by = NULL
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id, byTgId, reason || null]);

// Bekor qilingan yozuvni qaytarish. deleted_by va delete_reason o'chirilmaydi:
// yozuv qachon, kim tomonidan bekor qilingani va nega — tarixda qoladi.
const restore = (id, byTgId) =>
  one(`UPDATE onix_operations SET deleted_at = NULL, restored_at = NOW(), restored_by = $2
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`, [id, byTgId]);

// Kassa daftari — sana oralig'i / muallif / hisob bo'yicha
function listOperations({ from, to, createdBy, accountId, limit = 30, offset = 0 } = {}) {
  const where = ['o.deleted_at IS NULL'];
  const params = [];
  if (from)      where.push(`o.paid_at >= $${params.push(from)}`);
  if (to)        where.push(`o.paid_at <= $${params.push(to)}`);
  if (createdBy) where.push(`o.created_by = $${params.push(createdBy)}`);
  if (accountId) where.push(`(o.account_id = $${params.push(accountId)} OR o.to_account_id = $${params.length})`);

  params.push(limit, offset);
  return all(`
    SELECT o.*,
           a.name AS account_name, a.emoji AS account_emoji,
           t.name AS to_account_name,
           COALESCE(g.name, p.name) AS group_name,
           CASE WHEN g.id IS NOT NULL THEN p.name ELSE n.name END AS cat_name,
           CASE WHEN g.id IS NOT NULL THEN n.name END AS category_name,
           u.full_name AS author_name
    FROM onix_operations o
    JOIN onix_accounts a  ON a.id = o.account_id
    LEFT JOIN onix_accounts t ON t.id = o.to_account_id
    LEFT JOIN onix_categories n ON n.id = o.category_id
    LEFT JOIN onix_categories p ON p.id = n.parent_id
    LEFT JOIN onix_categories g ON g.id = p.parent_id
    LEFT JOIN onix_users u ON u.tg_id = o.created_by
    WHERE ${where.join(' AND ')}
    ORDER BY o.paid_at DESC, o.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
}

function countOperations({ from, to, createdBy, accountId } = {}) {
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (from)      where.push(`paid_at >= $${params.push(from)}`);
  if (to)        where.push(`paid_at <= $${params.push(to)}`);
  if (createdBy) where.push(`created_by = $${params.push(createdBy)}`);
  if (accountId) where.push(`(account_id = $${params.push(accountId)} OR to_account_id = $${params.length})`);
  return one(`SELECT COUNT(*)::int AS n FROM onix_operations WHERE ${where.join(' AND ')}`, params);
}

module.exports = {
  pool, q, one, all, SUPER_ADMIN_ID,
  getUser, listUsers, addUser, deactivateUser, ensurePodotchet, normUsername,
  addPendingUser, listPendingUsers, removePendingUser, bindPendingUser, touchUsername,
  getSetting, setSetting,
  listAccounts, getAccount, balances,
  listGroups, listChildren, hasChildren, getCategory, addCategory, deactivateCategory, categoryTree,
  addOperation, getOperation, softDelete, restore, listOperations, countOperations,
};
