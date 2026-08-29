// ONIX — hisobotlar
//
//   PUL OQIMI      → paid_at bo'yicha (pul qachon real harakat qildi)
//   FOYDA-ZARAR    → period  bo'yicha (xarajat qaysi oyga tegishli)
//
// Ikkalasi ham bitta manbadan — onix_operations jadvalidan — chiqadi.
// Valyutalar alohida: UZS va USD hech qachon jamlanmaydi.

const db = require('./db');

// Hisob bo'yicha ishorali harakat. Transfer ikki qator beradi:
// manba hisobga −amount, qabul qiluvchiga +to_amount (konvertatsiyada boshqa summa).
const MOVES = `
  SELECT a.currency,
         a.id   AS account_id,
         o.type,
         o.paid_at,
         CASE
           WHEN o.type = 'income'   AND o.account_id    = a.id THEN  o.amount
           WHEN o.type = 'transfer' AND o.to_account_id = a.id THEN  COALESCE(o.to_amount, o.amount)
           WHEN o.type = 'expense'  AND o.account_id    = a.id THEN -o.amount
           WHEN o.type = 'transfer' AND o.account_id    = a.id THEN -o.amount
         END AS delta,
         (o.type = 'transfer' AND a.currency <> (
            SELECT b.currency FROM onix_accounts b
            WHERE b.id = CASE WHEN o.account_id = a.id THEN o.to_account_id ELSE o.account_id END
         )) AS is_conversion
  FROM onix_operations o
  JOIN onix_accounts a ON a.id = o.account_id OR a.id = o.to_account_id
  WHERE o.deleted_at IS NULL
`;

// ---------- Boshlang'ich qoldiq ----------
async function openingBalance(before, currency) {
  const row = await db.one(
    `SELECT COALESCE(SUM(delta), 0) AS total FROM (${MOVES} AND o.paid_at < $1) m WHERE currency = $2`,
    [before, currency]);
  return Number(row.total);
}

// ---------- PUL OQIMI ----------
async function cashFlow(from, to, currency) {
  const opening = await openingBalance(from, currency);

  // Kirim/chiqim — bo'lim (1-daraja kategoriya) kesimida
  const groups = await db.all(`
    SELECT n.flow,
           COALESCE(gp.id, p.id)       AS group_id,
           COALESCE(gp.name, p.name)   AS group_name,
           COALESCE(gp.emoji, p.emoji) AS group_emoji,
           CASE WHEN gp.id IS NOT NULL THEN p.id    ELSE n.id    END AS cat_id,
           CASE WHEN gp.id IS NOT NULL THEN p.name  ELSE n.name  END AS cat_name,
           CASE WHEN gp.id IS NOT NULL THEN p.emoji ELSE n.emoji END AS cat_emoji,
           NULL::int AS sub_id, NULL::text AS sub_name,
           SUM(o.amount) AS total
    FROM onix_operations o
    JOIN onix_categories n       ON n.id = o.category_id   -- barg: kategoriya yoki podkategoriya
    LEFT JOIN onix_categories p  ON p.id = n.parent_id
    LEFT JOIN onix_categories gp ON gp.id = p.parent_id
    WHERE o.deleted_at IS NULL
      AND o.type IN ('income','expense')
      AND o.currency = $3
      AND o.paid_at BETWEEN $1 AND $2
    GROUP BY n.flow, gp.id, gp.name, gp.emoji, p.id, p.name, p.emoji, n.id, n.name, n.emoji
    ORDER BY n.flow DESC, SUM(o.amount) DESC`, [from, to, currency]);

  // Valyuta konvertatsiyasi — shu valyuta uchun sof kirim/chiqim
  const conv = await db.one(`
    SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS came_in,
           COALESCE(SUM(-delta) FILTER (WHERE delta < 0), 0) AS went_out
    FROM (${MOVES} AND o.paid_at BETWEEN $1 AND $2) m
    WHERE currency = $3 AND is_conversion`, [from, to, currency]);

  const income  = nest(groups.filter(g => g.flow === 'income'),  2);
  const expense = nest(groups.filter(g => g.flow === 'expense'), 2);

  const incomeTotal  = sum(income);
  const expenseTotal = sum(expense);
  const convIn  = Number(conv.came_in);
  const convOut = Number(conv.went_out);
  const net     = incomeTotal - expenseTotal + convIn - convOut;

  return {
    from, to, currency, opening,
    income, expense, incomeTotal, expenseTotal,
    convIn, convOut, net,
    closing: opening + net,
    accounts: await db.balances({ currency }),
  };
}

// ---------- FOYDA-ZARAR ----------
async function profitLoss(period, currency) {
  const rows = await db.all(`
    SELECT n.flow,
           COALESCE(gp.id, p.id)       AS group_id,
           COALESCE(gp.name, p.name)   AS group_name,
           COALESCE(gp.emoji, p.emoji) AS group_emoji,
           CASE WHEN gp.id IS NOT NULL THEN p.id    ELSE n.id    END AS cat_id,
           CASE WHEN gp.id IS NOT NULL THEN p.name  ELSE n.name  END AS cat_name,
           CASE WHEN gp.id IS NOT NULL THEN p.emoji ELSE n.emoji END AS cat_emoji,
           CASE WHEN gp.id IS NOT NULL THEN n.id   END AS sub_id,
           CASE WHEN gp.id IS NOT NULL THEN n.name END AS sub_name,
           SUM(o.amount) AS total
    FROM onix_operations o
    JOIN onix_categories n       ON n.id = o.category_id   -- barg: kategoriya yoki podkategoriya
    LEFT JOIN onix_categories p  ON p.id = n.parent_id
    LEFT JOIN onix_categories gp ON gp.id = p.parent_id
    WHERE o.deleted_at IS NULL
      AND o.type IN ('income','expense')
      AND o.currency = $2
      AND o.period = $1
    GROUP BY n.flow, gp.id, gp.name, gp.emoji, p.id, p.name, p.emoji, n.id, n.name, n.emoji
    ORDER BY n.flow DESC, SUM(o.amount) DESC`, [period, currency]);

  const income  = nest(rows.filter(r => r.flow === 'income'),  3);
  const expense = nest(rows.filter(r => r.flow === 'expense'), 3);

  const revenue = sum(income);
  const costs   = sum(expense);
  const profit  = revenue - costs;

  return {
    period, currency, income, expense, revenue, costs, profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
  };
}

// Oldingi oy bilan solishtirish
async function profitLossCompare(period, currency) {
  const prev = prevMonth(period);
  const [now, before] = await Promise.all([profitLoss(period, currency), profitLoss(prev, currency)]);
  return { now, prev: before };
}

// ---------- PODOTCHYOT ----------
// Har hodimning qo'lidagi qoldiq + davr ichida olgani va sarflagani
async function podotchetReport(from, to, currency) {
  const staff = await db.all(`
    SELECT u.tg_id, u.full_name, a.id AS account_id, a.currency,
           b.balance
    FROM onix_users u
    JOIN onix_accounts a ON a.owner_tg_id = u.tg_id AND a.kind = 'podotchet' AND a.active = true
    JOIN onix_balances b ON b.account_id = a.id
    WHERE u.active = true AND u.role = 'staff' AND a.currency = $1
    ORDER BY u.full_name`, [currency]);

  for (const s of staff) {
    const row = await db.one(`
      SELECT COALESCE(SUM(COALESCE(o.to_amount, o.amount)) FILTER (WHERE o.type = 'transfer' AND o.to_account_id = $1), 0) AS received,
             COALESCE(SUM(o.amount) FILTER (WHERE o.type = 'expense'  AND o.account_id    = $1), 0) AS spent,
             COALESCE(SUM(o.amount) FILTER (WHERE o.type = 'transfer' AND o.account_id    = $1), 0) AS returned
      FROM onix_operations o
      WHERE o.deleted_at IS NULL AND o.paid_at BETWEEN $2 AND $3
        AND (o.account_id = $1 OR o.to_account_id = $1)`, [s.account_id, from, to]);
    s.received = Number(row.received);
    s.spent    = Number(row.spent);
    s.returned = Number(row.returned);
    s.balance  = Number(s.balance);
  }
  return staff;
}

// ---------- Hodim kesimida xarajat ----------
async function byAuthor(from, to, currency) {
  return db.all(`
    SELECT u.tg_id, u.full_name,
           COUNT(*)::int AS ops,
           SUM(o.amount) AS total
    FROM onix_operations o
    JOIN onix_users u ON u.tg_id = o.created_by
    WHERE o.deleted_at IS NULL AND o.type = 'expense'
      AND o.currency = $3 AND o.paid_at BETWEEN $1 AND $2
    GROUP BY u.tg_id, u.full_name
    ORDER BY SUM(o.amount) DESC`, [from, to, currency]);
}

// ---------- Kelgusi oylarga yozilgan xarajatlar ----------
// "Bu oyda to'landi, lekin keyingi oy P&L'ini belgilaydi" — siz aytgan holat
async function deferred(currency, afterPeriod) {
  return db.all(`
    SELECT o.period, c.flow, SUM(o.amount) AS total, COUNT(*)::int AS ops
    FROM onix_operations o
    JOIN onix_categories c ON c.id = o.category_id
    WHERE o.deleted_at IS NULL AND o.currency = $1 AND o.period > $2
    GROUP BY o.period, c.flow
    ORDER BY o.period`, [currency, afterPeriod]);
}

// ================= yordamchilar =================

const sum = (groups) => groups.reduce((acc, g) => acc + g.total, 0);

// Tekis qatorlarni GURUH → KATEGORIYA → PODKATEGORIYA daraxtiga yig'adi.
// depth = 2 — podkategoriyasiz (pul oqimi), depth = 3 — to'liq (foyda-zarar).
function nest(rows, depth = 3) {
  const groups = new Map();

  for (const r of rows) {
    if (!groups.has(r.group_id)) {
      groups.set(r.group_id, {
        id: r.group_id, name: r.group_name, emoji: r.group_emoji, total: 0, cats: new Map(),
      });
    }
    const g = groups.get(r.group_id);

    if (!g.cats.has(r.cat_id)) {
      g.cats.set(r.cat_id, {
        id: r.cat_id, name: r.cat_name, emoji: r.cat_emoji, total: 0, subs: [],
      });
    }
    const c = g.cats.get(r.cat_id);

    const amount = Number(r.total);
    if (depth >= 3 && r.sub_id) c.subs.push({ id: r.sub_id, name: r.sub_name, total: amount });
    c.total += amount;
    g.total += amount;
  }

  const byTotal = (a, b) => b.total - a.total;
  return [...groups.values()].map(g => ({
    ...g,
    cats: [...g.cats.values()].map(c => ({ ...c, subs: c.subs.sort(byTotal) })).sort(byTotal),
  })).sort(byTotal);
}

function prevMonth(period) {
  const [y, m] = String(period).slice(0, 7).split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}

module.exports = {
  openingBalance, cashFlow, profitLoss, profitLossCompare,
  podotchetReport, byAuthor, deferred, prevMonth,
};
