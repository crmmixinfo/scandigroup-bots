require('dotenv').config();
const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const app = express();
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// Smenani MAHSULOT YO'NALISHI bo'yicha topadi yoki ochadi.
// Umumiy bo'yoqlash tsexida operator ikkala yo'nalish mahsulotini ishlaydi —
// smenani u tanlamaydi, tizim mahsulotdan aniqlaydi.
async function resolveShift(client, productId, shiftNo = 1, workerId = null) {
  const line = (await client.query(
    `SELECT line_id FROM v_product_line WHERE product_id = $1`, [productId])).rows[0];
  if (!line) throw new Error('Mahsulot yo\'nalishi aniqlanmadi');
  const { rows } = await client.query(
    `INSERT INTO shifts (work_date, shift_no, line_id, opened_by)
     VALUES (CURRENT_DATE, $1, $2, $3)
     ON CONFLICT (work_date, shift_no, line_id) DO UPDATE SET closed_at = NULL
     RETURNING id`, [shiftNo, line.line_id, workerId]);
  return rows[0].id;
}

// ─────────────────────────────────────────────────────────────── AUTH (oddiy)
// Tsex terminali PIN bilan ochiladi. Ofis paneli uchun Telegram Mini App
// initData tekshiruvi qo'shilishi kerak — README dagi "Hali qilinmagan"ga qarang.
app.post('/api/login', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT w.id, w.name, w.role, w.shop_id, s.name AS shop, s.line_id, s.is_shared
       FROM workers w LEFT JOIN shops s ON s.id = w.shop_id
      WHERE w.pin = $1 AND w.active`, [req.body.pin]);
  if (!rows[0]) return res.status(401).json({ error: 'PIN topilmadi' });
  res.json(rows[0]);
}));

// ────────────────────────────────────────────────────────────── SPRAVOCHNIKLAR
app.get('/api/ref', wrap(async (_req, res) => {
  const [lines, shops, sections, products, chambers, defectReasons, downtimeReasons] =
    await Promise.all([
      db.query(`SELECT * FROM lines WHERE active ORDER BY sort`),
      db.query(`SELECT * FROM shops ORDER BY sort, name`),
      db.query(`SELECT sc.*, sh.line_id, sh.is_shared, sh.name AS shop
                  FROM sections sc JOIN shops sh ON sh.id = sc.shop_id
                 WHERE sc.active ORDER BY sh.sort, sc.sort`),
      db.query(`SELECT p.*, g.name AS group_name, g.line_id
                  FROM products p JOIN product_groups g ON g.id = p.group_id
                 WHERE p.active ORDER BY g.code, p.name`),
      db.query(`SELECT * FROM chambers WHERE active ORDER BY name`),
      db.query(`SELECT * FROM defect_reasons ORDER BY sort`),
      db.query(`SELECT * FROM downtime_reasons ORDER BY sort`),
    ]);
  res.json({
    lines: lines.rows, shops: shops.rows, sections: sections.rows,
    products: products.rows, chambers: chambers.rows,
    defectReasons: defectReasons.rows, downtimeReasons: downtimeReasons.rows,
  });
}));

// Bo'lim konteksti. Umumiy tsexda ikkala yo'nalish mahsuloti chiqadi —
// shuning uchun har mahsulot yonida yo'nalish nomi ko'rsatiladi.
app.get('/api/section/:id/context', wrap(async (req, res) => {
  const sectionId = Number(req.params.id);
  const section = (await db.query(
    `SELECT sc.*, sh.name AS shop, sh.kind, sh.line_id, sh.is_shared
       FROM sections sc JOIN shops sh ON sh.id = sc.shop_id
      WHERE sc.id = $1`, [sectionId])).rows[0];
  if (!section) return res.status(404).json({ error: 'Bo\'lim topilmadi' });

  // Faqat marshruti shu bo'limdan o'tadigan mahsulotlar —
  // operator noto'g'ri SKU tanlay olmaydi.
  const products = (await db.query(
    `SELECT p.id, p.sku, p.name, pl.line_name, r.step_no,
            COALESCE(w.queue_qty, 0) AS queue_qty
       FROM v_product_route r
       JOIN products p        ON p.id = r.product_id
       JOIN v_product_line pl ON pl.product_id = p.id
       LEFT JOIN v_wip w      ON w.product_id = p.id AND w.section_id = r.section_id
      WHERE r.section_id = $1
      ORDER BY pl.line_name, p.name`, [sectionId])).rows;

  const openDowntime = (await db.query(
    `SELECT * FROM downtime WHERE section_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1`, [sectionId])).rows[0] || null;

  const openBatches = section.kind === 'batch' ? (await db.query(
    `SELECT b.*, c.name AS chamber, p.name AS product
       FROM paint_batches b
       LEFT JOIN chambers c ON c.id = b.chamber_id
       JOIN products p      ON p.id = b.product_id
      WHERE b.section_id = $1 AND b.ended_at IS NULL
      ORDER BY b.started_at`, [sectionId])).rows : [];

  res.json({ section, products, openDowntime, openBatches });
}));

// ──────────────────────────────────────────────────────────────────── SMENA
app.get('/api/shift/current', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM shifts
      WHERE work_date = $1 AND line_id = $2 AND shift_no = $3 AND closed_at IS NULL`,
    [today(), req.query.line_id, req.query.shift_no || 1]);
  res.json(rows[0] || null);
}));

app.post('/api/shift/:id/close', wrap(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE shifts SET closed_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  res.json(rows[0] || null);
}));

// ─────────────────────────────────────────────── ★ ASOSIY: bo'limdan o'tkazish
app.post('/api/flow', wrap(async (req, res) => {
  const {
    section_id, product_id, shift_no = 1,
    qty_ok = 0, qty_defect = 0, worker_id,
    defect_reason, origin_section_id, note,
  } = req.body;

  if (!section_id || !product_id)
    return res.status(400).json({ error: 'section_id va product_id majburiy' });
  if (qty_defect > 0 && !defect_reason)
    return res.status(400).json({ error: 'Brak uchun sabab kodi majburiy' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const shiftId = await resolveShift(client, product_id, shift_no, worker_id || null);

    const flow = (await client.query(
      `INSERT INTO flow_log (shift_id, section_id, product_id, qty_ok, qty_defect, worker_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [shiftId, section_id, product_id, qty_ok, qty_defect, worker_id || null, note || null]
    )).rows[0];

    if (qty_defect > 0) {
      await client.query(
        `INSERT INTO defects (flow_log_id, section_id, product_id, reason_code, qty, origin_section_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [flow.id, section_id, product_id, defect_reason, qty_defect, origin_section_id || null]);
    }

    // Chiqish bo'limi → tayyor mahsulot qoldig'i (komplektlilik shundan hisoblanadi)
    const isExit = (await client.query(
      `SELECT is_exit FROM sections WHERE id = $1`, [section_id])).rows[0]?.is_exit;
    if (isExit && qty_ok > 0) {
      await client.query(
        `INSERT INTO fg_stock (product_id, qty, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (product_id) DO UPDATE
           SET qty = fg_stock.qty + EXCLUDED.qty, updated_at = NOW()`,
        [product_id, qty_ok]);
    }

    await client.query('COMMIT');
    res.json(flow);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// Oxirgi yozuvni bekor qilish (operator xato kiritsa)
app.delete('/api/flow/:id', wrap(async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `DELETE FROM flow_log WHERE id = $1 RETURNING *`, [req.params.id])).rows[0];
    // Chiqish bo'limi bo'lsa ombor qoldig'i ham qaytariladi
    if (row && row.qty_ok > 0) {
      const isExit = (await client.query(
        `SELECT is_exit FROM sections WHERE id = $1`, [row.section_id])).rows[0]?.is_exit;
      if (isExit) await client.query(
        `UPDATE fg_stock SET qty = GREATEST(qty - $2, 0), updated_at = NOW()
          WHERE product_id = $1`, [row.product_id, row.qty_ok]);
    }
    await client.query('COMMIT');
    res.json(row || null);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ─────────────────────────────────────────────────────────────────── PROSTOY
// To'xtash bo'limga bog'langan, smenaga emas: umumiy bo'yoqlash tsexi
// to'xtaganda u bitta yo'nalishga tegishli bo'lmaydi.
app.post('/api/downtime/start', wrap(async (req, res) => {
  const { section_id, reason_code, worker_id, note, shift_no = 1 } = req.body;
  const { rows } = await db.query(
    `INSERT INTO downtime (section_id, reason_code, worker_id, note, shift_no)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [section_id, reason_code, worker_id || null, note || null, shift_no]);
  res.json(rows[0]);
}));

app.post('/api/downtime/:id/stop', wrap(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE downtime SET ended_at = NOW() WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [req.params.id]);
  res.json(rows[0] || null);
}));

// ────────────────────────────────────────────────────── BO'YOQLASH PARTIYASI
app.post('/api/paint/start', wrap(async (req, res) => {
  const { section_id, chamber_id, product_id, qty, worker_id, shift_no = 1 } = req.body;
  const { rows } = await db.query(
    `INSERT INTO paint_batches (section_id, chamber_id, product_id, qty, worker_id, shift_no)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [section_id, chamber_id || null, product_id, qty, worker_id || null, shift_no]);
  res.json(rows[0]);
}));

app.post('/api/paint/:id/finish', wrap(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE paint_batches SET ended_at = NOW(), repaint_qty = $2 WHERE id = $1 RETURNING *`,
    [req.params.id, req.body.repaint_qty || 0]);
  res.json(rows[0] || null);
}));

// ─────────────────────────────────────────────────────────────────── HISOBOT
app.get('/api/dashboard', wrap(async (req, res) => {
  const date = req.query.date || today();
  // Brak va prostoy Pareto'si bir kun uchun ma'nosiz — davr bo'yicha olinadi.
  const from = req.query.from || daysAgo(30);

  const [planFact, shopWip, sharedLoad, bottleneck, defects, downtime,
         completeness, blockers, sectionDaily, chamberLoad] =
    await Promise.all([
      db.query(`SELECT * FROM v_plan_fact WHERE work_date = $1 ORDER BY product`, [date]),
      db.query(`SELECT * FROM v_shop_wip ORDER BY sort, shop, line_name`),
      db.query(`SELECT * FROM v_shared_load ORDER BY queue_qty DESC`),
      db.query(
        `SELECT sc.name AS section, sh.name AS shop, sh.is_shared,
                SUM(GREATEST(w.queue_qty,0)) AS queue_qty
           FROM v_wip w
           JOIN sections sc ON sc.id = w.section_id
           JOIN shops sh    ON sh.id = sc.shop_id
          GROUP BY sc.name, sh.name, sh.is_shared
         HAVING SUM(GREATEST(w.queue_qty,0)) > 0
          ORDER BY queue_qty DESC LIMIT 5`),
      db.query(
        `SELECT dr.code, dr.name AS reason, SUM(d.qty) AS qty,
                COALESCE(os.name, sc.name) AS origin_section
           FROM defects d
           JOIN defect_reasons dr ON dr.code = d.reason_code
           JOIN sections sc       ON sc.id = d.section_id
           LEFT JOIN sections os  ON os.id = d.origin_section_id
          WHERE d.work_date BETWEEN $1 AND $2
          GROUP BY dr.code, dr.name, COALESCE(os.name, sc.name)
          ORDER BY qty DESC LIMIT 8`, [from, date]),
      db.query(
        `SELECT r.code, r.name AS reason, sc.name AS section,
                ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(dt.ended_at, NOW()) - dt.started_at))/60)) AS minutes
           FROM downtime dt
           JOIN downtime_reasons r ON r.code = dt.reason_code
           JOIN sections sc        ON sc.id = dt.section_id
          WHERE dt.work_date BETWEEN $1 AND $2
          GROUP BY r.code, r.name, sc.name
          ORDER BY minutes DESC LIMIT 8`, [from, date]),
      db.query(`SELECT * FROM v_set_completeness ORDER BY complete_sets`),
      db.query(`SELECT * FROM v_set_blockers`),
      db.query(`SELECT * FROM v_section_daily WHERE work_date = $1
                 ORDER BY line, shop, section`, [date]),
      db.query(`SELECT * FROM v_chamber_load WHERE work_date = $1`, [date]),
    ]);

  res.json({
    date, from,
    planFact: planFact.rows,
    shopWip: shopWip.rows,
    // Umumiy bo'yoqlash tsexi quvvatini qaysi yo'nalish qancha yeyapti
    sharedLoad: sharedLoad.rows,
    bottleneck: bottleneck.rows,
    defects: defects.rows,
    downtime: downtime.rows,
    completeness: completeness.rows,
    blockers: blockers.rows,
    sectionDaily: sectionDaily.rows,
    chamberLoad: chamberLoad.rows,
  });
}));

app.get('/api/wip', wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT p.name AS product, pl.line_name, sc.name AS section, sh.name AS shop,
            w.step_no, w.queue_qty
       FROM v_wip w
       JOIN products p        ON p.id = w.product_id
       JOIN v_product_line pl ON pl.product_id = w.product_id
       JOIN sections sc       ON sc.id = w.section_id
       JOIN shops sh          ON sh.id = sc.shop_id
      WHERE w.queue_qty <> 0
      ORDER BY w.queue_qty DESC`);
  res.json(rows);
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production API → http://localhost:${PORT}`));
