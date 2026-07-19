# AI HANDOVER — Tách UI "Debit Note (thu khách)" thành 2 vùng: Cước dịch vụ (có danh mục) / Chi hộ

> **CẬP NHẬT MỚI NHẤT: Redesign "2 vùng" (mục 2-4 dưới đây) ĐÃ CODE XONG + đã tìm và sửa 1 bug
> backend nghiêm trọng liên quan.** Đọc "ĐÃ HOÀN TẤT REDESIGN 2 VÙNG" ngay dưới đây trước — các dòng
> "CHƯA CODE GÌ" ở 2 khối cũ bên dưới (một cho redesign 2 vùng, một cho hotfix riêng bug đổi Loại)
> đã lỗi thời, chỉ giữ lại để tham khảo bối cảnh/đặc tả gốc.

## ĐÃ HOÀN TẤT REDESIGN 2 VÙNG (đợt này) — + 1 bug backend nghiêm trọng đã sửa

**Bối cảnh phát sinh đợt này:** Senior test hotfix đổi Loại (đợt trước) thì phát hiện thêm: qua
Debit Note từ lô hàng, tab "Chi hộ" luôn trống dù Cost đã tick "Chi hộ?" cho dòng đó, và nút "Lấy
dòng" tưởng như chỉ hoạt động ở tab Dịch vụ. Sau khi đọc code thật, tìm ra đây KHÔNG chỉ là vấn đề
UX (Charge Type dropdown dễ quên, như handover gốc mô tả) mà còn có **1 bug thật ở
`backend/src/routes/shipments.js`, route POST `/shipments`**: mảng `insertedCharges` truyền vào
`copyChargesToCustomerCharges` được build thiếu field `la_chi_ho`:
```js
insertedCharges.push({ id: chargeInfo.lastInsertRowid, loai_phi: c.loai_phi, so_tien: c.so_tien || 0 });
```
Vì `copyChargesToCustomerCharges` xét `c.la_chi_ho ? 'DISBURSEMENT' : 'SERVICE'`, field bị thiếu
luôn `undefined` (falsy) → **MỌI Customer Charge của lô hàng MỚI TẠO đều bị gắn `charge_type =
'SERVICE'`, kể cả những dòng Senior đã tick "Chi hộ?" ở Cost** — đây mới là nguyên nhân thật khiến
tab "Chi hộ" trống, không phải do Senior quên đổi dropdown. Đã sửa 1 dòng, thêm `la_chi_ho: c.la_chi_ho
? 1 : 0` vào object push. Route GET `/:id/customer-charges` (lazy-copy cho lô hàng cũ, dùng
`SELECT *` nên có sẵn `la_chi_ho`) KHÔNG bị bug này — chỉ POST tạo mới bị ảnh hưởng.

**Đã code đầy đủ đặc tả redesign 2 vùng (mục 2-4 bên dưới):**
- `backend/src/schema.sql`: bảng mới `service_charge_catalog (id, name UNIQUE, don_vi_tinh,
  don_gia_mac_dinh, created_at)`.
- `backend/src/db.js`: seed 8 mục mẫu Senior đưa ra (Phí khai báo HQ, C/O, chứng từ, vận chuyển,
  handling, AMS, AFR, ENS) — `INSERT OR IGNORE`, an toàn chạy lại nhiều lần.
- `backend/src/routes/catalog.js`: CRUD `GET/POST/PUT/DELETE /service-charges` (dùng lại
  `makeCrud` có sẵn, **KHÔNG** có prefix `/catalog` vì router này mount thẳng ở `/api`, giống
  `/fee-types`, `/customers`... — gọi ý route "/catalog/service-charges" trong đặc tả gốc chỉ là
  tên gợi ý, đã đổi cho nhất quán với các route cùng file).
- `frontend/src/pages/Catalog.jsx`: thêm tab "Cước dịch vụ" (CRUD đầy đủ qua `GenericCatalog` có
  sẵn) — đáp ứng cả 2 phương án "Việc CHƯA quyết" ở mục 4 gốc (vừa có màn quản lý riêng, vừa quick-
  add tại chỗ ở dưới).
- `frontend/src/pages/ShipmentForm.jsx` (`CustomerChargesTab`): tách 1 bảng thành 2 bảng con
  **"Cước dịch vụ"** (Description = `Select` chọn từ danh mục + quick-add ngay trong dropdown, kiểu
  "Chọn hoặc thêm NCC" đã có sẵn ở tab Chi phí) và **"Chi hộ"** (Description = `Input` tự do, giữ
  nguyên như cũ). Cột "Charge Type" đã BỎ HẲN khỏi UI — vùng nào thì dòng đó tự mang đúng
  `charge_type` (Cước dịch vụ -> `SERVICE`, Chi hộ -> `DISBURSEMENT`); dữ liệu cũ `ADJUSTMENT`/
  `DISCOUNT` (nếu có) hiển thị gộp trong vùng "Cước dịch vụ" (theo đúng phương án đơn giản nhất mà
  đặc tả gốc đề xuất). State `lines` vẫn 1 mảng phẳng DUY NHẤT, payload gửi
  `PUT /shipments/:id/customer-charges` KHÔNG đổi. Thêm 1 nút "chuyển vùng" (icon ⇄) mỗi dòng —
  KHÔNG có trong đặc tả gốc, tự thêm vì cần thiết trong thực tế: không có cách nào khác để Senior tự
  sửa lại 1 dòng bị gắn sai vùng (dữ liệu cũ trước redesign, hoặc lỡ bấm nhầm nút "Thêm dòng" ở vùng
  kia) khi dropdown Charge Type công khai đã bị bỏ.
- `DebitNoteForm.jsx`: KHÔNG cần sửa gì thêm (bug mục 1 gốc đã fix ở đợt hotfix trước; backend
  `suggest-lines` giữ nguyên, đã lọc đúng charge_type).

**Đã build/test thật:** `npm install` (backend + frontend) → `npm run build` (vite) pass, không
lỗi → `oxlint` trên toàn bộ file đã sửa: 0 lỗi (các warning còn lại đều có từ trước, không liên
quan code mới). Test API thật với `data.db` sạch (seed lại):
- Tạo lô hàng mới: 1 dòng Cost thường (Kiểm hóa 200k) + 2 dòng Cost tick "Chi hộ?" (Phí hạ 300k,
  Phí nâng 150k) → `GET /shipments/:id/customer-charges` xác nhận đúng: Kiểm hóa = `SERVICE`, Phí
  hạ/Phí nâng = `DISBURSEMENT` (trước khi sửa bug thì CẢ 3 dòng đều ra `SERVICE`, đã tự tay xác
  nhận lại bug rồi mới sửa).
- `GET /debit-notes/suggest-lines?loai=dich_vu` → chỉ trả Kiểm hóa. `?loai=chi_ho` → chỉ trả Phí
  hạ + Phí nâng. Đúng yêu cầu Senior ở mục 5 "Lưu ý quan trọng" của đặc tả gốc.
- Test riêng đường lazy-copy cho lô hàng "cũ" (tạo với `charges: []` rồi PUT thêm charges sau,
  mô phỏng Sửa lô hàng lần đầu mở tab) → cũng tách đúng charge_type (route GET không bị bug).
- `PUT /shipments/:id/customer-charges` với payload phẳng 2 dòng (1 SERVICE từ danh mục, 1
  DISBURSEMENT tự do, đúng dạng UI 2 vùng sẽ gửi lên) → lưu/đọc lại đúng.
- `GET /catalog... /service-charges`: list trả đúng 8 mục seed sẵn; `POST /service-charges` (quick-
  add) tạo mới thành công.
- `GET /reports/doanh-thu` sau khi lưu Customer Charges → `cuoc_dv`/`chi_ho`/`doanh_thu` tách đúng
  theo charge_type mới lưu.
- Dọn `data.db` khỏi gói giao cho Senior sau khi test xong.

**Chưa làm / cần bàn tiếp (không nằm trong yêu cầu bắt buộc của đợt này):**
- Checkbox phụ "Điều chỉnh/Chiết khấu" trong vùng "Cước dịch vụ" (đặc tả gốc ghi rõ "KHÔNG bắt
  buộc phải làm ngay") — chưa làm; `ADJUSTMENT`/`DISCOUNT` hiện chỉ tồn tại nếu có sẵn từ dữ liệu
  cũ, không có cách tạo mới 2 loại này từ UI (kể cả trước đợt này, việc chọn 2 giá trị đó ở dropdown
  Charge Type cũ rất hiếm khi Senior dùng tới).
- Dữ liệu Customer Charges CŨ (tạo trước đợt sửa bug này, hoặc trước cả redesign 2 vùng) có thể
  đang bị gắn sai `charge_type` (ví dụ do đúng bug vừa nêu, hoặc do Senior quên đổi dropdown cũ) —
  KHÔNG có migration tự động sửa lại (không có cách suy ngược chính xác charge_type đúng từ dữ liệu
  đã lưu). Senior cần tự rà lại các lô hàng cũ có khoản chi hộ, dùng nút "chuyển vùng" (⇄) mới thêm
  để chuyển dòng bị sai từ "Cước dịch vụ" sang "Chi hộ" cho đúng.

---

> **CHƯA CODE GÌ (đặc tả gốc — đã code xong ở bản cập nhật trên, giữ lại để tham khảo)** — Senior yêu
> cầu viết handover cho agent phiên sau làm, đợt gốc dừng ở phân tích + đặc tả. Đây là bản cập nhật
> của `AI_HANDOVER.md` trước đó ("Domain Model Doanh thu sau UAT", giữ nguyên nội dung phía dưới —
> KHÔNG đụng gì tới Domain Model / `utils/revenue.js` của đợt đó, đợt này chỉ là UI + 1 danh mục mới
> trên CÙNG nền dữ liệu).

## 1. Bug đã tìm ra — vì sao Senior thấy "Chi hộ nằm trong Dịch vụ"

Xem 4 ảnh Senior gửi: ảnh 2 (Loại = "Phí dịch vụ", đã bấm "Lấy dòng") và ảnh 3 (Loại = "Phí chi hộ")
hiển thị **Y HỆT** 3 dòng (Phí hạ, Phí CO, Phí nâng, đều 600k/300k/200k) — tức khi đổi "Loại" từ
Dịch vụ sang Chi hộ, bảng dòng KHÔNG được lọc lại.

**Nguyên nhân (đã xác nhận đọc code, KHÔNG phải bug ở backend):** trong
`frontend/src/pages/DebitNoteForm.jsx`, hàm `pullFromShipment` (gọi API
`GET /debit-notes/suggest-lines?shipment_id=&loai=` đã lọc đúng charge_type ở backend — xem đợt
trước) chỉ được gọi khi:
- chọn lại "Lô hàng (tuỳ chọn)" (`onChange` của Select lô hàng), hoặc
- bấm nút "🔄 Lấy dòng từ Customer Charges của lô hàng này".

**KHÔNG được gọi khi đổi Radio "Loại"** (`Form.useWatch('loai', form)` chỉ dùng để tính lại VAT/label,
không có `useEffect` re-fetch khi `loaiWatch` đổi). Nên nếu Senior bấm "Lấy dòng" lúc đang ở "Phí dịch
vụ" rồi mới đổi sang "Phí chi hộ", bảng vẫn giữ nguyên 3 dòng cũ (SERVICE) — lưu lại thì Debit Note
"Chi hộ" chứa nhầm dòng Dịch vụ, đúng như ảnh 4. **Đây là 1 phần việc BẮT BUỘC phải sửa ở đợt sau**,
độc lập với phần redesign UI bên dưới (dù redesign UI bên dưới sẽ tự động triệt tiêu luôn bug này —
xem mục 3, vì lúc đó không còn 1 danh sách "lines" dùng chung cho cả 2 loại nữa).

Ngoài ra, ở ảnh 1 (tab Debit Note của Shipment Form), cả 3 dòng "Phí hạ", "Phí CO", "Phí nâng" đều
đang để Charge Type = "Dịch vụ" — "Phí hạ"/"Phí nâng" thực chất nên là "Chi hộ" nhưng Senior phải tự
nhớ đổi dropdown Charge Type cho từng dòng, dễ quên (đúng vấn đề Senior nêu ra ở đợt này: UI hiện tại
dựa hoàn toàn vào việc Senior tự nhớ đổi 1 dropdown, không có cơ chế nào ép/gợi ý đúng loại).

## 2. Yêu cầu mới của Senior (nguyên văn ý chính)

Tab **"Debit Note (thu khách)"** trong màn Sửa/Tạo lô hàng (`ShipmentForm.jsx`, component
`CustomerChargesTab`) hiện là 1 bảng DUY NHẤT, mỗi dòng có dropdown "Charge Type" để Senior tự chọn
SERVICE/DISBURSEMENT/ADJUSTMENT/DISCOUNT. Senior muốn đổi thành **2 VÙNG TÁCH RIÊNG**:

1. **Vùng "Cước dịch vụ"** — MỚI, cho phép chọn dòng từ 1 **danh mục Cước dịch vụ thường dùng**
   (giống cách tạo/chọn "Mã hàng" trong MISA) thay vì gõ tay Mô tả mỗi lần. Ví dụ danh mục có sẵn:
   "Phí khai báo HQ", "Phí C/O", "Phí chứng từ", "Phí vận chuyển", "Phí handling", "Phí AMS", "Phí
   AFR", "Phí ENS"... Senior chọn 1 dòng từ danh mục (hoặc gõ thêm dòng mới vào danh mục ngay tại
   chỗ, kiểu "tag" trong antd Select `mode` cho phép tạo mới), rồi nhập Đơn giá/Số lượng/VAT như
   bình thường.
2. **Vùng "Chi hộ"** — GIỮ NGUYÊN y như bảng hiện tại (Description tự do/Unit/Qty/Unit Price/VAT/
   Remark), không cần danh mục, không đổi gì.

Charge Type KHÔNG còn là 1 dropdown Senior tự chọn trên từng dòng nữa — **vùng nào thì dòng đó tự
mang đúng charge_type của vùng đó** (Cước dịch vụ -> SERVICE, Chi hộ -> DISBURSEMENT). Đây chính là
cách triệt tiêu tận gốc lỗi "quên đổi dropdown" ở mục 1.

**Nguyên tắc tính doanh thu GIỮ NGUYÊN, không đổi:** Doanh thu = SUM(Customer Charges), tách
Dịch vụ/Chi hộ theo đúng công thức đã có ở `backend/src/utils/revenue.js`
(`sumCustomerChargesByType`) — **KHÔNG cần sửa file này**, vì charge_type SERVICE/DISBURSEMENT vẫn
là tiêu chí tách, chỉ đổi CÁCH SENIOR NHẬP LIỆU (theo vùng, không theo dropdown), không đổi Ý NGHĨA
dữ liệu lưu trong `shipment_customer_charges`. Việc cần rà lại là **DebitNoteForm.jsx**: khi tạo
Debit Note "Phí dịch vụ" → lấy đúng dòng từ vùng "Cước dịch vụ"; "Phí chi hộ" → lấy đúng dòng từ vùng
"Chi hộ" — API `/debit-notes/suggest-lines?loai=` ĐÃ làm đúng việc này ở backend (lọc theo
charge_type), agent sau chỉ cần **sửa bug ở mục 1** (đổi Loại phải re-fetch/tự động lấy đúng dòng),
không cần sửa logic lọc.

## 3. Đề xuất kiến trúc cho agent sau (không bắt buộc theo đúng 100%, nhưng nên theo hướng này)

### 3a. Danh mục "Cước dịch vụ" (mới)
- Bảng mới `service_charge_catalog` (đặt tên tương tự `fee_types` đã có ở `catalog.js`/`schema.sql`):
  `id, name (unique), don_vi_tinh, don_gia_mac_dinh (nullable), created_at`. Không cần `charge_type`
  trong danh mục — mọi dòng chọn từ danh mục này khi thêm vào vùng "Cước dịch vụ" thì mặc định
  `charge_type = 'SERVICE'` (agent sau tự quyết định: có cho phép danh mục này áp dụng cho cả
  ADJUSTMENT/DISCOUNT không — Senior CHƯA yêu cầu tách riêng 2 loại đó, chỉ nói "2 vùng": Dịch vụ /
  Chi hộ. Đơn giản nhất: Cước dịch vụ -> SERVICE cố định, Chi hộ -> DISBURSEMENT cố định, để
  ADJUSTMENT/DISCOUNT lại cho agent sau quyết (có thể thêm 1 checkbox nhỏ "Điều chỉnh/Chiết khấu"
  trong vùng Cước dịch vụ nếu Senior cần, KHÔNG bắt buộc phải làm ngay).
- Backend: thêm route CRUD trong `backend/src/routes/catalog.js` (theo đúng pattern các danh mục
  khác đã có ở file này — vd `fee_types`, `voucher_categories`) — `GET/POST/PUT/DELETE
  /catalog/service-charges` (đặt tên route tuỳ agent, miễn nhất quán).
- Migration: thêm bảng mới vào `schema.sql` (cho DB mới) + `db.js` KHÔNG cần `ensureColumn` vì là
  bảng mới hoàn toàn — dùng `CREATE TABLE IF NOT EXISTS` ngay trong `schema.sql`, `db.js` chỉ cần
  đảm bảo file schema được exec khi khởi động (xem cách các bảng khác trong `schema.sql` được tạo).
- Frontend: có thể thêm 1 tab mới trong màn "Danh mục" (`Catalog.jsx` hiện có — xem file này đang
  quản lý Khách hàng/NCC/Loại phí/Danh mục thu-chi khác/Quỹ) để Senior tự thêm/sửa/xoá các dòng
  "Cước dịch vụ thường dùng", **hoặc** đơn giản hơn: cho phép tạo mới NGAY TẠI Select trong
  `CustomerChargesTab` (antd `Select` với `mode` custom cho phép gõ thêm option mới rồi tự POST vào
  danh mục — giống UX "tạo mã hàng nhanh" trong MISA khi đang nhập chứng từ). Senior không yêu cầu
  cụ thể phải có màn Danh mục riêng, nên ưu tiên phương án tại chỗ (nhanh, đỡ phải thêm màn mới) trừ
  khi Senior phản hồi muốn có màn quản lý riêng.

### 3b. `CustomerChargesTab` (`frontend/src/pages/ShipmentForm.jsx`) — tách 2 vùng
- Đổi 1 bảng hiện tại thành 2 bảng con, MỖI bảng lọc `lines.filter(l => l.charge_type === 'SERVICE' /* hoặc != 'DISBURSEMENT' nếu vẫn muốn gộp ADJUSTMENT/DISCOUNT vào vùng Dịch vụ */)`
  và `lines.filter(l => l.charge_type === 'DISBURSEMENT')`, nhưng **state `lines` vẫn là 1 mảng DUY
  NHẤT** (giữ nguyên cách lưu xuống `PUT /shipments/:id/customer-charges` — API này không đổi, vẫn
  nhận `lines: [...]` phẳng, mỗi dòng tự mang `charge_type`). Chỉ tách UI hiển thị + nút "Thêm dòng"
  thành 2 nút riêng (1 nút thêm dòng SERVICE dùng Select danh mục, 1 nút thêm dòng DISBURSEMENT dùng
  Input tự do y như cũ) — KHÔNG cần đổi payload gửi backend.
- Xoá cột "Charge Type" (dropdown) khỏi bảng "Cước dịch vụ" (đã cố định = SERVICE) — GIỮ trường này
  ẩn/mặc định trong data, không hiển thị cho Senior chọn nữa ở vùng này. Bảng "Chi hộ" tương tự,
  không cần cột Charge Type (cố định = DISBURSEMENT), y hệt UI hiện tại (bỏ đúng 1 cột).
- Cột "Description" ở vùng Cước dịch vụ đổi từ `<Input>` tự do sang `<Select showSearch
  options={danhMucCuocDichVu} ...>`, có thể kèm nút nhỏ "+ Thêm vào danh mục" nếu Senior gõ tên mới
  chưa có trong danh mục (tương tự UX MISA).

### 3c. `DebitNoteForm.jsx` — sửa bug mục 1 + khớp UX 2 vùng
- **Bắt buộc sửa:** thêm `useEffect` lắng nghe `loaiWatch` đổi (khi ĐANG có `shipmentIdWatch`) để
  tự động gọi lại `pullFromShipment` — hoặc đơn giản hơn: mỗi lần đổi Radio "Loại", `setLines([])` +
  hiện lại nút "Lấy dòng" để Senior chủ động bấm lại (tránh tự động gọi API ngầm gây khó hiểu) — tuỳ
  agent sau chọn UX nào rõ ràng hơn, miễn **không được giữ nguyên state `lines` cũ khi đổi Loại**.
- Backend `/debit-notes/suggest-lines?loai=` GIỮ NGUYÊN, không cần sửa (đã lọc đúng charge_type).

## 4. Việc CHƯA quyết — cần hỏi lại Senior trước khi code (nếu agent sau thấy cần)

- ADJUSTMENT/DISCOUNT thuộc vùng nào trong 2 vùng mới? (đề xuất tạm: gộp vào vùng "Cước dịch vụ",
  ẩn dưới dạng 1 lựa chọn phụ, KHÔNG hiển thị dropdown Charge Type công khai như hiện tại).
- Danh mục "Cước dịch vụ" có cần quản lý riêng ở màn Danh mục (như `fee_types`) hay chỉ cần tạo
  nhanh tại chỗ khi nhập Debit Note (ưu tiên phương án tại chỗ nếu Senior không có ý kiến khác).
- Danh mục có cần đơn giá mặc định để tự điền Đơn giá khi chọn không, hay chỉ tự điền Mô tả/Đơn vị
  tính (Senior tự nhập giá mỗi lần, vì giá bán có thể đổi theo khách hàng/thời điểm)?

## 5. Lưu ý quan trọng cho agent sau

- **KHÔNG đổi lại Domain Model / công thức doanh thu** đã chốt ở đợt trước (`utils/revenue.js`,
  cột `charge_type` trên `shipment_customer_charges`) — đợt này thuần là UI + 1 danh mục mới, dữ
  liệu lưu xuống DB vẫn qua đúng API `PUT /shipments/:id/customer-charges` như cũ.
- Nhớ fix bug mục 1 (`DebitNoteForm.jsx` không re-fetch khi đổi Loại) DÙ CÓ làm redesign 2 vùng hay
  không — đây là bug độc lập, ảnh hưởng dữ liệu thật (Debit Note sai nội dung) nên ưu tiên cao nhất.
- Sau khi sửa xong, nhớ test lại đúng kịch bản Senior đang gặp: tạo/sửa lô hàng CHINH LINH với 3
  dòng Phí hạ (nên là Chi hộ)/Phí CO (Dịch vụ)/Phí nâng (nên là Chi hộ) → xác nhận Debit Note "Phí
  dịch vụ" CHỈ có Phí CO, Debit Note "Phí chi hộ" CHỈ có Phí hạ + Phí nâng.

---



> Đọc file này trước. Đây là bản cập nhật của `AI_HANDOVER.md` trước đó (đợt "tự sinh phiếu thu/chi
> từ Lô hàng v2 + đổi Ghi chú → Nội dung", giữ nguyên nội dung phía dưới — không đụng gì tới cơ chế
> auto-voucher/nội dung tự sinh của đợt đó, chỉ đổi NGUỒN số tiền dùng để tự sinh).

## 1. Bối cảnh — vì sao đợt này cần làm

Sau UAT, Product Owner phát hiện: `shipments.cuoc_dv` ("Cước dịch vụ (Doanh thu)" nhập tay trên
Shipment Form) là **dữ liệu trùng lặp** với Customer Charges (tab "Debit Note (thu khách)") — thực
tế cước dịch vụ gồm nhiều khoản (phí khai HQ, C/O, chứng từ, vận chuyển, handling, AMS/AFR/ENS...),
tất cả đã nhập ở Customer Charges. Nếu Senior sửa Customer Charges mà quên sửa `cuoc_dv`, doanh thu
hiển thị sai. 2 mẫu Debit Note PDF gốc Senior gửi (PHÍ DỊCH VỤ HẢI QUAN / PHÍ CHI HỘ) xác nhận đúng
mô hình này — mỗi mẫu là 1 nhóm khoản riêng, không phải 1 con số "cước dịch vụ" duy nhất.

**Quyết định:** `shipments.cuoc_dv` bị loại bỏ khỏi MỌI công thức tính toán trong toàn hệ thống.
Doanh thu từ nay LUÔN = `SUM(shipment_customer_charges.don_gia * so_luong)` — xem
`backend/src/utils/revenue.js` (file mới, dùng chung giữa `routes/shipments.js` và
`routes/reports.js`).

## 2. Domain Model mới

- **Customer Charges** (`shipment_customer_charges`) = nguồn dữ liệu DUY NHẤT cho toàn bộ khoản thu
  khách (doanh thu). Mỗi dòng có thêm cột `charge_type` (SERVICE / DISBURSEMENT / ADJUSTMENT /
  DISCOUNT) để phục vụ báo cáo và lọc Debit Note.
- **Supplier Costs** (`shipment_charges`) = nguồn dữ liệu DUY NHẤT cho khoản chi — không đổi.
- **Debit Note** = chứng từ SINH RA từ Customer Charges (đã lọc theo `charge_type`), không phải
  nguồn dữ liệu — không đổi kiến trúc, chỉ thêm bộ lọc.
- `shipments.cuoc_dv` = cột DEPRECATED, giữ lại trong DB để tương thích dữ liệu cũ, không đọc/ghi từ
  Shipment Form nữa, không dùng cho bất kỳ phép tính nào.

## 3. Danh sách file đã sửa

```
backend/src/utils/revenue.js         MỚI — revenueExpr()/disbursementExpr() (SQL fragment dùng
                                       trong correlated subquery) + sumCustomerCharges()/
                                       sumDisbursement() (bind-param, dùng khi cần 1 shipmentId cụ
                                       thể, vd auto-voucher). Đây LÀ nơi định nghĩa công thức doanh
                                       thu — nếu sau này cần đổi công thức, chỉ sửa ở đây.
backend/src/schema.sql               shipments.cuoc_dv: thêm comment DEPRECATED (không đổi kiểu dữ
                                       liệu, không xoá cột); shipment_customer_charges: thêm cột
                                       charge_type (CHECK IN SERVICE/DISBURSEMENT/ADJUSTMENT/
                                       DISCOUNT), default 'SERVICE'
backend/src/db.js                    ensureColumn cho charge_type (DB cũ), default 'SERVICE' cho
                                       toàn bộ dòng cũ (không tự suy luận DISBURSEMENT — xem mục 5)
backend/src/routes/shipments.js      copyChargesToCustomerCharges: set charge_type theo la_chi_ho
                                       lúc copy lần đầu; getShipmentFull + GET / (list): doanh_thu =
                                       sumCustomerCharges/revenueExpr thay vì cuoc_dv+tong_chi_ho;
                                       regenerateAutoVouchers: đổi param cuocDv -> revenueAmount,
                                       lấy từ sumCustomerCharges(shipmentId) ở cả POST và PUT (số
                                       tiền phiếu thu tự sinh khi tick "Đã thu?" giờ đúng SSOT);
                                       PUT/GET customer-charges: đọc/ghi charge_type
                                       (normalizeChargeType chặn giá trị rác)
backend/src/routes/reports.js        cong-no-kh, cong-no-kh/:id/chi-tiet, cong-no-kh/:id/theo-thang,
                                       doanh-thu, dashboard: TOÀN BỘ đổi sang đọc revenueExpr/
                                       disbursementExpr từ Customer Charges thay vì cuoc_dv/
                                       shipment_charges.la_chi_ho. Breakdown "by_type" trong
                                       /doanh-thu đổi từ nhóm theo shipment_charges.loai_phi sang
                                       nhóm theo shipment_customer_charges.mo_ta (đúng nguyên tắc
                                       "báo cáo đọc từ Customer Charges"). Field `cuoc_dv` trong các
                                       response GIỮ NGUYÊN TÊN (để đỡ sửa frontend) nhưng đổi Ý NGHĨA
                                       thành "phần Customer Charges KHÔNG phải DISBURSEMENT"
                                       (= doanh_thu - chi_ho), không còn là cột shipments.cuoc_dv.
backend/src/routes/debit-notes.js    THÊM route GET /debit-notes/suggest-lines?shipment_id=&loai=
                                       — trả dòng Customer Charges đã lọc đúng charge_type theo loại
                                       Debit Note (dich_vu->SERVICE, chi_ho->DISBURSEMENT), route
                                       này đặt TRƯỚC GET /:id để không bị nuốt route.
frontend/src/pages/ShipmentForm.jsx  Bỏ hẳn Form.Item "Cước dịch vụ (Doanh thu)" (name=cuoc_dv) +
                                       logic autofill default_cuoc_dv theo khách hàng; thêm state
                                       savedDoanhThu (lấy từ GET /shipments/:id khi Sửa); "Doanh thu
                                       dự kiến" = savedDoanhThu (Sửa) hoặc tongChiPhi (Tạo mới, ước
                                       tính theo hành vi copy 1:1 lúc Lưu lần đầu); CustomerChargesTab
                                       thêm cột "Charge Type" (Select 4 giá trị) + gửi/nhận đúng field
                                       khi Lưu/Tải.
frontend/src/pages/Shipments.jsx     Cột "Cước DV (Doanh thu)" đổi dataIndex cuoc_dv -> doanh_thu
frontend/src/pages/CongNoKH.jsx      onShipmentPick: số tiền lấy s.doanh_thu (SSOT) thay vì tự cộng
                                       s.cuoc_dv + s.tong_chi_ho ở frontend
frontend/src/pages/Vouchers.jsx      onShipmentPick (nhánh Thu): tương tự CongNoKH.jsx
frontend/src/pages/DebitNoteForm.jsx pullFromShipment: gọi GET /debit-notes/suggest-lines?loai=...
                                       thay vì GET /shipments/:id/customer-charges (không lọc) —
                                       Debit Note "Phí dịch vụ" chỉ kéo SERVICE, "Phí chi hộ" chỉ
                                       kéo DISBURSEMENT
```

## 4. Đã build/test thật

`git clone` mới → đọc code thật → sửa → `npm install` (frontend, backend node_modules đã có sẵn
trong repo) → `npm run build` (vite) pass không lỗi, không warning mới ngoài cảnh báo bundle size
có sẵn từ trước → xoá `data.db` cũ → `node src/seed.js` → chạy `node src/server.js` nền → test bằng
`curl` theo đúng số liệu 2 mẫu PDF Debit Note Senior gửi (Phí khai HQ 1.500.000 + Phí vận chuyển
3.200.000 = SERVICE 4.700.000; Phí nâng Cont 1.650.000 + Lệ phí HQ 2×20.000 = DISBURSEMENT
1.690.000):
- `POST /shipments` (copy 1:1 từ Cost) → `doanh_thu = 6.390.000` (đúng tổng 4 dòng chi phí) ✅.
- `PUT /shipments/:id/customer-charges` (sửa đơn giá + gắn `charge_type` đúng thật) → `GET
  /shipments/:id` → `doanh_thu = 6.390.000` (SUM don_gia*so_luong, không gồm VAT) ✅, list
  `GET /shipments` trả đúng field `doanh_thu` cho mọi dòng ✅.
- `GET /debit-notes/suggest-lines?loai=dich_vu` → chỉ 2 dòng SERVICE (4.700.000) ✅; `loai=chi_ho`
  → chỉ 2 dòng DISBURSEMENT (1.690.000) ✅.
- `POST /debit-notes` (loai=dich_vu, lines lấy từ suggest-lines) → `tong.thanh_tien = 4.700.000` ✅.
- `PUT /shipments/:id` với `cuoc_thu_ngay=true` (KHÔNG đụng Customer Charges vì PUT không sửa bảng
  này) → phiếu thu tự sinh (`customer_receipts`, `auto_generated=1`) có `so_tien = 6.390.000` — đúng
  SSOT dù `cuoc_dv` không được gửi lên (mặc định 0, không dùng) ✅.
- `GET /reports/cong-no-kh` → `cuoc_dv=4.700.000` (SERVICE), `chi_ho=1.690.000` (DISBURSEMENT),
  `phai_thu=6.390.000` (cộng đúng bằng tổng Customer Charges) ✅.
- `GET /reports/doanh-thu` → `tong.doanh_thu=6.390.000`, `by_type` liệt kê đúng 4 khoản theo `mo_ta`
  ✅. `GET /reports/dashboard` → `doanh_thu=6.390.000` ✅.
- Dọn `data.db`/`node_modules`/`dist` khỏi gói giao cho Senior sau khi test xong.

## 5. Backward compatibility & rủi ro nếu đã có dữ liệu production

- **`shipments.cuoc_dv`**: cột vẫn còn trong DB, KHÔNG bị xoá, KHÔNG còn được đọc ở bất kỳ đâu. An
  toàn tuyệt đối — không mất dữ liệu, chỉ là cột "chết" từ nay.
- **`shipment_customer_charges.charge_type`**: ALTER TABLE thêm cột mới, mặc định `'SERVICE'` cho
  TOÀN BỘ dòng cũ đã có (kể cả những dòng vốn là "chi hộ" trên thực tế — vì `source_charge_id` KHÔNG
  phải khoá đồng bộ ổn định, đã ghi rõ trong `AI_HANDOVER.md` bản trước: mỗi lần Sửa lô hàng,
  `shipment_charges` bị xoá/insert lại với id MỚI, nên không thể tin cậy suy ngược `la_chi_ho` từ
  `source_charge_id` cho dữ liệu cũ). **Senior CẦN vào tab "Debit Note (thu khách)" của các lô hàng
  cũ có khoản chi hộ, tự đổi lại Charge Type từ "Dịch vụ" sang "Chi hộ" cho đúng dòng** — nếu không,
  báo cáo "Công nợ KH" và "Doanh thu" (cột `cuoc_dv`/`chi_ho` breakdown) sẽ tạm thời gộp hết vào
  SERVICE cho tới khi Senior sửa lại. Tổng `phai_thu`/`doanh_thu` (SUM toàn bộ Customer Charges)
  KHÔNG bị ảnh hưởng — chỉ breakdown theo loại bị sai tạm thời.
- **Lô hàng CHƯA từng mở tab "Debit Note (thu khách)"** (tạo trước khi tính năng Customer Charges ra
  đời, chưa lazy-copy): `revenueExpr`/`disbursementExpr` có fallback đọc tạm từ `shipment_charges`
  (Cost) để không bị "mất" doanh thu trên list/báo cáo — fallback này CHỈ ĐỌC, không ghi gì, và tự
  hết tác dụng ngay khi lô hàng có dòng Customer Charges thật (mở tab 1 lần là đủ).
- **Không có migration nào xoá hay chuyển đổi dữ liệu hiện có** — toàn bộ thay đổi DB chỉ là
  `ALTER TABLE ADD COLUMN` (an toàn, chạy lại nhiều lần được, `ensureColumn` tự kiểm tra cột đã tồn
  tại chưa). Backup DB trước khi restart theo đúng quy tắc đã chốt từ trước, dù rủi ro thấp.
- **`customers.default_cuoc_dv`** (Danh mục KH) vẫn còn trong DB/Catalog nhưng KHÔNG còn được dùng ở
  đâu (trước đây dùng để autofill `cuoc_dv` lúc chọn khách hàng, nay ô đó đã bị bỏ). Không xoá field
  này (out of scope đợt này) — nếu Senior muốn dọn hẳn, cần bàn riêng vì đụng tới Catalog UI.

## 6. Việc CHƯA làm / cần bàn tiếp

- ADJUSTMENT/DISCOUNT chưa có UI báo cáo riêng — hiện tại 2 loại này chỉ ảnh hưởng đúng vào tổng
  `doanh_thu` chung (SUM toàn bộ Customer Charges), không có cột breakdown riêng ở `cong-no-kh`
  (đang gộp vào "Cước DV" cùng SERVICE). Nếu Senior cần tách riêng, cần bàn thêm cấu trúc báo cáo.
  Invoice/Credit Note/Customer Receivables (roadmap mở rộng Senior nêu) chưa động tới — Domain Model
  hiện tại (Customer Charges phẳng theo shipment_id, không qua bảng header) đã tính sẵn cho việc này
  không cần đổi DB, theo đúng nguyên tắc đưa ra.

---

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
