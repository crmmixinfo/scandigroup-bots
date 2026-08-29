-- ============================================================
-- ONIX — moliyaviy model
-- Kassa daftari → Pul oqimi + Foyda-zarar (avtomatik)
-- ============================================================
--
-- ASOSIY G'OYA: har bir operatsiyada IKKI SANA bor
--   paid_at — pul real harakat qilgan sana  → PUL OQIMI shu bo'yicha
--   period  — xarajat/daromad qaysi oyga tegishli → FOYDA-ZARAR shu bo'yicha
--
--   Misol: 25-yanvarda fevral arendasi to'landi
--          paid_at = 2026-01-25  (pul oqimi: yanvar)
--          period  = 2026-02-01  (foyda-zarar: fevral)
--
-- VALYUTA: UZS va USD butunlay alohida yuritiladi, jamlanma yo'q.
-- ============================================================

-- ---------- Foydalanuvchilar ----------
CREATE TABLE IF NOT EXISTS onix_users (
  tg_id      BIGINT PRIMARY KEY,
  full_name  TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin','cashier','staff','manager')),
  -- admin   — hammasi + sozlamalar
  -- cashier — kassani yuritadi, podotchyot beradi
  -- staff   — podotchyot puldan xarajat kiritadi
  -- manager — faqat ko'radi (hisobotlar)
  active     BOOLEAN DEFAULT true,
  added_by   BIGINT,
  added_at   TIMESTAMP DEFAULT NOW()
);

-- ---------- Hisoblar (kassalar) ----------
CREATE TABLE IF NOT EXISTS onix_accounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('cash','card','bank','podotchet')),
  -- cash      — naqd kassa
  -- card      — plastik karta
  -- bank      — bank hisobi
  -- podotchet — hodim qo'lidagi hisobdor pul
  currency     TEXT NOT NULL CHECK (currency IN ('UZS','USD')),
  owner_tg_id  BIGINT REFERENCES onix_users(tg_id),   -- faqat podotchet uchun
  emoji        TEXT,
  active       BOOLEAN DEFAULT true,
  sort_order   INT DEFAULT 100,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS onix_accounts_podotchet_uniq
  ON onix_accounts (owner_tg_id, currency) WHERE kind = 'podotchet';

-- ---------- Kategoriyalar (2 pog'onali daraxt) ----------
CREATE TABLE IF NOT EXISTS onix_categories (
  id         SERIAL PRIMARY KEY,
  parent_id  INT REFERENCES onix_categories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  flow       TEXT NOT NULL CHECK (flow IN ('income','expense')),
  emoji      TEXT,
  active     BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 100
);

CREATE INDEX IF NOT EXISTS onix_categories_parent_idx ON onix_categories (parent_id);

-- ---------- Kassa daftari (barcha operatsiyalar) ----------
CREATE TABLE IF NOT EXISTS onix_operations (
  id             SERIAL PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  -- income   — kassaga pul kirdi        (P&L: daromad)
  -- expense  — kassadan pul chiqdi      (P&L: xarajat)
  -- transfer — ichki o'tkazma           (P&L ga TA'SIR QILMAYDI)
  --            kassir → hodim podotchyoti, kassa → plastik, sum → $ konvertatsiya

  account_id     INT NOT NULL REFERENCES onix_accounts(id),
  -- income:   pul KIRGAN hisob
  -- expense:  pul CHIQQAN hisob
  -- transfer: pul CHIQQAN hisob (manba)

  to_account_id  INT REFERENCES onix_accounts(id),   -- faqat transfer: qabul qiluvchi hisob
  category_id    INT REFERENCES onix_categories(id), -- income/expense uchun majburiy (podkategoriya)

  amount         NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  to_amount      NUMERIC(18,2),        -- valyuta konvertatsiyasida qabul qilingan summa
  currency       TEXT NOT NULL CHECK (currency IN ('UZS','USD')),

  paid_at        DATE NOT NULL,        -- >>> PUL OQIMI sanasi
  period         DATE NOT NULL,        -- >>> FOYDA-ZARAR davri (oyning 1-kuni)

  note           TEXT,
  photo_file_id  TEXT,                 -- chek/kvitansiya rasmi

  created_by     BIGINT NOT NULL REFERENCES onix_users(tg_id),
  created_at     TIMESTAMP DEFAULT NOW(),
  deleted_at     TIMESTAMP,            -- soft delete — daftardan hech narsa o'chmaydi
  deleted_by     BIGINT,
  delete_reason  TEXT,

  CONSTRAINT onix_op_transfer_target CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
    OR (type <> 'transfer' AND to_account_id IS NULL)
  ),
  CONSTRAINT onix_op_category_req CHECK (
    (type = 'transfer' AND category_id IS NULL) OR (type <> 'transfer' AND category_id IS NOT NULL)
  ),
  CONSTRAINT onix_op_period_first_day CHECK (EXTRACT(DAY FROM period) = 1)
);

CREATE INDEX IF NOT EXISTS onix_ops_paid_idx    ON onix_operations (paid_at)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS onix_ops_period_idx  ON onix_operations (period)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS onix_ops_account_idx ON onix_operations (account_id, to_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS onix_ops_author_idx  ON onix_operations (created_by, created_at);

-- ---------- Qoldiqlar (hisoblanadigan ko'rinish) ----------
CREATE OR REPLACE VIEW onix_balances AS
SELECT
  a.id AS account_id, a.name, a.kind, a.currency, a.owner_tg_id, a.emoji, a.active, a.sort_order,
  COALESCE((
    SELECT SUM(CASE
      WHEN o.type = 'income'   AND o.account_id    = a.id THEN  o.amount
      WHEN o.type = 'transfer' AND o.to_account_id = a.id THEN  COALESCE(o.to_amount, o.amount)
      WHEN o.type = 'expense'  AND o.account_id    = a.id THEN -o.amount
      WHEN o.type = 'transfer' AND o.account_id    = a.id THEN -o.amount
      ELSE 0 END)
    FROM onix_operations o
    WHERE o.deleted_at IS NULL
      AND (o.account_id = a.id OR o.to_account_id = a.id)
  ), 0) AS balance
FROM onix_accounts a;

-- ============================================================
-- BOSHLANG'ICH MA'LUMOTLAR
-- ============================================================

-- ---------- Kassalar ----------
INSERT INTO onix_accounts (name, kind, currency, emoji, sort_order)
SELECT v.name, v.kind, v.currency, v.emoji, v.sort_order
FROM (VALUES
  ('Naqd (sum)',    'cash', 'UZS', '💵', 10),
  ('Naqd ($)',      'cash', 'USD', '💵', 20),
  ('Plastik (sum)', 'card', 'UZS', '💳', 30),
  ('Plastik ($)',   'card', 'USD', '💳', 40)
) AS v(name, kind, currency, emoji, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM onix_accounts a WHERE a.name = v.name AND a.currency = v.currency
);

-- ---------- Kategoriyalar ----------
-- 1-daraja: bo'lim, 2-daraja: podkategoriya. Operatsiya faqat 2-darajaga yoziladi.
DO $seed$
DECLARE
  tree JSONB := $json$[
    {"flow":"income","emoji":"🛒","name":"Savdo tushumi",
     "kids":["Naqd savdo","Terminal (plastik)","Onlayn to'lov (Click/Payme)","Yetkazib berish","Korporativ buyurtma"]},
    {"flow":"income","emoji":"➕","name":"Boshqa daromad",
     "kids":["Ijaraga berishdan","Bank foizi","Kurs farqi (foyda)","Yetkazib beruvchi bonusi","Boshqa kirim"]},
    {"flow":"income","emoji":"🏦","name":"Moliyaviy kirim",
     "kids":["Ta'sischi qo'shimcha kiritmasi","Olingan qarz","Qaytgan qarz"]},

    {"flow":"expense","emoji":"📦","name":"Xom ashyo va mahsulot",
     "kids":["Oziq-ovqat","Ichimlik","Bir martalik idish","Qadoqlash materiallari","Sarf materiallar"]},
    {"flow":"expense","emoji":"👥","name":"Ish haqi",
     "kids":["Oylik","Avans","Bonus / KPI","Ish haqi soliqlari","Vaqtinchalik ishchi"]},
    {"flow":"expense","emoji":"🏠","name":"Ijara va kommunal",
     "kids":["Ijara haqi","Elektr energiya","Gaz","Suv","Internet va aloqa","Chiqindi olib ketish"]},
    {"flow":"expense","emoji":"📣","name":"Marketing",
     "kids":["SMM va reklama","Blogerlar","Bosma mahsulot","Aksiya va chegirma","Fotograf / kontent"]},
    {"flow":"expense","emoji":"🔧","name":"Operatsion xarajat",
     "kids":["Transport va yoqilg'i","Ta'mirlash","Jihoz va inventar","Tozalash vositalari","Kanselyariya","Formal kiyim"]},
    {"flow":"expense","emoji":"📋","name":"Boshqaruv xarajati",
     "kids":["Bank xizmati","Buxgalteriya / audit","Yuridik xizmat","Litsenziya va ruxsatnoma","Dasturiy ta'minot / obuna","Aloqa (korporativ)"]},
    {"flow":"expense","emoji":"🧾","name":"Soliqlar",
     "kids":["QQS","Aylanma solig'i","Foyda solig'i","Mol-mulk solig'i","Boshqa soliq va yig'im"]},
    {"flow":"expense","emoji":"➖","name":"Boshqa xarajat",
     "kids":["Kutilmagan xarajat","Jarima va penya","Kurs farqi (zarar)","Xayriya","Mehmondo'stlik"]},
    {"flow":"expense","emoji":"🏦","name":"Moliyaviy chiqim",
     "kids":["Berilgan qarz","Qarz qaytarish","Kredit foizi","Ta'sischiga dividend"]}
  ]$json$::jsonb;
  item   JSONB;
  child  TEXT;
  pid    INT;
  i      INT := 0;
  j      INT;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(tree) LOOP
    i := i + 10;

    SELECT id INTO pid FROM onix_categories
     WHERE parent_id IS NULL AND name = item->>'name' AND flow = item->>'flow' LIMIT 1;

    IF pid IS NULL THEN
      INSERT INTO onix_categories (parent_id, name, flow, emoji, sort_order)
      VALUES (NULL, item->>'name', item->>'flow', item->>'emoji', i)
      RETURNING id INTO pid;
    END IF;

    j := 0;
    FOR child IN SELECT jsonb_array_elements_text(item->'kids') LOOP
      j := j + 10;
      INSERT INTO onix_categories (parent_id, name, flow, emoji, sort_order)
      SELECT pid, child, item->>'flow', NULL, j
      WHERE NOT EXISTS (SELECT 1 FROM onix_categories WHERE parent_id = pid AND name = child);
    END LOOP;
  END LOOP;
END $seed$;
