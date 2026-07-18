export function formatMoney(v) {
  if (v === null || v === undefined || v === '') return '0';
  const n = Number(v);
  return n.toLocaleString('vi-VN');
}

export function moneyClass(v) {
  const n = Number(v || 0);
  if (n > 0) return 'money-pos';
  if (n < 0) return 'money-neg';
  return '';
}
