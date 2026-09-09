-- ============================================================================
--  KATALOG — mahsulot nomlari va guruhlari saytdan boshqariladi
--
--  Katalog kodda emas, bazada turishi kerak: zavod yangi fason chiqarganda
--  yoki guruhni boshqacha ataganda dasturchi kutib o'tirilmaydi. Seed'dagi
--  17 fason va 4 guruh — boshlang'ich taklif, sayt orqali o'zgartiriladi.
--
--  O'chirish emas, FAOLSIZLANTIRISH: kiritilgan birlik o'z mahsulotiga
--  bog'liq, uni o'chirish jurnal tarixini buzadi. Faolsizlantirilgan yozuv
--  yangi kiritishda ro'yxatda ko'rinmaydi, eskisi joyida qoladi.
-- ============================================================================

ALTER TABLE product_groups ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_groups ADD COLUMN IF NOT EXISTS sort   INT     NOT NULL DEFAULT 0;
-- To'plammi yoki yakka mahsulotmi. To'plam bitta konveyer raqami bilan
-- bir butun bo'lib liniyadan o'tadi.
ALTER TABLE product_groups ADD COLUMN IF NOT EXISTS is_set BOOLEAN NOT NULL DEFAULT false;
-- Guruhning odatdagi marshruti. Yangi mahsulot shu bilan yaratiladi,
-- keyin alohida o'zgartirilishi mumkin.
ALTER TABLE product_groups ADD COLUMN IF NOT EXISTS route_template_id INT
  REFERENCES route_templates(id);

ALTER TABLE fasons ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0;

-- Seed'dagi guruhlarning turini bir marta belgilaymiz. Saytdan
-- o'zgartirilgan bo'lsa tegilmaydi — shuning uchun sharti bor.
UPDATE product_groups SET is_set = true
 WHERE code IN ('MEH','YOT') AND is_set = false
   AND NOT EXISTS (SELECT 1 FROM products p
                    WHERE p.group_id = product_groups.id AND p.is_set = false);

-- Guruhning odatdagi marshruti seed'dagi mahsulotlardan olinadi: guruhda
-- qaysi marshrut ko'p ishlatilgan bo'lsa, o'sha guruhning odatdagisi.
UPDATE product_groups g SET route_template_id = t.rt
  FROM (SELECT group_id, route_template_id AS rt,
               ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY COUNT(*) DESC) AS rn
          FROM products WHERE route_template_id IS NOT NULL
         GROUP BY group_id, route_template_id) t
 WHERE t.group_id = g.id AND t.rn = 1 AND g.route_template_id IS NULL;

-- Katalog jadvali: qaysi fason qaysi guruhda mavjud, nechta birlik kiritilgan.
-- Birligi bor mahsulotni faolsizlantirish mumkin, o'chirish esa mumkin emas —
-- sahifa shu ustunga qarab qaror qiladi.
CREATE OR REPLACE VIEW v_catalog AS
SELECT p.id, p.sku, p.name, p.active, p.is_set,
       p.group_id, g.name AS group_name, g.code AS group_code,
       p.fason_id, f.name AS fason_name,
       p.route_template_id, rt.name AS route_name,
       (SELECT COUNT(*) FROM production_units u WHERE u.product_id = p.id) AS units
FROM products p
JOIN product_groups g       ON g.id = p.group_id
LEFT JOIN fasons f          ON f.id = p.fason_id
LEFT JOIN route_templates rt ON rt.id = p.route_template_id;
