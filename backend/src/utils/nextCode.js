const db = require('../db');

// Sinh số chứng từ tự tăng theo prefix, vd nextCode('DN', 'debit_notes', 'so_dn') -> 'DN000001'.
// Cùng logic với các nơi khác trong app (shipments.js, vouchers.js) — tách ra dùng chung cho
// module mới (Debit Note) để không lặp lại code, không đụng tới 2 file cũ đang chạy ổn định.
function nextCode(prefix, table, col) {
  const row = db
    .prepare(`SELECT ${col} as code FROM ${table} WHERE ${col} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`);
  let n = 1;
  if (row && row.code) {
    const m = row.code.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return prefix + String(n).padStart(6, '0');
}

module.exports = { nextCode };
