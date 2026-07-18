# App Quản lý Giao nhận / Khai báo Hải quan

App thay thế file Excel "BC TỔNG HỢP THÁNG 07", theo quy trình lập phiếu kiểu MISA:
tạo 1 Lô hàng → chọn khách hàng, nhập cước dịch vụ (doanh thu) → thêm các dòng chi phí
phát sinh (trả nhà cung cấp/nhà xe) → lưu hoàn thành. Các báo cáo (Công nợ Khách hàng,
Công nợ Nhà cung cấp, Sổ quỹ theo hình thức thanh toán, Doanh thu/Lợi nhuận) tự động
tính toán từ dữ liệu này, không cần nhập tay riêng.

## Cấu trúc

```
logistics-app/
  backend/    Node.js + Express + SQLite (better-sqlite3)
  frontend/   React (Vite) + Ant Design
```

## Cài đặt lần đầu

Yêu cầu: **Node.js >= 22.5** (dùng module `node:sqlite` tích hợp sẵn, KHÔNG cần cài
Visual Studio Build Tools / trình biên dịch C++ như các thư viện SQLite native khác).
Kiểm tra version: `node -v`. Nếu máy bạn đang dùng Node cũ hơn, tải bản mới tại
https://nodejs.org (khuyến nghị bản LTS mới nhất).

```bash
# 1. Cài backend
cd backend
npm install
node src/seed.js     # seed danh mục khách hàng / NCC / loại phí / quỹ ban đầu (lấy từ Excel gốc)

# 2. Cài & build frontend
cd ../frontend
npm install
npm run build         # build ra frontend/dist
```

Khi chạy `node src/seed.js` hoặc `npm start`, bạn có thể thấy dòng cảnh báo:
`ExperimentalWarning: SQLite is an experimental feature` — đây là cảnh báo bình
thường từ Node.js, không phải lỗi, có thể bỏ qua.

## Chạy app (chỉ cần 1 lệnh, phục vụ cả frontend + backend)

```bash
cd backend
npm start              # hoặc: node src/server.js
```

Mở trình duyệt: **http://localhost:4000**

## Chạy chế độ phát triển (2 server riêng, có hot-reload frontend)

```bash
# Terminal 1
cd backend && npm start          # http://localhost:4000 (API)

# Terminal 2
cd frontend && npm run dev       # http://localhost:5173 (UI, tự proxy /api sang :4000)
```

## Dữ liệu

- Toàn bộ dữ liệu lưu trong file `backend/data.db` (SQLite). Backup = copy file này.
- Danh mục ban đầu (Khách hàng, Nhà cung cấp, Loại phí, Hình thức thanh toán + số dư đầu kỳ)
  đã được seed sẵn từ file Excel gốc `BC_TỔNG_HỢP_THÁNG_07.xlsx`. Bạn có thể sửa/thêm/xoá
  trực tiếp trong app ở mục **Danh mục**.
- Muốn xoá sạch dữ liệu và seed lại từ đầu:
  ```bash
  cd backend
  rm data.db data.db-shm data.db-wal
  node src/seed.js
  ```

## Các màn hình chính

1. **Tổng quan** — dashboard số liệu tổng hợp
2. **Lô hàng** — danh sách + tạo/sửa phiếu lô hàng (form kiểu MISA)
3. **Công nợ Khách hàng** — phải thu / đã thu / còn nợ theo từng KH, xem chi tiết, tạo phiếu thu
4. **Công nợ Nhà cung cấp** — phải trả / đã trả / còn nợ theo từng NCC, xem chi tiết, tạo phiếu chi
5. **Sổ quỹ** — thu chi theo từng hình thức thanh toán (quỹ), tồn cuối, xem chi tiết giao dịch
6. **Doanh thu** — báo cáo doanh thu/chi phí/lợi nhuận theo lô hàng, lọc theo khoảng ngày
7. **Danh mục** — quản lý Khách hàng, Nhà cung cấp, Loại phí, Hình thức thanh toán

## Ghi chú kỹ thuật

- Khi tạo Lô hàng, nếu tick **"Đã thu cước ngay"** → hệ thống tự sinh 1 Phiếu thu KH tương ứng.
- Mỗi dòng chi phí trong Lô hàng nếu tick **"Đã thanh toán?"** → hệ thống tự sinh 1 Phiếu chi
  NCC tương ứng và trừ vào quỹ đã chọn. Nếu không tick, khoản đó được ghi nhận là **công nợ
  phải trả NCC**, chờ thanh toán sau (tạo Phiếu chi ở màn hình Công nợ NCC).
- **Xoá lô hàng**: các dòng chi phí của lô sẽ bị xoá theo, nhưng các Phiếu thu/Phiếu chi đã
  tự động sinh ra (do tick "đã thu/đã thanh toán") sẽ **không bị xoá** — chỉ mất liên kết tới
  lô hàng đó — để không làm mất dữ liệu tiền đã thực sự thu/chi.
- Database dùng module `node:sqlite` tích hợp sẵn trong Node.js (không phải `better-sqlite3`)
  để tránh yêu cầu biên dịch native binding trên máy Windows không có Visual Studio Build Tools.
- Đây là bản MVP theo đúng thứ tự ưu tiên đã thống nhất: build app trước, tối ưu (import
  Excel cũ, phân quyền, export báo cáo, v.v.) sau.
