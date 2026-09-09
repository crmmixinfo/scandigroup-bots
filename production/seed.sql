-- ============================================================================
--  SPRAVOCHNIK: TSEXLAR VA BO'LIMLAR
--
--  Tsexlar:  Korpus · Bo'yoqlash (umumiy) · Qadoqlash · Stul
--  Bo'yoqlash tsexi UMUMIY: korpus mebel ham, stul ham shu yerda bo'yaladi.
-- ============================================================================

INSERT INTO lines (code, name, sort) VALUES
  ('L1', 'Korpus mebel (mehmonxona, yotoqxona, stol)', 1),
  ('L2', 'Stul', 2)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------- TSEX
INSERT INTO shops (line_id, code, name, kind, is_shared, sort, track_sections) VALUES
  ((SELECT id FROM lines WHERE code='L1'), 'KORPUS', 'Korpus tsexi',    'flow',  false, 1, false),
  (NULL,                                   'BOYOQ',  'Bo''yoqlash tsexi (umumiy)', 'batch', true, 2, false),
  ((SELECT id FROM lines WHERE code='L1'), 'QADOQ',  'Qadoqlash tsexi', 'flow',  false, 3, false),
  ((SELECT id FROM lines WHERE code='L2'), 'STUL',   'Stul tsexi',      'flow',  false, 4, false)
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------- BO'LIM

-- KORPUS TSEXI (8 bo'lim)
INSERT INTO sections (shop_id, code, name, sort) VALUES
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-ARRA',  'Arra',     1),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-ROVER', 'Rover',    2),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-PRESS', 'Press',    3),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-FREZA', 'Freza',    4),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-ZBOR',  'Zborka',   5),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-SHKUR', 'Shkurka',  6),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-KROMK', 'Kromka',   7),
  ((SELECT id FROM shops WHERE code='KORPUS'), 'KOR-PRIS',  'Prisadka', 8)
ON CONFLICT (code) DO NOTHING;

-- ★ BO'YOQLASH TSEXI — UMUMIY, bitta to'plam bo'lim.
--   Stul Aboy va Palirovkaga kirmaydi — bu marshrut shablonida hal qilinadi,
--   bo'limlarni takrorlash SHART EMAS.
INSERT INTO sections (shop_id, code, name, sort) VALUES
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-AST1',  'Astar sepish 1', 1),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-ASTSH', 'Astar shkurka',  2),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-AST2',  'Astar sepish 2', 3),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-ABOY',  'Aboy',           4),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-GRUNT', 'Grunt sepish',   5),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-GRSH',  'Grunt shkurka',  6),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-RANG',  'Rang sepish',    7),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-LAK',   'Lak',            8),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'BOY-PALIR', 'Palirovka',      9)
ON CONFLICT (code) DO NOTHING;

-- QADOQLASH TSEXI (korpus mebel)
INSERT INTO sections (shop_id, code, name, sort, is_exit) VALUES
  ((SELECT id FROM shops WHERE code='QADOQ'), 'QAD-OYNA', 'Oyna qo''yish',      1, false),
  ((SELECT id FROM shops WHERE code='QADOQ'), 'QAD-QAD',  'Qadoqlash',          2, false),
  ((SELECT id FROM shops WHERE code='QADOQ'), 'QAD-OMB',  'Omborga topshirish', 3, true)
ON CONFLICT (code) DO NOTHING;

-- STUL TSEXI. Marshrut: Rover→Zborka→Shkurka → BO'YOQLASH TSEXI → Qoplash→Qadoqlash,
-- ya'ni oqim bo'yoqlashdan keyin shu tsexga QAYTADI. Marshrut tartibi
-- route_steps'da yozilgani uchun bu muammo tug'dirmaydi.
INSERT INTO sections (shop_id, code, name, sort) VALUES
  ((SELECT id FROM shops WHERE code='STUL'), 'STU-ROVER', 'Rover',   1),
  ((SELECT id FROM shops WHERE code='STUL'), 'STU-ZBOR',  'Zborka',  2),
  ((SELECT id FROM shops WHERE code='STUL'), 'STU-SHKUR', 'Shkurka', 3),
  ((SELECT id FROM shops WHERE code='STUL'), 'STU-QOPL',  'Qoplash', 4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO sections (shop_id, code, name, sort, is_exit) VALUES
  ((SELECT id FROM shops WHERE code='STUL'), 'STU-QAD', 'Qadoqlash', 5, true)
ON CONFLICT (code) DO NOTHING;

-- KAMERALAR — sig'im (capacity_qty) va sikl (cycle_min) aniqlangach to'ldiriladi
INSERT INTO chambers (shop_id, code, name) VALUES
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'KAM-1', 'Kamera 1'),
  ((SELECT id FROM shops WHERE code='BOYOQ'), 'KAM-2', 'Kamera 2')
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------- MAHSULOT GURUHI
INSERT INTO product_groups (code, name, line_id) VALUES
  ('MEH', 'Mehmonxona to''plami', (SELECT id FROM lines WHERE code='L1')),
  ('YOT', 'Yotoqxona to''plami',  (SELECT id FROM lines WHERE code='L1')),
  ('STL', 'Stol',                 (SELECT id FROM lines WHERE code='L1')),
  ('STU', 'Stul',                 (SELECT id FROM lines WHERE code='L2'))
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------- MARSHRUT SHABLONLARI

-- Yordamchi: shablonga bo'limlarni tartib bilan qo'shadi.
-- Yangi fason varianti = shu funksiyaga bitta chaqiruv, kod o'zgarmaydi.
CREATE OR REPLACE FUNCTION add_route(p_template TEXT, p_sections TEXT[])
RETURNS void LANGUAGE sql AS $$
  INSERT INTO route_steps (template_id, section_id, sort)
  SELECT (SELECT id FROM route_templates WHERE code = p_template), s.id, u.ord
  FROM unnest(p_sections) WITH ORDINALITY AS u(code, ord)
  JOIN sections s ON s.code = u.code
  ON CONFLICT DO NOTHING;
$$;

INSERT INTO route_templates (line_id, code, name) VALUES
  ((SELECT id FROM lines WHERE code='L1'), 'L1-FULL',   'Korpus mebel · to''liq'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-NOPAL',  'Korpus mebel · palirovkasiz'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-NOGLAS', 'Korpus mebel · oynasiz'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-BASE',   'Korpus mebel · sodda (aboy/palirovka/oynasiz)'),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-FULL',   'Stul · to''liq (qoplashli)'),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-NOQOP',  'Stul · qoplashsiz')
ON CONFLICT (code) DO NOTHING;

-- Korpus mebel: KORPUS tsexi → UMUMIY BO'YOQLASH → QADOQLASH tsexi
SELECT add_route('L1-FULL', ARRAY[
  'KOR-ARRA','KOR-ROVER','KOR-PRESS','KOR-FREZA','KOR-ZBOR','KOR-SHKUR','KOR-KROMK','KOR-PRIS',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-ABOY','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK','BOY-PALIR',
  'QAD-OYNA','QAD-QAD','QAD-OMB']);

SELECT add_route('L1-NOPAL', ARRAY[
  'KOR-ARRA','KOR-ROVER','KOR-PRESS','KOR-FREZA','KOR-ZBOR','KOR-SHKUR','KOR-KROMK','KOR-PRIS',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-ABOY','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK',
  'QAD-OYNA','QAD-QAD','QAD-OMB']);

SELECT add_route('L1-NOGLAS', ARRAY[
  'KOR-ARRA','KOR-ROVER','KOR-PRESS','KOR-FREZA','KOR-ZBOR','KOR-SHKUR','KOR-KROMK','KOR-PRIS',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-ABOY','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK','BOY-PALIR',
  'QAD-QAD','QAD-OMB']);

SELECT add_route('L1-BASE', ARRAY[
  'KOR-ARRA','KOR-ROVER','KOR-PRESS','KOR-FREZA','KOR-ZBOR','KOR-SHKUR','KOR-KROMK','KOR-PRIS',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK',
  'QAD-QAD','QAD-OMB']);

-- Stul: STUL tsexi → UMUMIY BO'YOQLASH (Aboy/Palirovkasiz) → STUL tsexiga qaytadi
SELECT add_route('L2-FULL', ARRAY[
  'STU-ROVER','STU-ZBOR','STU-SHKUR',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK',
  'STU-QOPL','STU-QAD']);

SELECT add_route('L2-NOQOP', ARRAY[
  'STU-ROVER','STU-ZBOR','STU-SHKUR',
  'BOY-AST1','BOY-ASTSH','BOY-AST2','BOY-GRUNT','BOY-GRSH','BOY-RANG','BOY-LAK',
  'STU-QAD']);

-- ----------------------------------------------------------- BRAK SABABLARI
-- 8-12 tadan oshirmang: uzun ro'yxatdan operator birinchi qatorni tanlaydi.
INSERT INTO defect_reasons (code, name, sort) VALUES
  ('OLCHAM',  'O''lcham xato',                1),
  ('MATER',   'Material nuqsoni (LDSP/MDF)',  2),
  ('KROMKA',  'Kromka ko''chgan / notekis',   3),
  ('FREZA',   'Freza / prisadka xatosi',      4),
  ('YIGISH',  'Yig''ish xatosi',              5),
  ('SHKURKA', 'Shkurka sifatsiz',             6),
  ('SEPISH',  'Sepish nuqsoni (oqish/dog'')', 7),
  ('RANG',    'Rang mos emas',                8),
  ('LAK',     'Lak nuqsoni',                  9),
  ('XARASH',  'Xarash / transport shikasti', 10),
  ('OYNA',    'Oyna singan / o''lchamsiz',   11),
  ('QOPLASH', 'Qoplash nuqsoni (mato/teri)', 12),
  ('BOSHQA',  'Boshqa',                      99)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------- PROSTOY SABABLARI
INSERT INTO downtime_reasons (code, name, sort) VALUES
  ('MATER',  'Material yo''q',             1),
  ('YARIM',  'Yarim tayyor kelmadi',       2),
  ('STANOK', 'Stanok buzildi',             3),
  ('NALAD',  'Perenaladka / sozlash',      4),
  ('ELEKTR', 'Elektr / kompressor',        5),
  ('XODIM',  'Xodim yo''q',                6),
  ('QURISH', 'Quritishni kutish',          7),
  ('KAMERA', 'Kamera band (navbat)',       8),
  ('TANAF',  'Tanaffus / smena almashuvi', 9),
  ('BOSHQA', 'Boshqa',                    99)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------- TEST XODIMLARI
INSERT INTO workers (name, pin, role, shop_id) VALUES
  ('Admin',            '0000', 'admin',  NULL),
  ('Korpus ustasi',    '1111', 'master', (SELECT id FROM shops WHERE code='KORPUS')),
  ('Bo''yoq ustasi',   '2222', 'master', (SELECT id FROM shops WHERE code='BOYOQ')),
  ('Qadoqlash ustasi', '3333', 'master', (SELECT id FROM shops WHERE code='QADOQ')),
  ('Stul ustasi',      '4444', 'master', (SELECT id FROM shops WHERE code='STUL'))
ON CONFLICT (pin) DO NOTHING;
