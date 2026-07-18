# AI HANDOVER — App Quản lý Giao nhận / Khai báo Hải quan (đợt "tự sinh phiếu thu/chi từ Lô hàng v2 + đổi Ghi chú → Nội dung")

> Đọc file này trước, không cần đọc lại lịch sử chat cũ. Đây là bản cập nhật của `AI_HANDOVER.md`
> trước đó (đợt "nội dung phiếu tự động + tạo phiếu nhanh từ Lô hàng/Công nợ"). Bối cảnh/stack/
> schema cũ ở các mục không nhắc tới dưới đây giữ nguyên.

## 1. `git clone` mới, đọc code thật trước khi sửa — đúng quy trình

Senior gửi thẳng yêu cầu (không phải báo lỗi) kèm 3 ảnh chụp màn hình lô hàng, modal Tạo phiếu
thu (Vouchers.jsx), và modal Tạo phiếu thu khách hàng (CongNoKH.jsx). `git clone` mới rồi đọc
code thật (đặc biệt là đợt trước — file `AI_HANDOVER.md` cũ) trước khi sửa: phát hiện đợt trước
đã **chủ động bỏ** cơ chế tự sinh phiếu thu/chi từ Lô hàng để tránh lệch số. Đợt này Senior yêu
cầu **đảo ngược lại quyết định đó** — đã làm đúng theo yêu cầu mới, không tự ý giữ nguyên quyết
định cũ.

## 2. Yêu cầu Senior đưa ra đầu phiên này (3 việc)

1. **Màn Lô hàng — "Quỹ thu cước": bỏ nút "Tạo phiếu thu cước", thay bằng ô tick "Đã thu".**
   Tick "Đã thu" ở cước dịch vụ (`ShipmentForm.jsx`) rồi Lưu → tự tạo phiếu thu thật (không cần
   qua màn Phiếu thu/chi nữa). Tương tự, tick "Đã thanh toán?" ở từng dòng chi phí (nút "Tạo
   phiếu chi" theo dòng cũng đã bỏ) → tự tạo phiếu chi thật cho dòng đó khi Lưu.
2. **Nội dung phiếu tự sinh theo đúng quy cách Senior đưa ra** (khác với mẫu tự sinh "Thu tiền
   khách hàng ABC - Lô hàng LOxxx" của đợt trước — đợt này CHỈ áp dụng công thức mới cho phiếu
   tự sinh từ Lô hàng, còn `buildDefaultGhiChu` trong `vouchers.js` — dùng khi Senior tạo phiếu
   tay không gõ Nội dung — giữ nguyên như cũ, không đụng tới):
   - Thu cước: `TK {số tờ khai} - Thu cước {tên khách hàng} - {mã lô}`
   - Chi (theo từng dòng chi phí): `TK {số tờ khai} - Chi {loại phí} - {mã lô}`
3. **Màn Phiếu thu/chi (`Vouchers.jsx`) và cả 2 modal ở Công nợ KH/NCC: chọn "Lô hàng liên kết"
   thì tự điền Nội dung + Số tiền (tổng)** — đây là tính năng tiện tay cho phiếu Senior **tự tạo
   thủ công** (độc lập với mục 1, không phải phiếu tự sinh):
   - Phiếu thu: số tiền = cước DV (`cuoc_dv`) + tổng chi hộ (`tong_chi_ho`); nội dung theo mẫu
     `TK {số tờ khai} - Thu cước {tên khách hàng} - {mã lô}` (giống mẫu tự sinh ở mục 2).
   - Phiếu chi: số tiền = tổng chi phí (`tong_chi_phi`, đã gồm cả chi hộ); nội dung
     `TK {số tờ khai} - Chi {các loại phí, nối bằng " + " nếu nhiều dòng} - {mã lô}`.
   - Senior vẫn sửa tay được sau khi tự điền — chỉ là gợi ý ban đầu.
4. **Đổi nhãn "Ghi chú" → "Nội dung"** ở các màn liên quan tới phiếu thu/chi (không đổi "Ghi
   chú" ở những chỗ KHÔNG phải nội dung phiếu — xem mục "lưu ý kỹ thuật" bên dưới).

## 3. Cách làm — quan trọng cho phiên sau

### 3.1. Tự sinh phiếu thu/chi từ Lô hàng (v2) — "xoá hết rồi tạo lại" mỗi lần Lưu

Thêm cột `auto_generated INTEGER DEFAULT 0` vào `customer_receipts` và `supplier_payments`
(migration `ensureColumn` trong `db.js`, an toàn chạy lại nhiều lần, không cần xoá `data.db`).

Trong `backend/src/routes/shipments.js`, hàm mới `regenerateAutoVouchers(shipmentId, {...})`
được gọi ở **cuối transaction** của cả POST `/shipments` và PUT `/shipments/:id`, sau khi
shipment + charges đã lưu xong:
1. `DELETE` hết `customer_receipts`/`supplier_payments` có `shipment_id = ?` AND `auto_generated = 1`
   (không đụng phiếu Senior tự tạo tay dù có gắn "Lô hàng liên kết" trùng lô này — phân biệt bằng
   cột `auto_generated`).
2. Nếu `cuoc_thu_ngay` (tick "Đã thu") = true và có khách hàng + `cuoc_dv > 0` → tạo 1
   `customer_receipts` mới với `auto_generated = 1`, nội dung theo mẫu mục 2.
3. Với mỗi dòng chi phí có `da_thanh_toan` = true và có chọn NCC và `so_tien > 0` → tạo 1
   `supplier_payments` mới với `auto_generated = 1`, nội dung theo mẫu mục 2.

**Sửa 1 bug cũ tiện thể phát hiện ra khi làm việc này**: route PUT `/shipments/:id` trước đây
**không hề lưu `cuoc_thu_ngay`** vào DB (thiếu trong cả destructure `req.body` lẫn câu `UPDATE` —
có thể do sót khi thêm cột này ở bản rất cũ). Đã bổ sung đầy đủ.

**LƯU Ý CHO PHIÊN SAU (đánh đổi đã biết, chưa xử lý)**: vì cơ chế là "xoá hết rồi tạo lại" mỗi
lần Lưu lô hàng, nếu Senior tự sửa tay 1 phiếu tự sinh (ví dụ đổi quỹ nhận tiền) ở màn Phiếu
thu/chi rồi sau đó lưu lại lô hàng gốc, phiếu tự sinh đó sẽ bị xoá/tạo lại và **mất chỉnh sửa
tay**. Đã ghi rõ trong comment code (`regenerateAutoVouchers`). Nếu Senior phàn nàn về việc này
trong thực tế, cần bàn hướng khác (ví dụ: chỉ update phiếu hiện có thay vì xoá/tạo lại, match
theo charge index — phức tạp hơn vì bảng `shipment_charges` không giữ id ổn định qua các lần sửa
lô hàng, xem PUT route: `DELETE FROM shipment_charges WHERE shipment_id = ?` rồi insert lại toàn
bộ mỗi lần sửa).

Đã thêm Tag "Tự động" màu xanh ở cột "Đối tượng" trong `Vouchers.jsx` cho các phiếu có
`auto_generated = 1`, để Senior phân biệt trực quan phiếu nào do hệ thống tự tạo.

### 3.2. Tự điền Nội dung + Số tiền khi chọn "Lô hàng liên kết" (tạo phiếu tay)

Thêm hàm `onShipmentPick` trong cả 3 nơi có modal "Tạo phiếu" với ô "Lô hàng liên kết":
`Vouchers.jsx` (cả 2 tab thu/chi, dùng chung component `VoucherTable`), `CongNoKH.jsx`,
`CongNoNCC.jsx`. Khi Senior chọn 1 lô hàng, gọi `GET /api/shipments/:id` (lấy chi tiết đầy đủ kèm
mảng `charges`, không dùng danh sách rút gọn từ `GET /shipments`) rồi `form.setFieldsValue` điền
Số tiền + Nội dung theo công thức mục 2/3 ở trên. Với phiếu thu, `Vouchers.jsx` còn tự chọn luôn
Khách hàng theo `shipment.customer_id`. Lỗi khi gọi API (mất mạng...) bị nuốt lặng lẽ (catch rỗng
có comment) để không chặn luồng nhập liệu tay — Senior vẫn tự gõ được nếu tự-điền thất bại.

### 3.3. Đổi nhãn "Ghi chú" → "Nội dung" — chỉ ở đúng chỗ là nội dung phiếu thu/chi

Đã đổi ở: cột bảng + label modal trong `Vouchers.jsx`, `CongNoKH.jsx` (receiptColumns + modal),
`CongNoNCC.jsx` (paymentColumns + modal), và bảng "Phiếu thu/chi đã gắn với lô hàng này" trong
`ShipmentForm.jsx` (linkedColumns).

**KHÔNG đổi** ở những chỗ sau vì đây là field khác, không phải nội dung phiếu thu/chi:
- Cột "Ghi chú" trong bảng "tháng phát sinh" (`monthColumns` ở `CongNoKH.jsx`/`CongNoNCC.jsx`) —
  đây là `cong_no_notes.ghi_chu`, ghi chú tự do Senior gõ cho từng dòng tháng kiểu Excel, khác
  hẳn nội dung phiếu.
- Cột "Ghi chú" trong bảng chi phí phát sinh (`ShipmentForm.jsx`, dòng dữ liệu
  `shipment_charges.ghi_chu`) — ghi chú riêng cho dòng chi phí, không phải nội dung phiếu chi
  (nội dung phiếu chi giờ tự sinh theo mẫu ở mục 2, không lấy từ field này nữa).
- Form.Item "Ghi chú" ở phần "Thông tin chung" của `ShipmentForm.jsx` (`shipments.ghi_chu`) — ghi
  chú chung cho cả lô hàng, không phải phiếu thu/chi.
- `reports.js`/`SoQuy.jsx` đã để "Nội dung" từ đợt trước rồi, không cần đổi.

## 4. Danh sách file đã sửa (đóng gói trong `logistic-accounting-fixes-auto-voucher-v2.zip`)

```
backend/src/db.js                    thêm ensureColumn cho auto_generated (2 bảng)
backend/src/schema.sql               thêm cột auto_generated vào 2 bảng (CREATE TABLE IF NOT
                                       EXISTS — chỉ áp dụng khi tạo DB mới, DB cũ dùng ensureColumn
                                       ở db.js); cập nhật comment mô tả cột này
backend/src/routes/shipments.js      thêm buildAutoContentThu/Chi + regenerateAutoVouchers; gọi ở
                                       cuối transaction POST và PUT; PUT: bổ sung cuoc_thu_ngay bị
                                       thiếu trước đây (bug cũ)
backend/src/routes/vouchers.js       cập nhật lại comment đầu file (không sửa logic
                                       buildDefaultGhiChu — vẫn dùng khi Senior tạo phiếu tay
                                       không gõ Nội dung)
backend/src/routes/reports.js        cập nhật comment /so-quy cho đúng hiện trạng (auto-gen đã
                                       được khôi phục, không còn là comment "lỗi thời" như trước)
frontend/src/pages/ShipmentForm.jsx  bỏ nút "Tạo phiếu thu cước" + "Tạo phiếu chi" theo dòng, bỏ
                                       2 hàm quickCreate*; thêm Checkbox "Đã thu?" (cuoc_thu_ngay)
                                       cạnh "Quỹ thu cước"; đổi tooltip "Đã thanh toán?"; đổi cột
                                       "Ghi chú" → "Nội dung" ở bảng phiếu đã gắn lô hàng; cập nhật
                                       đoạn text hướng dẫn cuối trang
frontend/src/pages/Vouchers.jsx      thêm onShipmentPick tự điền Nội dung + Số tiền khi chọn Lô
                                       hàng liên kết; đổi "Ghi chú" → "Nội dung"; thêm Tag "Tự
                                       động" cho phiếu auto_generated=1
frontend/src/pages/CongNoKH.jsx      thêm onShipmentPick tương tự; đổi "Ghi chú" → "Nội dung"
                                       (receiptColumns + modal) — KHÔNG đổi monthColumns
frontend/src/pages/CongNoNCC.jsx     thêm onShipmentPick tương tự (dùng tong_chi_phi + danh sách
                                       loại phí); đổi "Ghi chú" → "Nội dung" — KHÔNG đổi
                                       monthColumns
```

Cách bàn giao: giải nén `logistic-accounting-fixes-auto-voucher-v2.zip` đè trực tiếp lên đúng
đường dẫn trong repo của Senior — **không cần xoá `data.db`** (migration `ensureColumn` tự thêm
cột `auto_generated` khi server khởi động lần đầu sau khi cập nhật). Sau khi copy đè:
`cd frontend && npm run build && cd ../backend && npm start` (hoặc `pm2 restart all` nếu đang
chạy trên VPS — **backup DB trước khi restart theo đúng quy tắc đã chốt từ trước**, dù đây chỉ là
ADD COLUMN).

Đã build/test thật ở đợt này: `git clone` mới → sửa → `npm install` (frontend, vì lần này chưa có
sẵn `node_modules`) → `npm run build` (vite) pass không lỗi → xoá `data.db` cũ → `node src/seed.js`
seed sạch → chạy `node src/server.js` nền, `curl` tạo 1 khách hàng + 1 NCC test → `POST
/api/shipments` với `cuoc_thu_ngay: true` + 1 dòng chi phí `da_thanh_toan: true` → xác nhận response
trả về đúng `linked_receipts`/`linked_payments` với nội dung đúng mẫu (`TK 12323-1412-3 - Thu cước
GENJITSU TEST - LO000001` và `TK 12323-1412-3 - Chi Chi hai quan - LO000001`) → `PUT
/api/shipments/1` với `cuoc_thu_ngay: false` (giữ nguyên charge `da_thanh_toan: true`) → xác nhận
phiếu thu tự sinh trước đó bị xoá (`linked_receipts: []`), phiếu chi vẫn còn (id mới, do bị xoá/tạo
lại) → gọi `GET /api/reports/so-quy` xác nhận số dư quỹ khớp đúng → gọi `GET /api/shipments` và
`GET /api/shipments/:id` xác nhận các field mà frontend `onShipmentPick` cần
(`so_to_khai`/`cuoc_dv`/`tong_chi_ho`/`tong_chi_phi`/`customer_name`/`charges[].loai_phi`) đều có
đủ → dọn `data.db`/`node_modules`/`dist` khỏi gói giao cho Senior.

## 5. Việc CHƯA làm / cần bàn tiếp — quan trọng cho phiên sau

- **Đánh đổi "xoá hết rồi tạo lại" phiếu tự sinh mỗi lần Lưu lô hàng** (xem mục 3.1) — mất chỉnh
  sửa tay trên phiếu tự sinh nếu Senior sửa tay rồi lưu lại lô hàng gốc. Cần bàn với Senior nếu
  gây khó chịu thực tế trước khi đổi sang cách match theo charge ổn định hơn (phức tạp hơn nhiều).
- **2 modal "Tạo phiếu" (`Vouchers.jsx` vs `CongNoKH/NCC.jsx`) vẫn chưa gộp chung component** —
  đã ghi từ 2 bản trước, đợt này lại phải sửa riêng lẻ cả 3 nơi (`Vouchers.jsx` + 2 file
  CongNo*.jsx) cho tính năng `onShipmentPick` — càng thấy rõ nên gộp ở đợt sau nếu còn phải sửa
  đồng thời cả 3 nơi lần nữa.
- **Nút "Tạo phiếu chi" theo dòng chi phí đã bị bỏ hẳn** (thay bằng auto-gen) — nếu Senior muốn
  tạo phiếu chi "khác" (không tự sinh, không gắn NCC) ngay từ dòng chi phí, hiện phải tự qua màn
  Phiếu thu/chi, chọn "Chi khác" + danh mục.
  chi phí "khác" thì cần thêm lựa chọn đó (đã ghi từ bản trước, vẫn còn nguyên).
- **Export báo cáo Excel/PDF, đăng nhập/phân quyền, validate trùng tờ khai, deploy VPS thật, import
  Excel cũ, "Nợ xấu" mới là cờ tay chưa có ngưỡng tự động, bundle frontend ~1.3MB** — vẫn còn
  nguyên từ các bản trước, chưa động tới.

## 6. Stack kỹ thuật, cấu trúc thư mục, phong cách làm việc — không đổi so với bản trước

Node.js + Express + `node:sqlite`, React/Vite + Ant Design 5, `backend/` + `frontend/` tách 2 thư
mục con ở gốc repo. Senior là dev/tech lead, giao tiếp tiếng Việt, làm việc trên Windows
(PowerShell / Git Bash). Ưu tiên giao file sẵn sàng chạy kèm hướng dẫn copy/paste rõ ràng. Luôn
`git clone` mới trước khi sửa, luôn build/test thật trước khi bàn giao. Khi Senior đưa ra 1 quyết
định đảo ngược quyết định trước — làm đúng theo yêu cầu mới, không tự ý giữ nguyên quyết định cũ,
nhưng vẫn nên ghi rõ trong handover là đã đảo ngược gì để phiên sau không bị rối.
