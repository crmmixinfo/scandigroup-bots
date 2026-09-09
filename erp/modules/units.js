// ============================================================================
//  ISHLAB CHIQARISH JURNALI — konveyer birliklari
//
//  Huquqlar:
//    production.view   — jurnalni ko'rish
//    production.entry  — birlikni keyingi bo'limga o'tkazish
//    production.manage — birlik yaratish, boshlang'ich qoldiq
//    sales.manage      — zakaz raqami, mijoz, narx, chiqish sanasi
// ============================================================================
const express = require('express');
const { db, wrap, audit } = require('../db');
const { need } = require('../auth');
const { resolveShift } = require('./shift');

const router = express.Router();
const COMMERCE = ['sales.manage', 'production.manage'];

// ───────────────────────────────────────────────────────────────── MIJOZLAR
router.get('/customers', need('production.view', 'sales.view'), wrap(async (_req, res) => {
  const [customers, channels, managers] = await Promise.all([
    db.query(`SELECT * FROM v_customer_sales ORDER BY name`),
    db.query(`SELECT * FROM customer_channels ORDER BY sort`),
    // Savdo menejeri sifatida biriktirish mumkin bo'lgan xodimlar:
    // savdo roli borlar birinchi turadi
    db.query(
      `SELECT w.id, w.name,
              EXISTS (SELECT 1 FROM v_worker_permissions vp
                       WHERE vp.worker_id = w.id AND vp.module = 'sales') AS is_sales
         FROM workers w WHERE w.active ORDER BY is_sales DESC, w.name`),
  ]);
  res.json({ customers: customers.rows, channels: channels.rows, managers: managers.rows });
}));

router.get('/customers/stats', need('production.view', 'sales.view'), wrap(async (_req, res) => {
  const [byChannel, byCountry, byRegion, byManager] = await Promise.all([
    db.query(`SELECT * FROM v_channel_sales ORDER BY amount DESC, customers DESC`),
    db.query(`SELECT * FROM v_country_sales ORDER BY amount DESC, customers DESC`),
    db.query(`SELECT * FROM v_region_sales  ORDER BY amount DESC, customers DESC`),
    db.query(`SELECT * FROM v_manager_sales ORDER BY amount DESC, customers DESC`),
  ]);
  res.json({ byChannel: byChannel.rows, byCountry: byCountry.rows,
             byRegion: byRegion.rows, byManager: byManager.rows });
}));

// Bitta mijoz yoki ro'yxatni birdan qabul qiladi (import uchun)
router.post('/customers', need(...COMMERCE), wrap(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const it of items) {
      const name = String(it.name || '').trim();
      if (!name) throw new Error('Mijoz nomi majburiy');
      // Takror kiritilsa yangi qator yaratmaydi — bo'sh maydonlarni to'ldiradi
      const { rows } = await client.query(
        `INSERT INTO customers (name, phone, country, region, channel, manager_id, note)
         VALUES ($1,$2, COALESCE($3, 'O''zbekiston'), $4,$5,$6,$7)
         ON CONFLICT (lower(name)) DO UPDATE SET
           phone      = COALESCE(EXCLUDED.phone,      customers.phone),
           country    = COALESCE(EXCLUDED.country,    customers.country),
           region     = COALESCE(EXCLUDED.region,     customers.region),
           channel    = COALESCE(EXCLUDED.channel,    customers.channel),
           manager_id = COALESCE(EXCLUDED.manager_id, customers.manager_id),
           note       = COALESCE(EXCLUDED.note,       customers.note)
         RETURNING id, name, phone, country, region, channel, manager_id`,
        [name, it.phone || null, it.country || null, it.region || null,
         it.channel || null, it.manager_id || null, it.note || null]);
      saved.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json(Array.isArray(req.body.items) ? { saved } : saved[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
}));

router.patch('/customers/:id', need(...COMMERCE), wrap(async (req, res) => {
  const { name, phone, country, region, channel, manager_id, note, active } = req.body;
  const { rows } = await db.query(
    `UPDATE customers SET
       name       = COALESCE($2, name),
       phone      = COALESCE($3, phone),
       country    = COALESCE($4, country),
       region     = COALESCE($5, region),
       channel    = COALESCE($6, channel),
       manager_id = COALESCE($7, manager_id),
       note       = COALESCE($8, note),
       active     = COALESCE($9, active)
     WHERE id = $1 RETURNING id`,
    [req.params.id, name || null, phone || null, country || null, region || null,
     channel || null, manager_id || null, note || null,
     typeof active === 'boolean' ? active : null]);
  if (!rows[0]) return res.status(404).json({ error: 'Mijoz topilmadi' });
  res.json({ ok: true });
}));

// ─────────────────────────────────────────────────────────────────── JURNAL
router.get('/', need('production.view'), wrap(async (req, res) => {
  const { order_no, conveyor_no, customer_id, shop_id, status, from, to, q } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM v_unit_register
      WHERE ($1::text IS NULL OR order_no ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR conveyor_no ILIKE '%' || $2 || '%')
        AND ($3::int  IS NULL OR customer_id = $3)
        AND ($4::int  IS NULL OR shop_id = $4)
        AND ($5::text IS NULL OR status = $5)
        AND ($6::date IS NULL OR started_on >= $6)
        AND ($7::date IS NULL OR started_on <= $7)
        AND ($8::text IS NULL OR product ILIKE '%' || $8 || '%'
             OR sku ILIKE '%' || $8 || '%' OR customer_name ILIKE '%' || $8 || '%')
      ORDER BY started_on DESC, conveyor_no DESC
      LIMIT 500`,
    [order_no || null, conveyor_no || null, customer_id || null, shop_id || null,
     status || null, from || null, to || null, q || null]);
  res.json(rows);
}));

router.get('/orders', need('production.view'), wrap(async (_req, res) => {
  const { rows } = await db.query(`SELECT * FROM v_orders ORDER BY started_on DESC`);
  res.json(rows);
}));

// Keyingi konveyer raqamini taklif qiladi: K-2026-0001
router.get('/next-no', need('production.manage'), wrap(async (_req, res) => {
  const year = new Date().getFullYear();
  const { rows } = await db.query(
    `SELECT COALESCE(MAX(SUBSTRING(conveyor_no FROM '\\d+$')::int), 0) + 1 AS n
       FROM production_units WHERE conveyor_no LIKE $1`, [`K-${year}-%`]);
  res.json({ conveyor_no: `K-${year}-${String(rows[0].n).padStart(4, '0')}` });
}));

router.get('/:id/history', need('production.view'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.moved_on, m.moved_at, sc.name AS section, sh.name AS shop,
            m.qty_defect, m.defect_reason, w.name AS worker, m.note
       FROM unit_moves m
       JOIN sections sc    ON sc.id = m.section_id
       JOIN shops sh       ON sh.id = sc.shop_id
       LEFT JOIN workers w ON w.id = m.worker_id
      WHERE m.unit_id = $1 ORDER BY m.moved_at`, [req.params.id]);
  res.json(rows);
}));

// ─────────────────────────────────────────────────── BIRLIK YARATISH / QOLDIQ
// Bir nechta qatorni birdan qabul qiladi — boshlang'ich qoldiq shu bilan
// kiritiladi: har qator o'z bo'limida turgan holda yaratiladi.
router.post('/', need('production.manage'), wrap(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  if (!items.length) return res.status(400).json({ error: 'Qator yo\'q' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const it of items) {
      if (!it.conveyor_no || !String(it.conveyor_no).trim())
        throw new Error('Konveyer raqami majburiy');
      if (!it.product_id) throw new Error('Mahsulot tanlanmagan');

      // Bo'lim berilsa, u mahsulot marshrutida borligini tekshiramiz
      if (it.section_id) {
        const ok = (await client.query(
          `SELECT 1 FROM v_product_route WHERE product_id = $1 AND section_id = $2`,
          [it.product_id, it.section_id])).rowCount;
        if (!ok) throw new Error(
          `${it.conveyor_no}: tanlangan bo'lim bu mahsulot marshrutida yo'q`);
      }

      const isExit = it.section_id ? (await client.query(
        `SELECT is_exit FROM sections WHERE id = $1`, [it.section_id])).rows[0]?.is_exit : false;

      const u = (await client.query(
        `INSERT INTO production_units
           (conveyor_no, order_no, product_id, qty, started_on, current_section_id,
            entered_section_on, customer_id, unit_price, ship_on, next_shop_planned_on,
            status, is_opening, note, created_by)
         VALUES ($1,$2,$3,$4, COALESCE($5::date, CURRENT_DATE), $6,
                 COALESCE($7::date, CURRENT_DATE), $8,$9,$10,$11,
                 $12, $13, $14, $15)
         RETURNING id, conveyor_no`,
        [String(it.conveyor_no).trim(), it.order_no || null, it.product_id,
         Number(it.qty) || 1, it.started_on || null, it.section_id || null,
         it.entered_section_on || null, it.customer_id || null,
         it.unit_price || null, it.ship_on || null, it.next_shop_planned_on || null,
         isExit ? 'fg' : 'production', !!it.is_opening, it.note || null, req.user.id])).rows[0];

      if (it.section_id) {
        await client.query(
          `INSERT INTO unit_moves (unit_id, section_id, moved_on, worker_id, note)
           VALUES ($1,$2, COALESCE($3::date, CURRENT_DATE), $4, $5)`,
          [u.id, it.section_id, it.entered_section_on || null, req.user.id,
           it.is_opening ? 'Boshlang\'ich qoldiq' : null]);

        // Jamlanma hisobotlar (WIP, zavod ko'rinishi, panel) flow_log ga tayanadi —
        // boshlang'ich qoldiq ham o'sha yerga yozilmasa, kiritilgan mahsulot
        // hisobotlarda ko'rinmay qoladi.
        const shiftId = await resolveShift(client, it.product_id, 1, req.user.id,
                                           it.entered_section_on || null);
        await client.query(
          `INSERT INTO flow_log (shift_id, section_id, product_id, qty_ok, worker_id, note)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [shiftId, it.section_id, it.product_id, Number(it.qty) || 1, req.user.id,
           u.conveyor_no + (it.is_opening ? ' · boshlang\'ich qoldiq' : '')]);
      }
      if (isExit) {
        await client.query(
          `UPDATE production_units SET fg_on = COALESCE($2::date, CURRENT_DATE) WHERE id = $1`,
          [u.id, it.entered_section_on || null]);
        await client.query(
          `INSERT INTO fg_stock (product_id, qty, updated_at) VALUES ($1,$2,NOW())
           ON CONFLICT (product_id) DO UPDATE
             SET qty = fg_stock.qty + EXCLUDED.qty, updated_at = NOW()`,
          [it.product_id, Number(it.qty) || 1]);
      }
      created.push(u);
    }
    await client.query('COMMIT');
    await audit(req, { module: 'production', action: 'create', entity: 'units',
                       entity_id: created.length, payload: { count: created.length } });
    res.json({ created });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505')
      return res.status(409).json({ error: 'Bu konveyer raqami allaqachon mavjud' });
    return res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
}));

// Zakaz raqami, mijoz, narx, chiqish sanasi — savdo qo'yadi
router.patch('/:id', need(...COMMERCE), wrap(async (req, res) => {
  const { order_no, customer_id, unit_price, ship_on, next_shop_planned_on, note, status } = req.body;
  const { rows } = await db.query(
    `UPDATE production_units SET
       order_no             = COALESCE($2, order_no),
       customer_id          = COALESCE($3, customer_id),
       unit_price           = COALESCE($4, unit_price),
       ship_on              = COALESCE($5::date, ship_on),
       next_shop_planned_on = COALESCE($6::date, next_shop_planned_on),
       note                 = COALESCE($7, note),
       status               = COALESCE($8, status)
     WHERE id = $1 RETURNING id`,
    [req.params.id, order_no || null, customer_id || null,
     unit_price === '' || unit_price == null ? null : Number(unit_price),
     ship_on || null, next_shop_planned_on || null, note || null, status || null]);
  if (!rows[0]) return res.status(404).json({ error: 'Birlik topilmadi' });
  await audit(req, { module: 'production', action: 'update', entity: 'unit',
                     entity_id: req.params.id, payload: req.body });
  res.json({ ok: true });
}));

// ──────────────────────────────────────────── BIRLIKNI KEYINGI BO'LIMGA O'TKAZISH
async function moveOne(client, req, { unit_id, section_id, moved_on, qty_defect, defect_reason, note }) {
  const u = (await client.query(
    `SELECT * FROM production_units WHERE id = $1 FOR UPDATE`, [unit_id])).rows[0];
  if (!u) throw new Error('Birlik topilmadi');
  if (u.status === 'cancelled') throw new Error(`${u.conveyor_no}: bekor qilingan`);

  const route = (await client.query(
    `SELECT section_id, step_no FROM v_product_route WHERE product_id = $1 ORDER BY step_no`,
    [u.product_id])).rows;
  if (!route.length) throw new Error(`${u.conveyor_no}: marshrut biriktirilmagan`);

  // Bo'lim ko'rsatilmasa — marshrutdagi keyingisi
  let target = section_id;
  if (!target) {
    const cur = route.findIndex((r) => r.section_id === u.current_section_id);
    const next = route[cur + 1];
    if (!next) throw new Error(`${u.conveyor_no}: marshrut tugagan`);
    target = next.section_id;
  } else if (!route.some((r) => r.section_id === Number(target))) {
    throw new Error(`${u.conveyor_no}: bo'lim marshrutda yo'q`);
  }

  const sec = (await client.query(
    `SELECT is_exit FROM sections WHERE id = $1`, [target])).rows[0];
  const defect = Number(qty_defect) || 0;
  if (defect > 0 && !defect_reason) throw new Error('Brak uchun sabab kodi majburiy');

  await client.query(
    `INSERT INTO unit_moves (unit_id, section_id, moved_on, qty_defect, defect_reason, worker_id, note)
     VALUES ($1,$2, COALESCE($3::date, CURRENT_DATE), $4,$5,$6,$7)`,
    [unit_id, target, moved_on || null, defect, defect_reason || null, req.user.id, note || null]);

  await client.query(
    `UPDATE production_units SET
       current_section_id   = $2,
       entered_section_on   = COALESCE($3::date, CURRENT_DATE),
       next_shop_planned_on = NULL,
       status = CASE WHEN $4 THEN 'fg' ELSE status END,
       fg_on  = CASE WHEN $4 THEN COALESCE($3::date, CURRENT_DATE) ELSE fg_on END
     WHERE id = $1`, [unit_id, target, moved_on || null, sec.is_exit]);

  // Umumiy hisobotlar (WIP, panel, Pareto) o'zgarishsiz ishlashi uchun
  // har o'tkazish jamlanma flow_log ga ham yoziladi.
  const shiftId = await resolveShift(client, u.product_id, 1, req.user.id, moved_on || null);
  const flow = (await client.query(
    `INSERT INTO flow_log (shift_id, section_id, product_id, qty_ok, qty_defect, worker_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [shiftId, target, u.product_id, u.qty, defect, req.user.id, u.conveyor_no])).rows[0];
  if (defect > 0) {
    await client.query(
      `INSERT INTO defects (flow_log_id, work_date, section_id, product_id, reason_code, qty)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3,$4,$5,$6)`,
      [flow.id, moved_on || null, target, u.product_id, defect_reason, defect]);
  }
  if (sec.is_exit) {
    await client.query(
      `INSERT INTO fg_stock (product_id, qty, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (product_id) DO UPDATE
         SET qty = fg_stock.qty + EXCLUDED.qty, updated_at = NOW()`, [u.product_id, u.qty]);
  }
  return { unit_id, section_id: target, is_exit: sec.is_exit };
}

router.post('/move', need('production.entry'), wrap(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const moved = [];
    for (const it of items) moved.push(await moveOne(client, req, it));
    await client.query('COMMIT');
    res.json({ moved });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
}));

module.exports = router;
