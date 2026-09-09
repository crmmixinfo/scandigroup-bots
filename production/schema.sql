-- ============================================================================
--  SCANDI GROUP — MEBEL ISHLAB CHIQARISH MONITORINGI
--  PostgreSQL schema
--
--  Ierarxiya:  TSEX  →  BO'LIM  →  (mahsulot marshruti)
--    Tsexlar: Korpus · Bo'yoqlash · Qadoqlash · Stul
--    Bo'limlar: Arra, Rover, Press ... Palirovka, Qoplash, Qadoqlash
--
--  Ikki asosiy prinsip:
--
--  1) MARSHRUTLI OQIM — qat'iy konveyer emas. Har SKU o'z marshrutiga ega;
--     ayrim fasonlar ayrim bo'limlarni chetlab o'tadi.
--
--  2) UMUMIY TSEX — bo'yoqlash tsexi ikkala yo'nalishni (korpus mebel va stul)
--     xizmat qiladi. Shuning uchun u yo'nalishga bog'lanmagan
--     (shops.line_id NULL, is_shared = true) va navbati manba yo'nalish
--     kesimida hisoblanadi.
-- ============================================================================

-- ---------------------------------------------------------------- SPRAVOCHNIK

-- Ishlab chiqarish yo'nalishi (mahsulot oqimi), tsexdan farqli tushuncha
CREATE TABLE IF NOT EXISTS lines (
  id     SERIAL PRIMARY KEY,
  code   TEXT UNIQUE NOT NULL,
  name   TEXT NOT NULL,
  sort   INT  NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

-- TSEX. line_id NULL → umumiy tsex (bo'yoqlash), ikkala yo'nalishga xizmat qiladi.
--   kind = 'flow'  → dona/soat bilan o'lchanadi
--   kind = 'batch' → partiya + quritish sikli bilan o'lchanadi
CREATE TABLE IF NOT EXISTS shops (
  id        SERIAL PRIMARY KEY,
  line_id   INT REFERENCES lines(id),
  code      TEXT UNIQUE NOT NULL,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'flow' CHECK (kind IN ('flow','batch')),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  sort      INT  NOT NULL DEFAULT 0,
  -- 1-fazada faqat tsex chegaralari o'lchanadi. Bottleneck aniqlangach,
  -- o'sha tsexda true qilinadi va bo'limlar alohida qayd etiladi.
  track_sections BOOLEAN NOT NULL DEFAULT false,
  CHECK ((is_shared AND line_id IS NULL) OR (NOT is_shared AND line_id IS NOT NULL))
);

-- BO'LIM — tsex ichidagi ish nuqtasi (Arra, Rover, Rang sepish, Qoplash ...)
CREATE TABLE IF NOT EXISTS sections (
  id      SERIAL PRIMARY KEY,
  shop_id INT  NOT NULL REFERENCES shops(id),
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  sort    INT  NOT NULL DEFAULT 0,
  is_exit BOOLEAN NOT NULL DEFAULT false,   -- omborga topshirish nuqtasi
  active  BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_sections_shop ON sections(shop_id);

-- Bo'yoqlash kameralari — umumiy tsexning haqiqiy quvvat chegarasi
CREATE TABLE IF NOT EXISTS chambers (
  id           SERIAL PRIMARY KEY,
  shop_id      INT  NOT NULL REFERENCES shops(id),
  code         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  capacity_qty INT,      -- bir siklda nechta dona sig'adi
  cycle_min    INT,      -- quritish sikli (daqiqa)
  active       BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_groups (
  id      SERIAL PRIMARY KEY,
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  line_id INT NOT NULL REFERENCES lines(id)
);

CREATE TABLE IF NOT EXISTS fasons (
  id     SERIAL PRIMARY KEY,
  code   TEXT UNIQUE NOT NULL,
  name   TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------------- MARSHRUT

CREATE TABLE IF NOT EXISTS route_templates (
  id      SERIAL PRIMARY KEY,
  line_id INT  NOT NULL REFERENCES lines(id),
  code    TEXT UNIQUE NOT NULL,
  name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_steps (
  id          SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES route_templates(id) ON DELETE CASCADE,
  section_id  INT NOT NULL REFERENCES sections(id),
  sort        INT NOT NULL,
  -- Normani ISHGA TUSHGANDA BO'SH QOLDIRING. Birinchi 3-4 hafta real fakt
  -- yig'iladi, keyin baseline asosida to'ldiriladi.
  norma_min   NUMERIC(8,2),
  UNIQUE (template_id, section_id)
);

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

CREATE TABLE IF NOT EXISTS set_items (
  set_product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_product_id INT NOT NULL REFERENCES products(id),
  qty             INT NOT NULL DEFAULT 1,
  PRIMARY KEY (set_product_id, item_product_id)
);

-- Fason istisnosi: shu SKU shu bo'limga KIRMAYDI
CREATE TABLE IF NOT EXISTS product_route_skip (
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section_id INT NOT NULL REFERENCES sections(id),
  note       TEXT,
  PRIMARY KEY (product_id, section_id)
);

-- ------------------------------------------------------------------- XODIMLAR

CREATE TABLE IF NOT EXISTS workers (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  pin     TEXT UNIQUE,
  tg_id   BIGINT,
  role    TEXT NOT NULL DEFAULT 'operator'
          CHECK (role IN ('operator','master','head','admin')),
  shop_id INT REFERENCES shops(id),
  active  BOOLEAN NOT NULL DEFAULT true
);

-- --------------------------------------------------------------------- SABAB

CREATE TABLE IF NOT EXISTS defect_reasons (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, sort INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS downtime_reasons (
  code TEXT PRIMARY KEY, name TEXT NOT NULL, sort INT NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------- OPERATIV

-- Smena yo'nalish kesimida yuritiladi. Umumiy bo'yoqlash tsexida ishlangan dona
-- MAHSULOT YO'NALISHIGA yoziladi — chiqish har doim to'g'ri yo'nalishga tegishli.
CREATE TABLE IF NOT EXISTS shifts (
  id        SERIAL PRIMARY KEY,
  work_date DATE NOT NULL,
  shift_no  INT  NOT NULL DEFAULT 1,
  line_id   INT  NOT NULL REFERENCES lines(id),
  opened_by INT  REFERENCES workers(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  UNIQUE (work_date, shift_no, line_id)
);

CREATE TABLE IF NOT EXISTS plans (
  id         SERIAL PRIMARY KEY,
  work_date  DATE NOT NULL,
  line_id    INT  NOT NULL REFERENCES lines(id),
  product_id INT  NOT NULL REFERENCES products(id),
  qty        INT  NOT NULL,
  UNIQUE (work_date, line_id, product_id)
);

-- ★ TIZIM YADROSI: har bo'limdan o'tgan dona
CREATE TABLE IF NOT EXISTS flow_log (
  id         BIGSERIAL PRIMARY KEY,
  shift_id   INT  NOT NULL REFERENCES shifts(id),
  section_id INT  NOT NULL REFERENCES sections(id),
  product_id INT  NOT NULL REFERENCES products(id),
  qty_ok     INT  NOT NULL DEFAULT 0,
  qty_defect INT  NOT NULL DEFAULT 0,
  worker_id  INT  REFERENCES workers(id),
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT,
  CHECK (qty_ok >= 0 AND qty_defect >= 0)
);
CREATE INDEX IF NOT EXISTS idx_flow_shift   ON flow_log(shift_id);
CREATE INDEX IF NOT EXISTS idx_flow_section ON flow_log(section_id, product_id);
CREATE INDEX IF NOT EXISTS idx_flow_ts      ON flow_log(ts);

CREATE TABLE IF NOT EXISTS defects (
  id          BIGSERIAL PRIMARY KEY,
  flow_log_id BIGINT REFERENCES flow_log(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  section_id  INT  NOT NULL REFERENCES sections(id),
  product_id  INT  NOT NULL REFERENCES products(id),
  reason_code TEXT NOT NULL REFERENCES defect_reasons(code),
  qty         INT  NOT NULL,
  -- brak topilgan joy emas, KELIB CHIQQAN joy
  -- (bo'yoqlashda topilgan korpus xatosi korpusga yoziladi)
  origin_section_id INT REFERENCES sections(id),
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_defects_date ON defects(work_date);

-- To'xtash smenaga emas, BO'LIM + VAQTga bog'langan: umumiy bo'yoqlash tsexi
-- to'xtaganda u bitta yo'nalishga tegishli bo'lmaydi.
CREATE TABLE IF NOT EXISTS downtime (
  id          BIGSERIAL PRIMARY KEY,
  work_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_no    INT  NOT NULL DEFAULT 1,
  section_id  INT  NOT NULL REFERENCES sections(id),
  reason_code TEXT REFERENCES downtime_reasons(code),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  worker_id   INT REFERENCES workers(id),
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_downtime_date ON downtime(work_date);

CREATE TABLE IF NOT EXISTS paint_batches (
  id          BIGSERIAL PRIMARY KEY,
  work_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_no    INT  NOT NULL DEFAULT 1,
  section_id  INT  NOT NULL REFERENCES sections(id),
  chamber_id  INT  REFERENCES chambers(id),
  product_id  INT  NOT NULL REFERENCES products(id),
  qty         INT  NOT NULL,
  repaint_qty INT  NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  worker_id   INT REFERENCES workers(id)
);
CREATE INDEX IF NOT EXISTS idx_paint_date ON paint_batches(work_date);

CREATE TABLE IF NOT EXISTS fg_stock (
  product_id INT PRIMARY KEY REFERENCES products(id),
  qty        INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================================== HISOBOT VIEW'LARI

-- Mahsulot → yo'nalish. Hisobotlarda yo'nalish AYNAN SHU YERDAN olinadi,
-- tsexdan emas: umumiy bo'yoqlash tsexida ishlangan dona o'z yo'nalishiga tegishli.
CREATE OR REPLACE VIEW v_product_line AS
SELECT p.id AS product_id, l.id AS line_id, l.name AS line_name
FROM products p
JOIN product_groups g ON g.id = p.group_id
JOIN lines l          ON l.id = g.line_id;

-- Mahsulotning haqiqiy marshruti (shablon − istisnolar)
CREATE OR REPLACE VIEW v_product_route AS
SELECT p.id                                                  AS product_id,
       rs.section_id,
       ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY rs.sort) AS step_no,
       rs.norma_min
FROM products p
JOIN route_steps rs ON rs.template_id = p.route_template_id
JOIN sections sc    ON sc.id = rs.section_id AND sc.active
LEFT JOIN product_route_skip sk
       ON sk.product_id = p.id AND sk.section_id = rs.section_id
WHERE p.active AND sk.product_id IS NULL;

CREATE OR REPLACE VIEW v_product_route_lag AS
SELECT product_id, section_id, step_no, norma_min,
       LAG(section_id) OVER (PARTITION BY product_id ORDER BY step_no) AS prev_section_id
FROM v_product_route;

CREATE OR REPLACE VIEW v_section_totals AS
SELECT product_id, section_id, SUM(qty_ok) AS qty_ok, SUM(qty_defect) AS qty_defect
FROM flow_log GROUP BY product_id, section_id;

-- ★ WIP / navbat: bo'lim oldida nechta yarim tayyor turibdi
CREATE OR REPLACE VIEW v_wip AS
SELECT rl.product_id, rl.section_id, rl.step_no,
       COALESCE(pv.qty_ok,0) - COALESCE(cu.qty_ok,0) - COALESCE(cu.qty_defect,0) AS queue_qty
FROM v_product_route_lag rl
LEFT JOIN v_section_totals pv
       ON pv.product_id = rl.product_id AND pv.section_id = rl.prev_section_id
LEFT JOIN v_section_totals cu
       ON cu.product_id = rl.product_id AND cu.section_id = rl.section_id
WHERE rl.prev_section_id IS NOT NULL;

-- Tsexlar kesimida navbat. Umumiy tsex uchun yo'nalish bo'yicha ham ajratiladi.
CREATE OR REPLACE VIEW v_shop_wip AS
SELECT sh.id AS shop_id, sh.name AS shop, sh.is_shared, sh.sort,
       pl.line_name,
       SUM(GREATEST(w.queue_qty, 0)) AS queue_qty
FROM v_wip w
JOIN sections sc       ON sc.id = w.section_id
JOIN shops sh          ON sh.id = sc.shop_id
JOIN v_product_line pl ON pl.product_id = w.product_id
GROUP BY sh.id, sh.name, sh.is_shared, sh.sort, pl.line_name;

-- ★ UMUMIY TSEX YUKLAMASI: bo'yoqlash quvvatini qaysi yo'nalish qancha yeyapti.
--   Umumiy resursda bu asosiy boshqaruv savoli.
CREATE OR REPLACE VIEW v_shared_load AS
WITH q AS (
  SELECT sh.id AS shop_id, sh.name AS shop, pl.line_name,
         SUM(GREATEST(w.queue_qty, 0)) AS queue_qty
  FROM v_wip w
  JOIN sections sc       ON sc.id = w.section_id
  JOIN shops sh          ON sh.id = sc.shop_id AND sh.is_shared
  JOIN v_product_line pl ON pl.product_id = w.product_id
  GROUP BY sh.id, sh.name, pl.line_name
)
SELECT shop_id, shop, line_name, queue_qty,
       ROUND(100.0 * queue_qty / NULLIF(SUM(queue_qty) OVER (PARTITION BY shop_id), 0), 1)
         AS share_pct
FROM q;

CREATE OR REPLACE VIEW v_section_daily AS
SELECT s.work_date, sc.id AS section_id, sc.name AS section,
       sh.name AS shop, sh.is_shared, pl.line_name AS line,
       SUM(f.qty_ok)     AS qty_ok,
       SUM(f.qty_defect) AS qty_defect,
       ROUND(100.0 * SUM(f.qty_defect)
             / NULLIF(SUM(f.qty_ok) + SUM(f.qty_defect), 0), 2) AS defect_pct
FROM flow_log f
JOIN shifts s          ON s.id = f.shift_id
JOIN sections sc       ON sc.id = f.section_id
JOIN shops sh          ON sh.id = sc.shop_id
JOIN v_product_line pl ON pl.product_id = f.product_id
GROUP BY s.work_date, sc.id, sc.name, sh.name, sh.is_shared, pl.line_name;

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
      AND f.section_id IN (SELECT id FROM sections WHERE is_exit)
GROUP BY pl.work_date, pl.line_id, pl.product_id, p.name, pl.qty;

-- ★ KOMPLEKTLILIK: omborda nechta TO'LIQ to'plam yig'ish mumkin.
--   "500 dona ishlab chiqarildi" ≠ "40 to'plam sotish mumkin".
CREATE OR REPLACE VIEW v_set_completeness AS
SELECT sp.id AS set_product_id, sp.name AS set_name,
       MIN(FLOOR(COALESCE(stk.qty,0)::numeric / si.qty))::int AS complete_sets,
       SUM(COALESCE(stk.qty,0))                               AS items_in_stock
FROM products sp
JOIN set_items si      ON si.set_product_id = sp.id
LEFT JOIN fg_stock stk ON stk.product_id = si.item_product_id
WHERE sp.is_set AND sp.active
GROUP BY sp.id, sp.name;

CREATE OR REPLACE VIEW v_set_blockers AS
SELECT sp.id AS set_product_id, sp.name AS set_name,
       ip.name AS blocking_item, si.qty AS need_per_set,
       COALESCE(stk.qty,0) AS in_stock,
       FLOOR(COALESCE(stk.qty,0)::numeric / si.qty)::int AS sets_possible
FROM products sp
JOIN set_items si      ON si.set_product_id = sp.id
JOIN products ip       ON ip.id = si.item_product_id
LEFT JOIN fg_stock stk ON stk.product_id = si.item_product_id
WHERE sp.is_set AND sp.active
ORDER BY sp.name, sets_possible;

-- Kamera bandligi va o'rtacha sikl — bo'yoqlash quvvatining haqiqiy chegarasi
CREATE OR REPLACE VIEW v_chamber_load AS
SELECT c.id AS chamber_id, c.name AS chamber, b.work_date,
       COUNT(*)           AS batches,
       SUM(b.qty)         AS qty,
       SUM(b.repaint_qty) AS repaint_qty,
       ROUND(AVG(EXTRACT(EPOCH FROM (b.ended_at - b.started_at)) / 60)) AS avg_cycle_min
FROM paint_batches b
JOIN chambers c ON c.id = b.chamber_id
WHERE b.ended_at IS NOT NULL
GROUP BY c.id, c.name, b.work_date;
