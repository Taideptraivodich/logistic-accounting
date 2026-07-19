# Fix: Debit Note — đồng bộ chi phí mới + tách 2 tab Phí dịch vụ / Phí chi hộ

## Cách bàn giao
Giải nén đè trực tiếp lên đúng đường dẫn trong repo (2 file, không đổi gì khác):
```
backend/src/routes/debit-notes.js
frontend/src/pages/DebitNoteForm.jsx
```
Không cần xoá `data.db`, không có migration nào (không đổi schema). Sau khi copy đè:
```
cd frontend && npm run build && cd ../backend && npm start
```
(hoặc `pm2 restart all` nếu đang chạy VPS — backup DB trước theo quy tắc đã chốt, dù đợt này không đụng schema).

## 1. Bug đã sửa — "thêm chi phí ở lô hàng, Debit Note không tự sinh dòng mới"

**Nguyên nhân thật:** Khi Sửa 1 Debit Note đã gắn lô hàng (`/debit-notes/:id/edit`), các dòng chỉ được
load từ `debit_note_lines` đã lưu trước đó — không hề đối chiếu lại với Customer Charges hiện tại của
lô hàng. Nút "Lấy dòng" cũ, nếu bấm, sẽ **xoá sạch rồi thay toàn bộ** danh sách dòng — mất luôn các
dòng đã sửa tay (Số hoá đơn, Ghi chú, dòng tự thêm không có trong Customer Charges) — nên Senior
thường không dám bấm lại, dẫn tới cảm giác "chi phí mới thêm không tự sinh dòng".

**Đã sửa (`DebitNoteForm.jsx`):**
- Khi mở màn Sửa 1 Debit Note có gắn lô hàng, tự động gọi `GET /debit-notes/suggest-lines` rồi
  **CỘNG THÊM** đúng những dòng thực sự mới (so khớp theo `source_charge_id` — ổn định qua các lần
  Sửa lô hàng vì tham chiếu `shipment_charges.id` gốc; dòng tự thêm tay không có `source_charge_id`
  thì so khớp tạm theo Mô tả để không cộng trùng khi đồng bộ nhiều lần) — **không xoá/ghi đè** dòng
  đã có. Bấm "Lưu" là dòng mới được lưu lại luôn, không cần làm gì thêm.
- Có thêm nút "Đồng bộ từ lô hàng (chỉ thêm dòng mới)" để Senior tự bấm lại bất cứ lúc nào (vd đang
  mở sẵn màn Sửa Debit Note ở 1 tab trình duyệt khác, vừa thêm phí ở tab lô hàng).
- Radio "Loại" ở màn Sửa đổi thành hiển thị khoá cứng (không cho đổi) — trước đây Radio này CHO ĐỔI
  trên UI nhưng backend (`PUT /debit-notes/:id`) không hề nhận/lưu field `loai`, nên đổi xong bấm Lưu
  vẫn giữ nguyên Loại cũ, gây hiểu nhầm.

## 2. Redesign — tách "Phí dịch vụ" / "Phí chi hộ" thành 2 tab thật, không phụ thuộc nút "Lấy dòng"

Khi tạo Debit Note từ 1 lô hàng (`/debit-notes/new?shipment_id=...`, hoặc chọn Lô hàng ngay trong màn
Tạo mới), thay vì 1 Radio "Loại" dùng chung 1 bản ghi/1 danh sách dòng (dễ lấy nhầm loại này sang loại
kia), giờ hiển thị **2 tab AntD thật**: "Phí dịch vụ" và "Phí chi hộ". Mỗi tab:

- Tự tìm Debit Note **nháp** sẵn có của đúng (lô hàng, loại) này để sửa tiếp; nếu chưa có thì tự khởi
  tạo dòng từ Customer Charges đúng loại — **không cần bấm nút** mới thấy dữ liệu.
- Có Form + "Thông tin nhận tiền / chữ ký" + `lines` **hoàn toàn độc lập** với tab kia — chuyển qua
  lại giữa 2 tab không mất dữ liệu đang nhập của tab còn lại, lưu (POST/PUT) riêng từng tab.
- Nút "Đồng bộ từ lô hàng" chỉ CỘNG THÊM dòng chi phí mới phát sinh ở lô hàng (không xoá/ghi đè) —
  đây chính là vai trò mới của nút "Lấy dòng" cũ theo đúng yêu cầu.
- Nếu loại đó đã có Debit Note **Xác nhận** rồi (khoá sửa) thì hiện cảnh báo + nút "Xem/In", không
  cho tạo trùng ở đây — tránh lệch số với bản đã chốt.

Debit Note **không gắn lô hàng nào** (tạo tự do, ví dụ thu phí ngoài lô hàng cụ thể) vẫn giữ nguyên
UI cũ (Radio "Loại" + 1 bảng dòng), vì không có Customer Charges nào để tách theo.

### File backend đổi kèm theo (nhỏ)
`backend/src/routes/debit-notes.js`: thêm filter `loai` cho `GET /debit-notes` (dùng để mỗi tab tự
tìm đúng bản nháp của mình theo `shipment_id` + `loai`). Không đổi schema, không đổi route nào khác.

## Đã test thật (đợt này)
`git clone` mới → sửa 2 file → `npm install` (frontend + backend) → `npm run build` (vite) pass, 0
lỗi → `oxlint src/pages/DebitNoteForm.jsx` — 0 lỗi, 0 warning. Xoá `data.db` cũ, `node src/seed.js`
seed sạch, chạy server thật, test bằng `curl`:
- Tạo 1 khách hàng + 1 lô hàng với 1 dòng Cost thường (Kiểm hoá, SERVICE) + 1 dòng "Chi hộ?" (Phí hạ,
  DISBURSEMENT) → `GET /shipments/1/customer-charges` xác nhận tách đúng charge_type.
- Tạo Debit Note "Phí dịch vụ" cho lô hàng (mô phỏng đúng luồng tab tự khởi tạo) → `POST
  /debit-notes` thành công, `so_dn = DN000001`.
- Sửa Customer Charges của lô hàng (mô phỏng Senior mở tab "Debit Note (thu khách)" thêm dòng "Phí
  vận chuyển" rồi Lưu) → `PUT /shipments/1/customer-charges` — xác nhận toàn bộ id của
  `shipment_customer_charges` đổi mới (do cơ chế xoá-tạo-lại), nhưng `source_charge_id` của 2 dòng cũ
  **giữ nguyên** → đúng như phân tích, khẳng định chọn `source_charge_id` làm khoá so khớp là đúng.
- `GET /debit-notes/suggest-lines?shipment_id=1&loai=dich_vu` → trả về đúng dòng cũ (Kiểm hoá, khớp
  `source_charge_id`) + dòng mới (Phí vận chuyển, `source_charge_id=null`).
- `PUT /debit-notes/1` với `lines` = kết quả merge (dòng cũ giữ nguyên + dòng mới cộng thêm, mô phỏng
  đúng những gì `DebitNoteForm.jsx` sẽ gửi lên sau khi tự động đồng bộ) → lưu/đọc lại đúng, tổng tiền
  tính đúng 350.000 (200.000 + 150.000).
- `GET /debit-notes?shipment_id=1&loai=chi_ho` → trả `[]` (chưa tạo) — xác nhận tab "Phí chi hộ" sẽ
  tự khởi tạo từ `suggest-lines` (trả đúng dòng "Phí hạ", DISBURSEMENT) mà không cần Senior bấm gì.
- Dọn `data.db`/`node_modules`/`dist` khỏi gói giao.

## Chưa làm / cần lưu ý cho phiên sau
- So khớp dòng tự thêm tay (không có `source_charge_id`) đang dùng Mô tả làm khoá tạm — nếu Senior
  đổi Mô tả của dòng đã đồng bộ trước đó rồi bấm "Đồng bộ" lại, có thể bị cộng trùng dòng đó lần nữa
  (dòng gốc ở Customer Charges vẫn còn y nguyên Mô tả cũ). Chưa có khoá ổn định hơn cho trường hợp
  này vì bản thân `shipment_customer_charges.id` cũng không ổn định qua các lần Lưu (xoá-tạo-lại).
- Chưa xử lý trường hợp 1 lô hàng có NHIỀU HƠN 1 Debit Note nháp cùng loại (dữ liệu cũ nếu có, tạo từ
  trước đợt sửa này) — component tab chỉ lấy bản nháp ĐẦU TIÊN tìm thấy (theo thứ tự `id DESC` từ
  backend, tức bản mới nhất). Nếu Senior có dữ liệu cũ dạng này, cần tự dọn (xoá bớt) để tránh nhầm
  bản đang sửa.
