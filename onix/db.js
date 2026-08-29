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

async function getUser(tgId) {
  const row = await one('SELECT * FROM onix_users WHERE tg_id = $1 AND active = true', [tgId]);
  if (row) return row;
  // Super admin bazada bo'lmasa ham kira oladi — birinchi ishga tushirish uchun
  if (tgId === SUPER_ADMIN_ID) return { tg_id: tgId, full_name: 'Super admin', role: 'admin', active: true };
  return null;
}

const listUsers = () =>
  all("SELECT * FROM onix_users WHERE active = true ORDER BY array_position(ARRAY['admin','cashier','staff','manager'], role), full_name");

async function addUser(tgId, fullName, role, addedBy) {
  const user = await one(`
    INSERT INTO onix_users (tg_id, full_name, role, active, added_by)
    VALUES ($1, $2, $3, true, $4)
    ON CONFLICT (tg_id) DO UPDATE SET full_name = $2, role = $3, active = true
    RETURNING *`, [tgId, fullName, role, addedBy]);

  // Hodimga ikkala valyutada podotchyot hisobi ochiladi
  if (role === 'staff') await ensurePodotchet(tgId, fullName);
  return user;
}

const deactivateUser = (tgId) =>
  q('UPDATE onix_users SET active = false WHERE tg_id = $1', [tgId]);

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

// Podkategoriya + uning kategoriyasi va guruhi
const getCategory = (id) =>
  one(`SELECT c.*,
              p.id AS cat_id,   p.name AS cat_name,   p.emoji AS cat_emoji,
              g.id AS group_id, g.name AS group_name, g.emoji AS group_emoji
       FROM onix_categories c
       LEFT JOIN onix_categories p ON p.id = c.parent_id
       LEFT JOIN onix_categories g ON g.id = p.parent_id
       WHERE c.id = $1`, [id]);

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
              c.name AS category_name,
              p.name AS cat_name,   p.emoji AS cat_emoji,
              g.name AS group_name, g.emoji AS group_emoji,
              u.full_name AS author_name
       FROM onix_operations o
       JOIN onix_accounts a  ON a.id = o.account_id
       LEFT JOIN onix_accounts t ON t.id = o.to_account_id
       LEFT JOIN onix_categories c ON c.id = o.category_id
       LEFT JOIN onix_categories p ON p.id = c.parent_id
       LEFT JOIN onix_categories g ON g.id = p.parent_id
       LEFT JOIN onix_users u ON u.tg_id = o.created_by
       WHERE o.id = $1`, [id]);

const softDelete = (id, byTgId, reason) =>
  one(`UPDATE onix_operations SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id, byTgId, reason || null]);

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
           c.name AS category_name,
           p.name AS cat_name,   p.emoji AS cat_emoji,
           g.name AS group_name, g.emoji AS group_emoji,
           u.full_name AS author_name
    FROM onix_operations o
    JOIN onix_accounts a  ON a.id = o.account_id
    LEFT JOIN onix_accounts t ON t.id = o.to_account_id
    LEFT JOIN onix_categories c ON c.id = o.category_id
    LEFT JOIN onix_categories p ON p.id = c.parent_id
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
  getUser, listUsers, addUser, deactivateUser, ensurePodotchet,
  listAccounts, getAccount, balances,
  listGroups, listChildren, getCategory, addCategory, deactivateCategory, categoryTree,
  addOperation, getOperation, softDelete, listOperations, countOperations,
};
