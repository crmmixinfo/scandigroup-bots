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

-- Telegram username — hodim /start bosganda taniib olish uchun
ALTER TABLE onix_users ADD COLUMN IF NOT EXISTS username TEXT;

-- ---------- Kutilayotgan foydalanuvchilar ----------
-- Bot @username ni raqamli ID ga aylantira olmaydi, shuning uchun admin
-- odamni username bo'yicha oldindan yozib qo'yadi. Hodim botga /start
-- bosgan zahoti tizim uni taniydi va haqiqiy tg_id bilan bog'laydi.
CREATE TABLE IF NOT EXISTS onix_pending_users (
  username   TEXT PRIMARY KEY,          -- @ belgisiz, kichik harflarda
  full_name  TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin','cashier','staff','manager')),
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

-- ---------- Kategoriyalar (3 pog'onali daraxt) ----------
--   level 1 — GURUH          (parent_id = NULL)   masalan: "Doimiy xarajat"
--   level 2 — KATEGORIYA     (ota: guruh)         masalan: "Ijara va kommunal"
--   level 3 — PODKATEGORIYA  (ota: kategoriya)    masalan: "Elektr energiya"
--
-- Operatsiya HAR DOIM 3-darajaga (podkategoriyaga) yoziladi.
-- Hisobotlar guruh → kategoriya → podkategoriya kesimida yig'iladi.
CREATE TABLE IF NOT EXISTS onix_categories (
  id         SERIAL PRIMARY KEY,
  parent_id  INT REFERENCES onix_categories(id) ON DELETE CASCADE,
  level      INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 3),
  name       TEXT NOT NULL,
  flow       TEXT NOT NULL CHECK (flow IN ('income','expense')),
  emoji      TEXT,
  active     BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 100
);

-- Avvalgi 2 pog'onali bazadan yangilanish (bir marta ishlaydi)
ALTER TABLE onix_categories ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS onix_categories_parent_idx ON onix_categories (parent_id);
CREATE INDEX IF NOT EXISTS onix_categories_level_idx  ON onix_categories (level, flow) WHERE active;

-- Daraja va ota-bola bog'lanishini bazaning o'zi tekshiradi
CREATE OR REPLACE FUNCTION onix_check_category_level() RETURNS TRIGGER AS $fn$
DECLARE parent_level INT; parent_flow TEXT;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.level <> 1 THEN
      RAISE EXCEPTION 'Otasi yo''q kategoriya faqat 1-daraja (guruh) bo''lishi mumkin';
    END IF;
  ELSE
    SELECT level, flow INTO parent_level, parent_flow FROM onix_categories WHERE id = NEW.parent_id;
    IF parent_level IS NULL THEN
      RAISE EXCEPTION 'Ota kategoriya topilmadi: %', NEW.parent_id;
    END IF;
    IF NEW.level <> parent_level + 1 THEN
      RAISE EXCEPTION 'Daraja xato: ota % darajada, bola % darajada bo''lmaydi', parent_level, NEW.level;
    END IF;
    IF NEW.flow <> parent_flow THEN
      RAISE EXCEPTION 'Bola otasi bilan bir xil oqimda (income/expense) bo''lishi kerak';
    END IF;
  END IF;
  RETURN NEW;
END $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onix_categories_level_trg ON onix_categories;
CREATE TRIGGER onix_categories_level_trg
  BEFORE INSERT OR UPDATE ON onix_categories
  FOR EACH ROW EXECUTE FUNCTION onix_check_category_level();

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

-- Operatsiya daraxtning ENG PASTKI tuguniga (bargiga) yoziladi.
--   Uchinchi pog'ona bor bo'lsa — podkategoriyaga:  Onix › Xo'jalik › Salfetka
--   Yo'q bo'lsa — kategoriyaning o'ziga:            Yangiobod › Soliq
-- Guruhga (1-daraja) hech qachon yozilmaydi, va ostida bolasi bor
-- tugunga ham yozilmaydi — aks holda jami ikki marta hisoblanardi.
CREATE OR REPLACE FUNCTION onix_check_operation_category() RETURNS TRIGGER AS $fn$
DECLARE lvl INT; kids INT;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT level INTO lvl FROM onix_categories WHERE id = NEW.category_id;
    IF lvl IS NULL THEN
      RAISE EXCEPTION 'Kategoriya topilmadi: %', NEW.category_id;
    END IF;
    IF lvl = 1 THEN
      RAISE EXCEPTION 'Operatsiya guruhga yozilmaydi — kategoriya yoki podkategoriya tanlang';
    END IF;
    SELECT count(*) INTO kids FROM onix_categories
     WHERE parent_id = NEW.category_id AND active;
    IF kids > 0 THEN
      RAISE EXCEPTION 'Bu kategoriyada % ta podkategoriya bor — shulardan birini tanlang', kids;
    END IF;
  END IF;
  RETURN NEW;
END $fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onix_operations_category_trg ON onix_operations;
CREATE TRIGGER onix_operations_category_trg
  BEFORE INSERT OR UPDATE ON onix_operations
  FOR EACH ROW EXECUTE FUNCTION onix_check_operation_category();

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
-- Kategoriyalar sxemada emas, `onix/kategoriyalar.txt` faylida turadi.
-- Yuklash:  npm run onix:categories
-- Sabab: ro'yxatni tahrirlash uchun SQL bilmaslik kerak emas, va u
-- bitta joyda turadi — bazada ham, faylda ham nusxasi bo'lmaydi.
