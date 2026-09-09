-- ============================================================================
--  SCANDI GROUP — MEBEL ISHLAB CHIQARISH MONITORINGI
--  PostgreSQL schema
--
--  Asosiy g'oya: qat'iy konveyer emas, MARSHRUTLI OQIM (routed flow).
--  Har mahsulot (SKU) o'z marshrut shablonига ega; ayrim fasonlar
--  ayrim uchastkalarni chetlab o'tadi (product_route_skip).
-- ============================================================================

-- ---------------------------------------------------------------- SPRAVOCHNIK

-- Liniya: 1) Korpus mebel (mehmonxona/yotoqxona/stol)  2) Stul
CREATE TABLE IF NOT EXISTS lines (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  sort        INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Bo'lim: Korpus / Bo'yoqlash / Qadoqlash
--   kind = 'flow'  → dona/soat bilan o'lchanadi
--   kind = 'batch' → partiya + quritish sikli bilan o'lchanadi (bo'yoqlash)
CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  line_id     INT  NOT NULL REFERENCES lines(id),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'flow' CHECK (kind IN ('flow','batch')),
  sort        INT  NOT NULL DEFAULT 0,
  -- 1-fazada faqat bo'lim chegaralari o'lchanadi. true bo'lsa —
  -- bu bo'lim ichidagi har uchastka alohida qayd etiladi.
  track_stations BOOLEAN NOT NULL DEFAULT false
);

-- Uchastka (post): Arra, Rover, Press, ... Palirovka, Qadoqlash
CREATE TABLE IF NOT EXISTS stations (
  id            SERIAL PRIMARY KEY,
  department_id INT  NOT NULL REFERENCES departments(id),
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  sort          INT  NOT NULL DEFAULT 0,
  is_exit       BOOLEAN NOT NULL DEFAULT false,  -- omborga topshirish nuqtasi
  active        BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_stations_dept ON stations(department_id);

-- Mahsulot guruhi: Mehmonxona to'plami, Yotoqxona to'plami, Stol, Stul
CREATE TABLE IF NOT EXISTS product_groups (
  id      SERIAL PRIMARY KEY,
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  line_id INT NOT NULL REFERENCES lines(id)
);

-- Fason (model/uslub): Milano, Verona, ...
CREATE TABLE IF NOT EXISTS fasons (
  id     SERIAL PRIMARY KEY,
  code   TEXT UNIQUE NOT NULL,
  name   TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------------- MARSHRUT

-- Marshrut shabloni: "To'liq", "Palirovkasiz", "Oynasiz" va h.k.
CREATE TABLE IF NOT EXISTS route_templates (
  id      SERIAL PRIMARY KEY,
  line_id INT  NOT NULL REFERENCES lines(id),
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL
);

-- Shablon qadamlari: qaysi uchastkalar, qaysi tartibda, norma necha daqiqa
CREATE TABLE IF NOT EXISTS route_steps (
  id          SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE,
  station_id  INT NOT NULL REFERENCES stations(id),
  sort        INT NOT NULL,
  -- Normani ISHGA TUSHGANDA BO'SH QOLDIRING. Birinchi 3-4 hafta real fakt
  -- yig'iladi, keyin baseline asosida to'ldiriladi.
  norma_min   NUMERIC(8,2),
  UNIQUE (template_id, station_id)
);

-- Mahsulot (SKU). is_set = true → bu to'plam, tarkibi set_items'da.
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  sku               TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  group_id          INT  NOT NULL REFERENCES product_groups(id),
  fason_id          INT  REFERENCES fasons(id),
  route_template_id INT  REFERENCES route_templates(id),
  is_set            BOOLEAN NOT NULL DEFAULT false,
  active            BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_products_group ON products(group_id);

-- To'plam tarkibi: 1 ta mehmonxona to'plami = vitrina 1 + tumba 2 + ...
CREATE TABLE IF NOT EXISTS set_items (
  set_product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_product_id INT NOT NULL REFERENCES products(id),
  qty             INT NOT NULL DEFAULT 1,
  PRIMARY KEY (set_product_id, item_product_id)
);

-- Fason istisnosi: shu SKU shu uchastkaga KIRMAYDI
-- (masalan oynasiz fason → "Oyna qo'yish" tashlab ketiladi)
CREATE TABLE IF NOT EXISTS product_route_skip (
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  station_id INT NOT NULL REFERENCES stations(id),
  note       TEXT,
  PRIMARY KEY (product_id, station_id)
);

-- ------------------------------------------------------------------- XODIMLAR

CREATE TABLE IF NOT EXISTS workers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  pin           TEXT UNIQUE,          -- terminalga kirish uchun 4 xonali kod
  tg_id         BIGINT,
  role          TEXT NOT NULL DEFAULT 'operator'
                CHECK (role IN ('operator','master','head','admin')),
  department_id INT REFERENCES departments(id),
  active        BOOLEAN NOT NULL DEFAULT true
);

-- --------------------------------------------------------------------- SABAB

CREATE TABLE IF NOT EXISTS defect_reasons (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  sort  INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS downtime_reasons (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  sort  INT NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------- OPERATIV

CREATE TABLE IF NOT EXISTS shifts (
  id         SERIAL PRIMARY KEY,
  work_date  DATE NOT NULL,
  shift_no   INT  NOT NULL DEFAULT 1,
  line_id    INT  NOT NULL REFERENCES lines(id),
  opened_by  INT  REFERENCES workers(id),
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at  TIMESTAMPTZ,
  UNIQUE (work_date, shift_no, line_id)
);

-- Kunlik reja (dona)
CREATE TABLE IF NOT EXISTS plans (
  id         SERIAL PRIMARY KEY,
  work_date  DATE NOT NULL,
  line_id    INT  NOT NULL REFERENCES lines(id),
  product_id INT  NOT NULL REFERENCES products(id),
  qty        INT  NOT NULL,
  UNIQUE (work_date, line_id, product_id)
);

-- ★ TIZIM YADROSI: har uchastkadan o'tgan dona
CREATE TABLE IF NOT EXISTS flow_log (
  id          BIGSERIAL PRIMARY KEY,
  shift_id    INT  NOT NULL REFERENCES shifts(id),
  station_id  INT  NOT NULL REFERENCES stations(id),
  product_id  INT  NOT NULL REFERENCES products(id),
  qty_ok      INT  NOT NULL DEFAULT 0,
  qty_defect  INT  NOT NULL DEFAULT 0,
  worker_id   INT  REFERENCES workers(id),
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT,
  CHECK (qty_ok >= 0 AND qty_defect >= 0)
);
CREATE INDEX IF NOT EXISTS idx_flow_shift   ON flow_log(shift_id);
CREATE INDEX IF NOT EXISTS idx_flow_station ON flow_log(station_id, product_id);
CREATE INDEX IF NOT EXISTS idx_flow_ts      ON flow_log(ts);

CREATE TABLE IF NOT EXISTS defects (
  id           BIGSERIAL PRIMARY KEY,
  flow_log_id  BIGINT REFERENCES flow_log(id) ON DELETE CASCADE,
  station_id   INT  NOT NULL REFERENCES stations(id),
  product_id   INT  NOT NULL REFERENCES products(id),
  reason_code  TEXT NOT NULL REFERENCES defect_reasons(code),
  qty          INT  NOT NULL,
  -- brak topilgan joy emas, KELIB CHIQQAN joy (bo'yoqda topilgan korpus xatosi)
  origin_station_id INT REFERENCES stations(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_defects_ts ON defects(ts);

CREATE TABLE IF NOT EXISTS downtime (
  id          BIGSERIAL PRIMARY KEY,
  shift_id    INT  NOT NULL REFERENCES shifts(id),
  station_id  INT  NOT NULL REFERENCES stations(id),
  reason_code TEXT REFERENCES downtime_reasons(code),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  worker_id   INT REFERENCES workers(id),
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_downtime_shift ON downtime(shift_id);

-- Bo'yoqlash: partiyali jarayon (kamera + quritish sikli)
CREATE TABLE IF NOT EXISTS paint_batches (
  id           BIGSERIAL PRIMARY KEY,
  shift_id     INT  NOT NULL REFERENCES shifts(id),
  station_id   INT  NOT NULL REFERENCES stations(id),  -- Astar/Grunt/Rang/Lak
  chamber      TEXT NOT NULL,                          -- kamera nomi
  product_id   INT  NOT NULL REFERENCES products(id),
  qty          INT  NOT NULL,
  repaint_qty  INT  NOT NULL DEFAULT 0,                -- qayta bo'yalgan
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  worker_id    INT REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_paint_shift ON paint_batches(shift_id);

-- Tayyor mahsulot ombori (is_exit uchastkasidan topshirilgan)
CREATE TABLE IF NOT EXISTS fg_stock (
  product_id INT PRIMARY KEY REFERENCES products(id),
  qty        INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================== HISOBOT VIEW'LARI

-- Mahsulotning haqiqiy marshruti (shablon − istisnolar)
CREATE OR REPLACE VIEW v_product_route AS
SELECT p.id                                                        AS product_id,
       rs.station_id,
       ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY rs.sort)      AS step_no,
       rs.norma_min
FROM products p
JOIN route_steps rs      ON rs.template_id = p.route_template_id
JOIN stations st         ON st.id = rs.station_id AND st.active
LEFT JOIN product_route_skip sk
       ON sk.product_id = p.id AND sk.station_id = rs.station_id
WHERE p.active AND sk.product_id IS NULL;

-- Har qadamning oldingi uchastkasi (navbatni hisoblash uchun)
CREATE OR REPLACE VIEW v_product_route_lag AS
SELECT product_id, station_id, step_no, norma_min,
       LAG(station_id) OVER (PARTITION BY product_id ORDER BY step_no) AS prev_station_id
FROM v_product_route;

CREATE OR REPLACE VIEW v_station_totals AS
SELECT product_id, station_id,
       SUM(qty_ok)     AS qty_ok,
       SUM(qty_defect) AS qty_defect
FROM flow_log
GROUP BY product_id, station_id;

-- ★ WIP / navbat: uchastka oldida nechta yarim tayyor turibdi.
--   Bottleneck aynan shu yerda ko'rinadi.
CREATE OR REPLACE VIEW v_wip AS
SELECT rl.product_id,
       rl.station_id,
       rl.step_no,
       COALESCE(pv.qty_ok, 0) - COALESCE(cu.qty_ok, 0) - COALESCE(cu.qty_defect, 0) AS queue_qty
FROM v_product_route_lag rl
LEFT JOIN v_station_totals pv
       ON pv.product_id = rl.product_id AND pv.station_id = rl.prev_station_id
LEFT JOIN v_station_totals cu
       ON cu.product_id = rl.product_id AND cu.station_id = rl.station_id
WHERE rl.prev_station_id IS NOT NULL;

-- Bo'limlar kesimida navbat
CREATE OR REPLACE VIEW v_department_wip AS
SELECT d.id AS department_id, d.name AS department, l.name AS line,
       SUM(GREATEST(w.queue_qty, 0)) AS queue_qty
FROM v_wip w
JOIN stations d2   ON d2.id = w.station_id
JOIN departments d ON d.id = d2.department_id
JOIN lines l       ON l.id = d.line_id
GROUP BY d.id, d.name, l.name, d.sort
ORDER BY d.sort;

-- Kunlik uchastka natijasi
CREATE OR REPLACE VIEW v_station_daily AS
SELECT s.work_date, st.id AS station_id, st.name AS station,
       d.name AS department, l.name AS line,
       SUM(f.qty_ok)     AS qty_ok,
       SUM(f.qty_defect) AS qty_defect,
       ROUND(100.0 * SUM(f.qty_defect)
             / NULLIF(SUM(f.qty_ok) + SUM(f.qty_defect), 0), 2) AS defect_pct
FROM flow_log f
JOIN shifts s      ON s.id = f.shift_id
JOIN stations st   ON st.id = f.station_id
JOIN departments d ON d.id = st.department_id
JOIN lines l       ON l.id = d.line_id
GROUP BY s.work_date, st.id, st.name, d.name, l.name;

-- Reja / fakt (fakt = chiqish uchastkasidan o'tgan dona)
CREATE OR REPLACE VIEW v_plan_fact AS
SELECT pl.work_date, pl.line_id, pl.product_id, p.name AS product,
       pl.qty AS plan_qty,
       COALESCE(SUM(f.qty_ok), 0) AS fact_qty,
       ROUND(100.0 * COALESCE(SUM(f.qty_ok), 0) / NULLIF(pl.qty, 0), 1) AS pct
FROM plans pl
JOIN products p ON p.id = pl.product_id
LEFT JOIN shifts sh ON sh.work_date = pl.work_date AND sh.line_id = pl.line_id
LEFT JOIN flow_log f
       ON f.shift_id = sh.id
      AND f.product_id = pl.product_id
      AND f.station_id IN (SELECT id FROM stations WHERE is_exit)
GROUP BY pl.work_date, pl.line_id, pl.product_id, p.name, pl.qty;

-- ★ KOMPLEKTLILIK: omborda nechta TO'LIQ to'plam yig'ish mumkin.
--   "500 dona ishlab chiqarildi" degani "40 to'plam sotish mumkin" degani emas.
CREATE OR REPLACE VIEW v_set_completeness AS
SELECT sp.id   AS set_product_id,
       sp.name AS set_name,
       MIN(FLOOR(COALESCE(stk.qty, 0)::numeric / si.qty))::int AS complete_sets,
       SUM(COALESCE(stk.qty, 0))                               AS items_in_stock
FROM products sp
JOIN set_items si ON si.set_product_id = sp.id
LEFT JOIN fg_stock stk ON stk.product_id = si.item_product_id
WHERE sp.is_set AND sp.active
GROUP BY sp.id, sp.name;

-- To'plamni bloklab turgan pozitsiya — direktor ko'radigan birinchi ekran
CREATE OR REPLACE VIEW v_set_blockers AS
SELECT sp.id AS set_product_id, sp.name AS set_name,
       ip.name AS blocking_item,
       si.qty  AS need_per_set,
       COALESCE(stk.qty, 0) AS in_stock,
       FLOOR(COALESCE(stk.qty, 0)::numeric / si.qty)::int AS sets_possible
FROM products sp
JOIN set_items si      ON si.set_product_id = sp.id
JOIN products ip       ON ip.id = si.item_product_id
LEFT JOIN fg_stock stk ON stk.product_id = si.item_product_id
WHERE sp.is_set AND sp.active
ORDER BY sp.name, sets_possible;

-- Brak Pareto
CREATE OR REPLACE VIEW v_defect_pareto AS
SELECT dr.code, dr.name AS reason, SUM(d.qty) AS qty,
       COALESCE(os.name, st.name) AS origin_station
FROM defects d
JOIN defect_reasons dr ON dr.code = d.reason_code
JOIN stations st       ON st.id = d.station_id
LEFT JOIN stations os  ON os.id = d.origin_station_id
GROUP BY dr.code, dr.name, COALESCE(os.name, st.name)
ORDER BY qty DESC;

-- Prostoy Pareto (daqiqa)
CREATE OR REPLACE VIEW v_downtime_pareto AS
SELECT r.code, r.name AS reason, st.name AS station,
       ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(dt.ended_at, NOW()) - dt.started_at)) / 60)) AS minutes
FROM downtime dt
JOIN downtime_reasons r ON r.code = dt.reason_code
JOIN stations st        ON st.id = dt.station_id
GROUP BY r.code, r.name, st.name
ORDER BY minutes DESC;
