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

// ─────────────────────────────────────────────────────────────── AUTH (oddiy)
// Terminal PIN bilan ochiladi. Ishlab chiqarish tsexida bu yetarli;
// ofis paneli uchun keyinchalik Telegram Mini App auth qo'shiladi.
app.post('/api/login', wrap(async (req, res) => {
  const { pin } = req.body;
  const { rows } = await db.query(
    `SELECT w.id, w.name, w.role, w.department_id, d.name AS department, d.line_id
       FROM workers w LEFT JOIN departments d ON d.id = w.department_id
      WHERE w.pin = $1 AND w.active`, [pin]);
  if (!rows[0]) return res.status(401).json({ error: 'PIN topilmadi' });
  res.json(rows[0]);
}));

// ────────────────────────────────────────────────────────────── SPRAVOCHNIKLAR
app.get('/api/ref', wrap(async (_req, res) => {
  const [lines, departments, stations, products, defectReasons, downtimeReasons] =
    await Promise.all([
      db.query(`SELECT * FROM lines WHERE active ORDER BY sort`),
      db.query(`SELECT * FROM departments ORDER BY line_id, sort`),
      db.query(`SELECT s.*, d.line_id FROM stations s
                  JOIN departments d ON d.id = s.department_id
                 WHERE s.active ORDER BY d.line_id, d.sort, s.sort`),
      db.query(`SELECT p.*, g.name AS group_name, g.line_id
                  FROM products p JOIN product_groups g ON g.id = p.group_id
                 WHERE p.active ORDER BY p.name`),
      db.query(`SELECT * FROM defect_reasons ORDER BY sort`),
      db.query(`SELECT * FROM downtime_reasons ORDER BY sort`),
    ]);
  res.json({
    lines: lines.rows, departments: departments.rows, stations: stations.rows,
    products: products.rows, defectReasons: defectReasons.rows,
    downtimeReasons: downtimeReasons.rows,
  });
}));

// Uchastka konteksti: shu uchastkadan o'tadigan mahsulotlar + navbat
app.get('/api/station/:id/context', wrap(async (req, res) => {
  const stationId = Number(req.params.id);
  const station = (await db.query(
    `SELECT s.*, d.name AS department, d.kind, d.line_id
       FROM stations s JOIN departments d ON d.id = s.department_id
      WHERE s.id = $1`, [stationId])).rows[0];
  if (!station) return res.status(404).json({ error: 'Uchastka topilmadi' });

  // Faqat marshruti shu uchastkadan o'tadigan mahsulotlar ko'rsatiladi —
  // operator ro'yxatdan noto'g'ri SKU tanlay olmaydi.
  const products = (await db.query(
    `SELECT p.id, p.sku, p.name, r.step_no,
            COALESCE(w.queue_qty, 0) AS queue_qty
       FROM v_product_route r
       JOIN products p ON p.id = r.product_id
       LEFT JOIN v_wip w ON w.product_id = p.id AND w.station_id = r.station_id
      WHERE r.station_id = $1
      ORDER BY p.name`, [stationId])).rows;

  const openDowntime = (await db.query(
    `SELECT * FROM downtime WHERE station_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1`, [stationId])).rows[0] || null;

  res.json({ station, products, openDowntime });
}));

// ──────────────────────────────────────────────────────────────────── SMENA
app.post('/api/shift/open', wrap(async (req, res) => {
  const { line_id, shift_no = 1, worker_id, work_date = today() } = req.body;
  const { rows } = await db.query(
    `INSERT INTO shifts (work_date, shift_no, line_id, opened_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (work_date, shift_no, line_id) DO UPDATE SET closed_at = NULL
     RETURNING *`, [work_date, shift_no, line_id, worker_id || null]);
  res.json(rows[0]);
}));

app.post('/api/shift/:id/close', wrap(async (req, res) => {
  const { rows } = await db.query(
    `UPDATE shifts SET closed_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  res.json(rows[0]);
}));

app.get('/api/shift/current', wrap(async (req, res) => {
  const { line_id, shift_no = 1 } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM shifts
      WHERE work_date = $1 AND line_id = $2 AND shift_no = $3 AND closed_at IS NULL`,
    [today(), line_id, shift_no]);
  res.json(rows[0] || null);
}));

// ───────────────────────────────────────────── ★ ASOSIY: uchastkadan o'tkazish
app.post('/api/flow', wrap(async (req, res) => {
  const {
    shift_id, station_id, product_id,
    qty_ok = 0, qty_defect = 0, worker_id,
    defect_reason, origin_station_id, note,
  } = req.body;

  if (!shift_id || !station_id || !product_id)
    return res.status(400).json({ error: 'shift_id, station_id, product_id majburiy' });
  if (qty_defect > 0 && !defect_reason)
    return res.status(400).json({ error: 'Brak uchun sabab kodi majburiy' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const flow = (await client.query(
      `INSERT INTO flow_log (shift_id, station_id, product_id, qty_ok, qty_defect, worker_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [shift_id, station_id, product_id, qty_ok, qty_defect, worker_id || null, note || null]
    )).rows[0];

    if (qty_defect > 0) {
      await client.query(
        `INSERT INTO defects (flow_log_id, station_id, product_id, reason_code, qty, origin_station_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [flow.id, station_id, product_id, defect_reason, qty_defect, origin_station_id || null]
      );
    }

    // Chiqish uchastkasi (omborga topshirish) → tayyor mahsulot qoldig'i
    const isExit = (await client.query(
      `SELECT is_exit FROM stations WHERE id = $1`, [station_id])).rows[0]?.is_exit;
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
  const { rows } = await db.query(`DELETE FROM flow_log WHERE id = $1 RETURNING *`, [req.params.id]);
  res.json(rows[0] || null);
}));

// ─────────────────────────────────────────────────────────────────── PROSTOY
app.post('/api/downtime/start', wrap(async (req, res) => {
  const { shift_id, station_id, reason_code, worker_id, note } = req.body;
  const { rows } = await db.query(
    `INSERT INTO downtime (shift_id, station_id, reason_code, worker_id, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [shift_id, station_id, reason_code, worker_id || null, note || null]);
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
  const { shift_id, station_id, chamber, product_id, qty, worker_id } = req.body;
  const { rows } = await db.query(
    `INSERT INTO paint_batches (shift_id, station_id, chamber, product_id, qty, worker_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [shift_id, station_id, chamber, product_id, qty, worker_id || null]);
  res.json(rows[0]);
}));

app.post('/api/paint/:id/finish', wrap(async (req, res) => {
  const { repaint_qty = 0 } = req.body;
  const { rows } = await db.query(
    `UPDATE paint_batches SET ended_at = NOW(), repaint_qty = $2
      WHERE id = $1 RETURNING *`, [req.params.id, repaint_qty]);
  res.json(rows[0] || null);
}));

// ─────────────────────────────────────────────────────────────────── HISOBOT
app.get('/api/dashboard', wrap(async (req, res) => {
  const date = req.query.date || today();

  const [planFact, deptWip, bottleneck, defects, downtime, completeness, blockers, stationDaily] =
    await Promise.all([
      db.query(`SELECT * FROM v_plan_fact WHERE work_date = $1 ORDER BY product`, [date]),
      db.query(`SELECT * FROM v_department_wip`),
      db.query(
        `SELECT st.name AS station, d.name AS department, l.name AS line,
                SUM(GREATEST(w.queue_qty,0)) AS queue_qty
           FROM v_wip w
           JOIN stations st   ON st.id = w.station_id
           JOIN departments d ON d.id = st.department_id
           JOIN lines l       ON l.id = d.line_id
          GROUP BY st.name, d.name, l.name
          HAVING SUM(GREATEST(w.queue_qty,0)) > 0
          ORDER BY queue_qty DESC LIMIT 5`),
      db.query(`SELECT * FROM v_defect_pareto LIMIT 8`),
      db.query(`SELECT * FROM v_downtime_pareto LIMIT 8`),
      db.query(`SELECT * FROM v_set_completeness ORDER BY complete_sets`),
      db.query(`SELECT * FROM v_set_blockers`),
      db.query(`SELECT * FROM v_station_daily WHERE work_date = $1
                 ORDER BY line, department, station`, [date]),
    ]);

  res.json({
    date,
    planFact: planFact.rows,
    departmentWip: deptWip.rows,
    bottleneck: bottleneck.rows,
    defects: defects.rows,
    downtime: downtime.rows,
    completeness: completeness.rows,
    // Har to'plam uchun eng kam imkon beruvchi pozitsiya — jo'natishni bloklaydi
    blockers: blockers.rows,
    stationDaily: stationDaily.rows,
  });
}));

app.get('/api/wip', wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT p.name AS product, st.name AS station, d.name AS department,
            w.step_no, w.queue_qty
       FROM v_wip w
       JOIN products p    ON p.id = w.product_id
       JOIN stations st   ON st.id = w.station_id
       JOIN departments d ON d.id = st.department_id
      WHERE w.queue_qty <> 0
      ORDER BY w.queue_qty DESC`);
  res.json(rows);
}));

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production API → http://localhost:${PORT}`));
