-- ============================================================================
--  SPRAVOCHNIKLAR — real struktura asosida
--  Ishga tushirishdan oldin to'ldiriladi. Fason va SKU'lar keyin qo'shiladi.
-- ============================================================================

INSERT INTO lines (code, name, sort) VALUES
  ('L1', 'Liniya-1 · Korpus mebel (mehmonxona, yotoqxona, stol)', 1),
  ('L2', 'Liniya-2 · Stul', 2)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------ BO'LIMLAR
-- track_stations = false → 1-fazada faqat bo'lim chegarasi o'lchanadi.
-- Bottleneck aniqlangach, o'sha bo'limda true qilinadi.
INSERT INTO departments (line_id, code, name, kind, sort, track_stations) VALUES
  ((SELECT id FROM lines WHERE code='L1'), 'L1-KOR', 'Korpus',     'flow',  1, false),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-BOY', 'Bo''yoqlash','batch', 2, false),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-QAD', 'Qadoqlash',  'flow',  3, false),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-KOR', 'Korpus',     'flow',  1, false),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-BOY', 'Bo''yoqlash','batch', 2, false),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-QAD', 'Qadoqlash',  'flow',  3, false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- UCHASTKALAR

-- LINIYA-1 · KORPUS (8)
INSERT INTO stations (department_id, code, name, sort) VALUES
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-ARRA',  'Arra',      1),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-ROVER', 'Rover',     2),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-PRESS', 'Press',     3),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-FREZA', 'Freza',     4),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-ZBOR',  'Zborka',    5),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-SHKUR', 'Shkurka',   6),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-KROMK', 'Kromka',    7),
  ((SELECT id FROM departments WHERE code='L1-KOR'), 'L1-K-PRIS',  'Prisadka',  8)
ON CONFLICT (code) DO NOTHING;

-- LINIYA-1 · BO'YOQLASH (9)
INSERT INTO stations (department_id, code, name, sort) VALUES
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-AST1',  'Astar sepish 1', 1),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-ASTSH', 'Astar shkurka',  2),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-AST2',  'Astar sepish 2', 3),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-ABOY',  'Aboy',           4),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-GRUNT', 'Grunt sepish',   5),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-GRSH',  'Grunt shkurka',  6),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-RANG',  'Rang sepish',    7),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-LAK',   'Lak',            8),
  ((SELECT id FROM departments WHERE code='L1-BOY'), 'L1-B-PALIR', 'Palirovka',      9)
ON CONFLICT (code) DO NOTHING;

-- LINIYA-1 · QADOQLASH (3)
INSERT INTO stations (department_id, code, name, sort, is_exit) VALUES
  ((SELECT id FROM departments WHERE code='L1-QAD'), 'L1-Q-OYNA', 'Oyna qo''yish',              1, false),
  ((SELECT id FROM departments WHERE code='L1-QAD'), 'L1-Q-QAD',  'Qadoqlash',                  2, false),
  ((SELECT id FROM departments WHERE code='L1-QAD'), 'L1-Q-OMB',  'Omborga topshirish',         3, true)
ON CONFLICT (code) DO NOTHING;

-- LINIYA-2 · STUL
INSERT INTO stations (department_id, code, name, sort) VALUES
  ((SELECT id FROM departments WHERE code='L2-KOR'), 'L2-K-ROVER', 'Rover',          1),
  ((SELECT id FROM departments WHERE code='L2-KOR'), 'L2-K-ZBOR',  'Zborka',         2),
  ((SELECT id FROM departments WHERE code='L2-KOR'), 'L2-K-SHKUR', 'Shkurka',        3),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-AST1',  'Astar sepish 1', 4),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-ASTSH', 'Astar shkurka',  5),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-AST2',  'Astar sepish 2', 6),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-GRUNT', 'Grunt sepish',   7),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-GRSH',  'Grunt shkurka',  8),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-RANG',  'Rang',           9),
  ((SELECT id FROM departments WHERE code='L2-BOY'), 'L2-B-LAK',   'Lak',           10),
  ((SELECT id FROM departments WHERE code='L2-QAD'), 'L2-Q-QOPL',  'Qoplash',       11)
ON CONFLICT (code) DO NOTHING;

INSERT INTO stations (department_id, code, name, sort, is_exit) VALUES
  ((SELECT id FROM departments WHERE code='L2-QAD'), 'L2-Q-QAD', 'Qadoqlash', 12, true)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------- MAHSULOT GURUHI
INSERT INTO product_groups (code, name, line_id) VALUES
  ('MEH', 'Mehmonxona to''plami', (SELECT id FROM lines WHERE code='L1')),
  ('YOT', 'Yotoqxona to''plami',  (SELECT id FROM lines WHERE code='L1')),
  ('STL', 'Stol',                 (SELECT id FROM lines WHERE code='L1')),
  ('STU', 'Stul',                 (SELECT id FROM lines WHERE code='L2'))
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------- MARSHRUT SHABLONLARI
-- Boshlang'ich to'plam. Real fasonlar kelganda kengaytiriladi —
-- har yangi variant uchun yangi shablon, product_route_skip esa faqat
-- bitta-ikkita uchastka farq qilganda ishlatiladi.
INSERT INTO route_templates (line_id, code, name) VALUES
  ((SELECT id FROM lines WHERE code='L1'), 'L1-FULL',   'L1 · To''liq (barcha uchastka)'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-NOPAL',  'L1 · Palirovkasiz'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-NOGLAS', 'L1 · Oynasiz'),
  ((SELECT id FROM lines WHERE code='L1'), 'L1-BASE',   'L1 · Sodda (Aboy/Palirovka/Oynasiz)'),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-FULL',   'L2 · To''liq'),
  ((SELECT id FROM lines WHERE code='L2'), 'L2-NOQOP',  'L2 · Qoplashsiz')
ON CONFLICT (code) DO NOTHING;

-- Shablon qadamlari — liniya tartibida, istisno qilingan uchastkalardan tashqari
INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L1-FULL'
ON CONFLICT DO NOTHING;

INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L1-NOPAL' AND st.code <> 'L1-B-PALIR'
ON CONFLICT DO NOTHING;

INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L1-NOGLAS' AND st.code <> 'L1-Q-OYNA'
ON CONFLICT DO NOTHING;

INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L1-BASE'
  AND st.code NOT IN ('L1-B-ABOY', 'L1-B-PALIR', 'L1-Q-OYNA')
ON CONFLICT DO NOTHING;

INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L2-FULL'
ON CONFLICT DO NOTHING;

INSERT INTO route_steps (template_id, station_id, sort)
SELECT t.id, st.id, ROW_NUMBER() OVER (ORDER BY d.sort, st.sort)
FROM route_templates t
JOIN lines l       ON l.id = t.line_id
JOIN departments d ON d.line_id = l.id
JOIN stations st   ON st.department_id = d.id
WHERE t.code = 'L2-NOQOP' AND st.code <> 'L2-Q-QOPL'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------- BRAK SABABLARI
-- 8-12 tadan oshirmang: uzun ro'yxatdan operator birinchi qatorni tanlaydi.
INSERT INTO defect_reasons (code, name, sort) VALUES
  ('OLCHAM',  'O''lcham xato',              1),
  ('MATER',   'Material nuqsoni (ЛДСП/MDF)',2),
  ('KROMKA',  'Kromka ko''chgan / notekis', 3),
  ('FREZA',   'Freza / prisadka xatosi',    4),
  ('YIGISH',  'Yig''ish xatosi',            5),
  ('SHKURKA', 'Shkurka sifatsiz',           6),
  ('SEPISH',  'Sepish nuqsoni (oqish/dog'')',7),
  ('RANG',    'Rang mos emas',              8),
  ('LAK',     'Lak nuqsoni',                9),
  ('XARASH',  'Xarash / transport shikasti',10),
  ('OYNA',    'Oyna singan / o''lchamsiz',  11),
  ('BOSHQA',  'Boshqa',                     99)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------- PROSTOY SABABLARI
INSERT INTO downtime_reasons (code, name, sort) VALUES
  ('MATER',  'Material yo''q',            1),
  ('YARIM',  'Yarim tayyor kelmadi',      2),
  ('STANOK', 'Stanok buzildi',            3),
  ('NALAD',  'Perenaladka / sozlash',     4),
  ('ELEKTR', 'Elektr / kompressor',       5),
  ('XODIM',  'Xodim yo''q',               6),
  ('QURISH', 'Quritishni kutish',         7),
  ('TANAF',  'Tanaffus / smena almashuvi',8),
  ('BOSHQA', 'Boshqa',                    99)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------- TEST XODIMLARI
INSERT INTO workers (name, pin, role, department_id) VALUES
  ('Admin',           '0000', 'admin', NULL),
  ('Korpus ustasi',   '1111', 'master', (SELECT id FROM departments WHERE code='L1-KOR')),
  ('Bo''yoq ustasi',  '2222', 'master', (SELECT id FROM departments WHERE code='L1-BOY')),
  ('Qadoqlash ustasi','3333', 'master', (SELECT id FROM departments WHERE code='L1-QAD')),
  ('Stul ustasi',     '4444', 'master', (SELECT id FROM departments WHERE code='L2-KOR'))
ON CONFLICT (pin) DO NOTHING;
