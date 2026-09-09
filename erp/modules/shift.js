// Smenani MAHSULOT YO'NALISHI bo'yicha topadi yoki ochadi.
// Umumiy bo'yoqlash tsexida operator ikkala yo'nalish mahsulotini ishlaydi —
// smenani u tanlamaydi, tizim mahsulotdan aniqlaydi.
async function resolveShift(client, productId, shiftNo = 1, workerId = null, workDate = null) {
  const line = (await client.query(
    `SELECT line_id FROM v_product_line WHERE product_id = $1`, [productId])).rows[0];
  if (!line) throw new Error('Mahsulot yo\'nalishi aniqlanmadi');
  const { rows } = await client.query(
    `INSERT INTO shifts (work_date, shift_no, line_id, opened_by)
     VALUES (COALESCE($4::date, CURRENT_DATE), $1, $2, $3)
     ON CONFLICT (work_date, shift_no, line_id) DO UPDATE SET closed_at = NULL
     RETURNING id`, [shiftNo, line.line_id, workerId, workDate]);
  return rows[0].id;
}

module.exports = { resolveShift };
