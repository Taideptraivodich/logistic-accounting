const db = require('./db');

const customers = [
  ["WINWIN", 10638000], ["ĐỒNG AN STAR", 9666000], ["HỒNG KHẢI", 1500000],
  ["CRESTOP", 972000], ["HỢP HUY", 7500000], ["SƠN TIỀN HẢI", 5724000],
  ["GENJITSU", 4118000], ["UPTRANS", 3996000], ["STQ NEWS", 2250000],
  ["HÀ HÙNG HƯNG", 3780000], ["GỖ BÌNH MINH", 6750000], ["SAO VIỆT", 1200000],
  ["CHINH LINH", 2500000], ["MANOVAT", 1700000], ["BAYKAO", 0], ["JBS", 0],
  ["Môi Trường DC", 4000000], ["ĐẠI TOÀN PHÚC", 5300000], ["RICHOME", 5994000],
  ["LINGRUI", 0], ["UPTRANS-HMD", 0],
];

const suppliers = [
  "BLUE SAO MAI", "Hoàng Long", "LONG ĐỨC PHÁT", "Mai Phương",
  "THIÊN AN PHÚ", "THUONG MAI 117", "UPTRANS",
];

const feeTypes = [
  "Chi hải quan", "Chi phí khác", "Kiểm hóa", "Lệ phí", "Phí CO",
  "Phí CSHT", "Phí hạ", "Phí nâng", "Phí ra vào cổng", "Phí vận chuyển", "Thuế",
];

// Danh mục thu/chi KHÁC — không gắn khách hàng / NCC cụ thể (dùng trong màn Phiếu thu/chi).
const voucherCategoriesChi = [
  "Chi in hồ sơ", "Chi mua văn phòng phẩm", "Chi tiếp khách", "Chi xăng xe",
  "Chi lương/thưởng", "Chi thuê văn phòng", "Chi khác",
];
const voucherCategoriesThu = ["Thu khác"];

const paymentMethods = [
  ["HHA", 7088655],
  ["NGỌC", -1609829],
  ["VIETINBANK", 35530694],
];

const insCustomer = db.prepare(
  `INSERT OR IGNORE INTO customers (name, default_cuoc_dv) VALUES (?, ?)`
);
const insSupplier = db.prepare(`INSERT OR IGNORE INTO suppliers (name) VALUES (?)`);
const insFeeType = db.prepare(`INSERT OR IGNORE INTO fee_types (name) VALUES (?)`);
const insVoucherCat = db.prepare(`INSERT OR IGNORE INTO voucher_categories (name, type) VALUES (?, ?)`);
const insPM = db.prepare(
  `INSERT OR IGNORE INTO payment_methods (name, opening_balance) VALUES (?, ?)`
);

const seed = db.transaction(() => {
  for (const [name, cuoc] of customers) insCustomer.run(name, cuoc);
  for (const name of suppliers) insSupplier.run(name);
  for (const name of feeTypes) insFeeType.run(name);
  for (const name of voucherCategoriesChi) insVoucherCat.run(name, 'chi');
  for (const name of voucherCategoriesThu) insVoucherCat.run(name, 'thu');
  for (const [name, bal] of paymentMethods) insPM.run(name, bal);
});

seed();
console.log('Seed danh mục hoàn tất.');
