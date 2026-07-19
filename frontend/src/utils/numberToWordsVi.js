// Đọc số tiền VNĐ thành chữ, dùng "ngàn" (không phải "nghìn") theo đúng cách Senior dùng trong
// mẫu Debit Note gốc (miền Nam). Chỉ dùng cho dòng "Thành Tiền: ... đồng./." khi in — không ảnh
// hưởng tính toán số, chỉ là text hiển thị.
const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const DON_VI_NHOM = ['', 'ngàn', 'triệu', 'tỷ', 'ngàn tỷ', 'triệu tỷ'];

function docBaChuSo(so, forceHundred) {
  const tram = Math.floor(so / 100);
  const chuc = Math.floor((so % 100) / 10);
  const donvi = so % 10;
  let s = '';
  if (tram > 0) {
    s += CHU_SO[tram] + ' trăm ';
  } else if (forceHundred) {
    s += 'không trăm ';
  }
  if (chuc === 0) {
    if (donvi > 0 && (tram > 0 || forceHundred)) s += 'lẻ ';
    if (donvi > 0) s += CHU_SO[donvi] + ' ';
  } else if (chuc === 1) {
    s += 'mười ';
    if (donvi === 1) s += 'mốt ';
    else if (donvi === 5) s += 'lăm ';
    else if (donvi > 0) s += CHU_SO[donvi] + ' ';
  } else {
    s += CHU_SO[chuc] + ' mươi ';
    if (donvi === 1) s += 'mốt ';
    else if (donvi === 5) s += 'lăm ';
    else if (donvi > 0) s += CHU_SO[donvi] + ' ';
  }
  return s.trim();
}

export function numberToVietnameseWords(number) {
  const n = Math.round(Math.abs(Number(number) || 0));
  if (n === 0) return 'Không đồng';
  const groups = [];
  let rest = n;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const forceHundred = i < groups.length - 1;
    const words = docBaChuSo(g, forceHundred);
    parts.push(words + (DON_VI_NHOM[i] ? ' ' + DON_VI_NHOM[i] : ''));
  }
  let result = parts.join(' ').replace(/\s+/g, ' ').trim();
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return result + ' đồng';
}
