-- ============================================================================
--  MIJOZLAR — BOSHLANG'ICH RO'YXAT (44 ta diler)
--
--  Manba: "MIJOZLAR RO'YHATI.xlsx", varaq "Dillerlar".
--  units.sql dan KEYIN ishga tushiriladi — customers jadvali o'sha yerda.
--
--  Qayta ishga tushirish xavfsiz: hamma yozuv ON CONFLICT DO NOTHING bilan.
--  DO NOTHING ataylab tanlangan — saytda qo'lda tuzatilgan mijoz ma'lumoti
--  keyingi deploy'da seed tomonidan qayta yozilib ketmasin.
-- ============================================================================

-- --------------------------------------------------------------------- KANAL
-- Ro'yxatdagi "Kanal" ustuni mijoz TURINI bildiradi (B2B / B2C / Eksport),
-- reklama kanalini emas. Mavjud kodlar (Instagram, Telegram, ...) mijoz
-- qayerdan kelganini yozadi; bular esa u bilan qanday ishlanishini.
-- Ikkalasi bir ustunda tursa v_channel_sales aralash hisobot beradi —
-- segment alohida ustunga ajratilsa, shu yerdan ko'chiriladi.
INSERT INTO customer_channels (code, name, sort) VALUES
  ('B2B',    'B2B — diler / do''kon', 10),
  ('B2C',    'B2C — chakana',         11),
  ('EXPORT', 'Eksport',               12)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------- SAVDO MENEJERI
-- Mijozlar shu ikki xodimga biriktirilgan. PIN — saytga kirish uchun,
-- birinchi kirishdan keyin o'zgartirilishi kerak.
INSERT INTO workers (name, pin) VALUES
  ('Pulatov Soyibjon',    '7001'),
  ('Jomonqulov Shamshod', '7002')
ON CONFLICT (pin) DO NOTHING;

INSERT INTO worker_roles (worker_id, role_code, scope_shop_id) VALUES
  ((SELECT id FROM workers WHERE pin = '7001'), 'sotuvchi', NULL),
  ((SELECT id FROM workers WHERE pin = '7002'), 'sotuvchi', NULL)
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------- MIJOZ
-- Telefon raqamlar manbadagi ko'rinishida saqlangan: ro'yxatda ular
-- har xil formatda (ba'zisi mamlakat kodi bilan, ba'zisi kodsiz), va
-- qaysi raqam qaysi davlatniki ekanini taxmin qilish xato tug'diradi.
INSERT INTO customers (name, country, region, phone, channel, manager_id) VALUES
  ('Qozog''iston Aliya', 'Qozoqiston', 'Taraz', '7702-915-14-53', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Qirg''iziston Abbos', 'Qirg''iziston', 'Osh', '996-55-757-57-72', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Namoz', 'Tojikiston', 'Toshkent', '93-594-81-70', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Tojikon mebel', 'Tojikiston', 'Dushanbe', '992-98-951-90-09', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Qozog''iston Chinara', 'Qozoqiston', 'Almata', '7701-731-32-32', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Qozog''iston Dinara', 'Qozoqiston', 'Shimkent', '7775-242-42-14', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Asatullo osh', 'Qirg''iziston', 'Osh', '996-55-708-08-00', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Azarbayjan Elnur', 'Azarbayjon', 'Qoba', '994-50-304-11-14', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Noiljon', 'Tojikiston', 'Dushanbe', '992-98-888-37-86', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Qozog''iston Adilbek', 'Qozoqiston', 'Karaganda', '7702-888-32-96', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Bobojon', 'Tojikiston', 'Xojand', '992-92-660-70-78', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Nazir', 'Tojikiston', 'Dushanbe', '992-00-888-38-52', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Deluxe', 'Tojikiston', 'Xojand', '992-99-000-77-71', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Qozog''iston Axror', 'Qozoqiston', 'Toshkent', '90-927-27-08', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Tojikiston Valijon', 'Tojikiston', 'Istaravshan', '992-90-888-88-99', 'EXPORT',
   (SELECT id FROM workers WHERE pin = '7002')),
  ('Samarqand Farxod', 'O''zbekiston', 'Samarqand', '90-605-95-55', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Andijon Azizbek', 'O''zbekiston', 'Andijon', '93-250-19-19', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Xorazm Xayitboy', 'O''zbekiston', 'Xorazm', '77-795-02-03', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Samarqand Faridun', 'O''zbekiston', 'Samarqand', '91-535-55-55', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Buxoro Shamshod', 'O''zbekiston', 'Buxoro', '91-646-88-84', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Buxoro Nasiba', 'O''zbekiston', 'Buxoro', '93-682-22-11', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Buxoro Otabek', 'O''zbekiston', 'Buxoro', '91-404-99-66', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Nukus Salavat', 'O''zbekiston', 'Nukus', '77-386-11-11', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Qarshi Husan', 'O''zbekiston', 'Qarshi', '50-033-11-00', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Jizzax Begzod', 'O''zbekiston', 'Jizzax', '90-229-02-04', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Buxoro Bexruz', 'O''zbekiston', 'Buxoro', '99-736-21-51', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Qo''qon Baxrom', 'O''zbekiston', 'Qoqon', '91-740-76-00', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Farg''ona Temur', 'O''zbekiston', 'Fargona', '93-972-45-45', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Andijon Zafar', 'O''zbekiston', 'Andijon', '98-270-77-78', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Izzat Hadra', 'O''zbekiston', 'Toshkent', '97-760-59-19', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Andijon Azizbek O''Imasov', 'O''zbekiston', 'Andijon', '99-524-7-77', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Sirdaryo Rano', 'O''zbekiston', 'Sirdaryo', '90-107-00-66', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Xorazm Otabek', 'O''zbekiston', 'Xorazm', '91-431-77-03', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Xorazm Navruz', 'O''zbekiston', 'Xorazm', '90-713-88-88', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Namangan Dilmurod', 'O''zbekiston', 'Namangan', '99-750-57-57', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Andijon Fayzullo', 'O''zbekiston', 'Andijon', '91-170-79-97', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Xorazm Dilmurod', 'O''zbekiston', 'Xorazm', '93-746-00-03', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Termiz Jonibek', 'O''zbekiston', 'Termiz', '93-793-02-02', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Termiz Otabek', 'O''zbekiston', 'Termiz', '91-230-02-20', 'B2B',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('SMM marketing', 'O''zbekiston', 'Toshkent', '55-520-95-95', 'B2C',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Zelta Abu Saxiy', 'O''zbekiston', 'Toshkent', '99-155-40-40', 'B2C',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Zelta Palma', 'O''zbekiston', 'Toshkent', '99-996-40-40', 'B2C',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('Zelta Arca', 'O''zbekiston', 'Toshkent', '97-155-40-40', 'B2C',
   (SELECT id FROM workers WHERE pin = '7001')),
  ('BY-KL', 'O''zbekiston', 'Toshkent', '98-177-40-40', 'B2C',
   (SELECT id FROM workers WHERE pin = '7001'))
ON CONFLICT (lower(name)) DO NOTHING;
