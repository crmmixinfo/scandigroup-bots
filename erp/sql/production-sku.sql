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
-- Marshrut bu yerda NULL qoldiriladi — uni fayl oxiridagi UPDATE beradi,
-- chunki u allaqachon kiritilgan to'plamlarni ham tuzatishi kerak.
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, f.name,
       (SELECT id FROM product_groups WHERE code='MEH'),
       f.id, NULL, true
FROM (VALUES
  ('MEH-ALMAZ', 'ALMAZ'),
  ('MEH-9083', '9083'),
  ('MEH-LAURA', 'LAURA'),
  ('MEH-ZARA', 'ZARA'),
  ('MEH-MILANO', 'MILANO'),
  ('MEH-OWEN', 'OWEN'),
  ('MEH-SHEIKH', 'SHEIKH'),
  ('MEH-BAROCCO', 'BAROCCO'),
  ('MEH-ZERO', 'ZERO'),
  ('MEH-OREX', 'OREX')
) AS v(sku, fason)
JOIN fasons f ON f.code = v.fason
ON CONFLICT (sku) DO NOTHING;

-- ---------------------------------------------------------- YOTOQXONA TO'PLAMI
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, f.name,
       (SELECT id FROM product_groups WHERE code='YOT'),
       f.id, NULL, true
FROM (VALUES
  ('YOT-LAURA', 'LAURA'),
  ('YOT-MILANO', 'MILANO'),
  ('YOT-OWEN', 'OWEN'),
  ('YOT-VERSACI', 'VERSACI'),
  ('YOT-MONACO', 'MONACO')
) AS v(sku, fason)
JOIN fasons f ON f.code = v.fason
ON CONFLICT (sku) DO NOTHING;

-- ------------------------------------------------------------------- STOLLAR
-- Yakka mahsulot: marshrut bevosita biriktiriladi.
-- Boshlang'ich shablon — L1-FULL. Fason bo'yicha real marshrut
-- aniqlangach o'zgartiriladi (pastdagi izohga qarang).
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, f.name,
       (SELECT id FROM product_groups WHERE code='STL'),
       f.id,
       (SELECT id FROM route_templates WHERE code='L1-FULL'), false
FROM (VALUES
  ('STL-SAFIA', 'SAFIA'),
  ('STL-SULTAN', 'SULTAN'),
  ('STL-LAURA', 'LAURA'),
  ('STL-ELIZABETTA', 'ELIZABETTA'),
  ('STL-OWEN', 'OWEN'),
  ('STL-SHEIKH', 'SHEIKH'),
  ('STL-BAROCCO', 'BAROCCO')
) AS v(sku, fason)
JOIN fasons f ON f.code = v.fason
ON CONFLICT (sku) DO NOTHING;

-- ------------------------------------------------------------------- STULLAR
INSERT INTO products (sku, name, group_id, fason_id, route_template_id, is_set)
SELECT v.sku, f.name,
       (SELECT id FROM product_groups WHERE code='STU'),
       f.id,
       (SELECT id FROM route_templates WHERE code='L2-FULL'), false
FROM (VALUES
  ('STU-SAFIA', 'SAFIA'),
  ('STU-MILANO', 'MILANO'),
  ('STU-SULTAN', 'SULTAN'),
  ('STU-ELIZABETTA', 'ELIZABETTA'),
  ('STU-LAURA', 'LAURA'),
  ('STU-OWEN', 'OWEN'),
  ('STU-SHEIKH', 'SHEIKH'),
  ('STU-BAROCCO', 'BAROCCO'),
  ('STU-ONIX', 'ONIX'),
  ('STU-PALAZZO', 'PALAZZO')
) AS v(sku, fason)
JOIN fasons f ON f.code = v.fason
ON CONFLICT (sku) DO NOTHING;

-- ============================================================================
--  TO'PLAM BIR BUTUN BO'LIB LINIYADAN O'TADI
--
--  Konveyer raqami butun to'plamga qo'yiladi ("Milano · Mehmonxona to'plami — K26-0001"),
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
--  NOM — FASON, GURUH ALOHIDA
--
--  Avval to'plam nomiga guruh qo'shib yozilardi: "Milano PK", "Milano Sp".
--  Guruh jadvalda alohida ustun bo'lgani uchun bu takror edi — endi nom
--  faqat fason: "Milano · Mehmonxona to'plami".
--
--  Yuqoridagi INSERT'lar kabi bu ham seed'dan alohida: ON CONFLICT DO NOTHING
--  mavjud qatorlarni yangilamaydi.
--
--  Faqat eski ko'rinishdagi nomlar tegadi (" PK" yoki " Sp" bilan tugagan),
--  shuning uchun saytda qo'lda qo'yilgan nom qayta yozilmaydi. Bir marta
--  ishlagach mos qator qolmaydi — takroriy deploy'da bo'sh o'tadi.
UPDATE products p SET name = f.name
  FROM fasons f, product_groups g
 WHERE p.fason_id = f.id AND p.group_id = g.id
   AND g.code IN ('MEH', 'YOT')
   AND p.name ~ ' (PK|Sp)$';

-- ============================================================================
--  TO'PLAM TARKIBI — ixtiyoriy, keyingi bosqich uchun
--
--  Komplektlilik hisoboti (v_set_completeness) SHU MA'LUMOTSIZ ISHLAMAYDI.
--  Har to'plam qaysi pozitsiyalardan iborat ekani kiritilishi kerak, va har
--  pozitsiya alohida SKU sifatida ro'yxatga olinadi — chunki marshrutdan
--  aynan pozitsiyalar o'tadi, to'plam emas.
--
--  Misol — "Milano" mehmonxona to'plami vitrina + 2 tumba + TV stenddan
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
