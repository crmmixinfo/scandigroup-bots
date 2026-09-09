-- ============================================================================
--  MAHSULOT KATALOGI: fason va SKU
--  schema.sql va seed.sql dan KEYIN ishga tushiriladi.
--
--  17 fason × 4 guruh. Bir fason bir nechta guruhda uchraydi
--  (Laura → mehmonxona, yotoqxona, stol, stul) — shuning uchun fason
--  alohida spravochnik, SKU esa "fason + guruh".
-- ============================================================================

INSERT INTO fasons (code, name) VALUES
  ('ALMAZ','Almaz'), ('9083','9083'), ('LAURA','Laura'), ('ZARA','Zara'),
  ('MILANO','Milano'), ('OWEN','Owen'), ('SHEIKH','Sheikh'), ('BAROCCO','Barocco'),
  ('ZERO','Zero'), ('OREX','Orex'), ('VERSACI','Versaci'), ('MONACO','Monaco'),
  ('SAFIA','Safia'), ('SULTAN','Sultan'), ('ELIZABETTA','Elizabetta'),
  ('ONIX','Onix'), ('PALAZZO','Palazzo')
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------------- MEHMONXONA TO'PLAMI
-- To'plam — sotiladigan birlik, marshruti YO'Q (route_template_id NULL).
-- Marshrutdan tarkibidagi pozitsiyalar o'tadi, to'plamning o'zi emas.
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, v.name,
       (SELECT id FROM product_groups WHERE code='MEH'),
       (SELECT id FROM fasons WHERE code = v.fason), NULL, true
FROM (VALUES
  ('MEH-ALMAZ',   'Almaz PK',   'ALMAZ'),
  ('MEH-9083',    '9083 PK',    '9083'),
  ('MEH-LAURA',   'Laura PK',   'LAURA'),
  ('MEH-ZARA',    'Zara PK',    'ZARA'),
  ('MEH-MILANO',  'Milano PK',  'MILANO'),
  ('MEH-OWEN',    'Owen PK',    'OWEN'),
  ('MEH-SHEIKH',  'Sheikh PK',  'SHEIKH'),
  ('MEH-BAROCCO', 'Baracco PK', 'BAROCCO'),
  ('MEH-ZERO',    'Zero PK',    'ZERO'),
  ('MEH-OREX',    'Orex PK',    'OREX')
) AS v(sku, name, fason)
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------- YOTOQXONA TO'PLAMI
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, v.name,
       (SELECT id FROM product_groups WHERE code='YOT'),
       (SELECT id FROM fasons WHERE code = v.fason), NULL, true
FROM (VALUES
  ('YOT-LAURA',   'Laura Sp',   'LAURA'),
  ('YOT-MILANO',  'Milano Sp',  'MILANO'),
  ('YOT-OWEN',    'Owen Sp',    'OWEN'),
  ('YOT-VERSACI', 'Versaci Sp', 'VERSACI'),
  ('YOT-MONACO',  'Monaco Sp',  'MONACO')
) AS v(sku, name, fason)
ON CONFLICT (sku) DO NOTHING;

-- ------------------------------------------------------------------- STOLLAR
-- Yakka mahsulot: marshrut bevosita biriktiriladi.
-- Boshlang'ich shablon — L1-FULL. Fason bo'yicha real marshrut
-- aniqlangach o'zgartiriladi (pastdagi izohga qarang).
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, v.name,
       (SELECT id FROM product_groups WHERE code='STL'),
       (SELECT id FROM fasons WHERE code = v.fason),
       (SELECT id FROM route_templates WHERE code='L1-FULL'), false
FROM (VALUES
  ('STL-SAFIA',      'Safia',      'SAFIA'),
  ('STL-SULTAN',     'Sultan',     'SULTAN'),
  ('STL-LAURA',      'Laura',      'LAURA'),
  ('STL-ELIZABETTA', 'Elizabetta', 'ELIZABETTA'),
  ('STL-OWEN',       'Owen',       'OWEN'),
  ('STL-SHEIKH',     'Sheikh',     'SHEIKH'),
  ('STL-BAROCCO',    'Barocco',    'BAROCCO')
) AS v(sku, name, fason)
ON CONFLICT (sku) DO NOTHING;

-- ------------------------------------------------------------------- STULLAR
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, v.name,
       (SELECT id FROM product_groups WHERE code='STU'),
       (SELECT id FROM fasons WHERE code = v.fason),
       (SELECT id FROM route_templates WHERE code='L2-FULL'), false
FROM (VALUES
  ('STU-SAFIA',      'Safia',      'SAFIA'),
  ('STU-MILANO',     'Milano',     'MILANO'),
  ('STU-SULTAN',     'Sultan',     'SULTAN'),
  ('STU-ELIZABETTA', 'Elizabetta', 'ELIZABETTA'),
  ('STU-LAURA',      'Laura',      'LAURA'),
  ('STU-OWEN',       'Owen',       'OWEN'),
  ('STU-SHEIKH',     'Sheikh',     'SHEIKH'),
  ('STU-BAROCCO',    'Barocco',    'BAROCCO'),
  ('STU-ONIX',       'Onix',       'ONIX'),
  ('STU-PALAZZO',    'Palazzo',    'PALAZZO')
) AS v(sku, name, fason)
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
--  TO'PLAM BIR BUTUN BO'LIB LINIYADAN O'TADI
--
--  Konveyer raqami butun to'plamga qo'yiladi ("Milano PK — K-2026-0001"),
--  alohida pozitsiyalarga emas. Shuning uchun to'plamning o'zi marshrutga
--  ega bo'lishi kerak.
--
--  Bu UPDATE seed'dan alohida turadi: yuqoridagi INSERT'lar
--  ON CONFLICT DO NOTHING bilan yozilgan, ya'ni mavjud qatorlarni
--  yangilamaydi. Migratsiya har deploy'da qayta ishlagani uchun
--  bu qator allaqachon kiritilgan to'plamlarni ham tuzatadi.
UPDATE products SET route_template_id =
         (SELECT id FROM route_templates WHERE code = 'L1-FULL')
 WHERE is_set AND route_template_id IS NULL;

-- ============================================================================
--  TO'PLAM TARKIBI — ixtiyoriy, keyingi bosqich uchun
--
--  Komplektlilik hisoboti (v_set_completeness) SHU MA'LUMOTSIZ ISHLAMAYDI.
--  Har to'plam qaysi pozitsiyalardan iborat ekani kiritilishi kerak, va har
--  pozitsiya alohida SKU sifatida ro'yxatga olinadi — chunki marshrutdan
--  aynan pozitsiyalar o'tadi, to'plam emas.
--
--  Misol — "Milano PK" mehmonxona to'plami vitrina + 2 tumba + TV stenddan
--  iborat bo'lsa:
--
--    INSERT INTO products (sku, name, group_id, fason_id, route_template_id) VALUES
--      ('MEH-MILANO-VIT','Milano vitrina',   (SELECT id FROM product_groups WHERE code='MEH'),
--        (SELECT id FROM fasons WHERE code='MILANO'),(SELECT id FROM route_templates WHERE code='L1-FULL')),
--      ('MEH-MILANO-TUM','Milano tumba',     (SELECT id FROM product_groups WHERE code='MEH'),
--        (SELECT id FROM fasons WHERE code='MILANO'),(SELECT id FROM route_templates WHERE code='L1-NOGLAS')),
--      ('MEH-MILANO-TV', 'Milano TV stend',  (SELECT id FROM product_groups WHERE code='MEH'),
--        (SELECT id FROM fasons WHERE code='MILANO'),(SELECT id FROM route_templates WHERE code='L1-BASE'));
--
--    INSERT INTO set_items (set_product_id, item_product_id, qty) VALUES
--      ((SELECT id FROM products WHERE sku='MEH-MILANO'),(SELECT id FROM products WHERE sku='MEH-MILANO-VIT'),1),
--      ((SELECT id FROM products WHERE sku='MEH-MILANO'),(SELECT id FROM products WHERE sku='MEH-MILANO-TUM'),2),
--      ((SELECT id FROM products WHERE sku='MEH-MILANO'),(SELECT id FROM products WHERE sku='MEH-MILANO-TV'),1);
--
--  E'TIBOR: hozir barcha stol va stullarga L1-FULL / L2-FULL shabloni
--  biriktirilgan. Qaysi fason qaysi bo'limga kirmasligi aniqlangach,
--  ikki yo'ldan biri tanlanadi:
--    1) Boshqa shablon:  UPDATE products SET route_template_id =
--         (SELECT id FROM route_templates WHERE code='L1-NOPAL') WHERE sku='STL-SAFIA';
--    2) Bitta-ikkita bo'lim farq qilsa — istisno:
--         INSERT INTO product_route_skip (product_id, section_id, note) VALUES
--           ((SELECT id FROM products WHERE sku='STL-SAFIA'),
--            (SELECT id FROM sections WHERE code='BOY-ABOY'), 'Aboysiz fason');
-- ============================================================================
