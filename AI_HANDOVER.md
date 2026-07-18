# AI HANDOVER — App Quản lý Giao nhận / Khai báo Hải quan (đợt "phiếu thu/chi khác + công nợ kiểu Excel + NCC chi hộ")

> Đọc file này trước, không cần đọc lại lịch sử chat cũ. Đây là bản cập nhật của
> `AI_HANDOVER.md` trước đó (đợt "phiếu thu/chi + tách chi hộ NCC + doanh thu chi tiết + search").
> Bối cảnh/stack/schema cũ ở các mục không nhắc tới dưới đây giữ nguyên.

## 1. Đã `git clone` mới, đọc code thật trước khi sửa — đúng như handover trước ghi lại

Kiểm tra lại đúng như bản trước cảnh báo: `CongNoKH.jsx`/`CongNoNCC.jsx` trên GitHub lần này
**đã khớp** hành vi "theo-thang" (không bị lệch bản như đợt trước) — nên đợt này code thẳng lên
trên nền đó, không cần viết lại từ đầu.

## 2. Yêu cầu Senior đưa ra đầu phiên này — đã xử lý hết

1. **Tiếp tục các việc "chưa làm" trong handover trước.** Trong đó, việc quan trọng nhất — "sửa
   lô hàng không đồng bộ lại phiếu thu/chi tự sinh" — được xử lý bằng cách **bỏ hẳn cơ chế tự
   sinh phiếu** (xem mục 3), không còn nguy cơ lệch số nữa. "Dashboard hiển thị `data.quy[]`"
   hoá ra đã có sẵn trên GitHub từ trước (không cần sửa gì thêm ở đợt này).
2. **Bảng công nợ KH/NCC theo đúng kiểu bảng Excel Senior gửi** — bảng "theo tháng" trong Drawer
   giờ có thêm:
   - Cột **"Ghi chú"** — ô nhập chú thích tự do cho từng dòng tháng (giống các dòng như
     "TT tiền hàng + chi hộ ngày 14/01/2026" trong Excel gốc), click vào chữ để sửa, tự lưu khi
     rời ô (không cần nút Lưu riêng).
   - Cột **"Nợ xấu"** — 1 cái Tag bấm vào để đánh dấu/bỏ đánh dấu dòng tháng đó là nợ xấu; dòng
     được đánh dấu sẽ **tô đỏ nhạt cả dòng**, giống cách Excel gốc tô đỏ ô "Nợ xấu" của AFM.
   - Bảng giờ có viền (`bordered`) và dòng **"Tổng nợ phải thu/phải trả"** được tô **vàng nhạt**
     đậm chữ — giống hàng tổng màu vàng trong Excel gốc.
   - Backend: bảng mới `cong_no_notes` (doi_tuong_type: 'kh'|'ncc', doi_tuong_id, month_key,
     ghi_chu, la_no_xau) — 1 dòng cho mỗi (khách hàng/NCC, tháng). Endpoint mới:
     `PUT /api/reports/cong-no-kh/:customer_id/notes/:month_key` và
     `PUT /api/reports/cong-no-ncc/:supplier_id/notes/:month_key`, body `{ ghi_chu, la_no_xau }`.
     `GET .../theo-thang` giờ trả kèm `ghi_chu`/`la_no_xau` cho mỗi dòng tháng.
3. **Phiếu thu/chi không nhất thiết là thu KH / chi NCC** — đây là thay đổi lớn nhất đợt này:
   - Bảng `customer_receipts`/`supplier_payments` giờ có thêm cột `category_id` (tham chiếu bảng
     mới `voucher_categories`), và `customer_id`/`supplier_id` giờ **cho phép NULL**. Một phiếu
     thu/chi bây giờ PHẢI có đúng 1 trong 2: hoặc gắn khách hàng/NCC, hoặc gắn 1 "danh mục khác"
     (ví dụ "Chi in hồ sơ", "Chi mua văn phòng phẩm", "Chi tiếp khách", "Chi xăng xe", "Chi
     lương/thưởng", "Chi thuê văn phòng", "Chi khác", "Thu khác" — đã seed sẵn, Senior có thể
     thêm/sửa/xoá tại **Danh mục > Danh mục thu khác / Danh mục chi khác** — 2 tab mới trong
     `Catalog.jsx`).
   - Màn **Phiếu thu / chi** (`Vouchers.jsx`) đổi tên 2 tab thành "Phiếu thu" / "Phiếu chi"
     (bỏ chữ "khách hàng"/"nhà cung cấp" vì giờ không nhất thiết gắn đối tượng đó nữa). Trong
     modal Tạo/Sửa phiếu có thêm 1 Radio chọn "Loại đối tượng": **Khách hàng/Nhà cung cấp** hay
     **Thu khác/Chi khác** — chọn xong mới hiện dropdown tương ứng (Select khách hàng/NCC, hoặc
     Select danh mục khác). Cột "Đối tượng" trong bảng liệt kê hiển thị tên danh mục kèm chữ
     *(khác)* màu xám nếu là phiếu loại này, để phân biệt nhanh với phiếu thu/chi thường.
   - **Quan trọng khi migrate DB cũ của Senior**: SQLite không hỗ trợ bỏ NOT NULL bằng ALTER
     COLUMN, nên `db.js` tự làm: đổi tên bảng `customer_receipts`/`supplier_payments` cũ ->
     `_old_migrate`, để `schema.sql` tạo bảng mới (nullable + có `category_id`) -> copy dữ liệu
     cũ qua bảng mới -> xoá bảng tạm. Đã test bằng cách chạy migrate 2 lần liên tiếp trên cùng 1
     `data.db` (idempotent, không lỗi, không mất dữ liệu) — an toàn để Senior chỉ cần copy đè
     code, KHÔNG cần xoá `data.db` hiện tại.
4. **Chưa tự sinh phiếu thu/chi từ lô hàng nữa (quyết định dứt điểm mục "chưa làm" đợt trước)**:
   - Bỏ hẳn: khi tick "Đã thu cước ngay" hoặc dòng chi phí tick "Đã thanh toán?" KHÔNG còn tự
     tạo `customer_receipts`/`supplier_payments` khi lưu lô hàng (cả tạo mới và sửa).
   - `ShipmentForm.jsx`: bỏ checkbox "Đã thu cước ngay (tự tạo phiếu thu)". Ô "Quỹ thu cước" đổi
     tên thành "Quỹ thu cước (dự kiến)" — chỉ để ghi nhớ, có tooltip giải thích không tự tạo
     phiếu. Cột "Đã thanh toán?" trong bảng chi phí có phụ đề nhỏ "(chỉ đánh dấu, không tự tạo
     phiếu chi)". Thêm 1 dòng chữ nhắc ngay dưới bảng chi phí: phải vào màn "Phiếu thu / chi" để
     tạo phiếu thật (có thể chọn "Lô hàng liên kết" để gắn về đúng lô).
   - Backend `shipments.js`: bỏ toàn bộ code tự `INSERT INTO customer_receipts`/`supplier_payments`
     trong route POST (route PUT trước đó đã không tự sinh nên không cần sửa). `getShipmentFull`
     giờ trả kèm `linked_receipts`/`linked_payments` (phiếu thu/chi nào đã gắn `shipment_id` này)
     để nếu sau này cần hiển thị lại trên trang chi tiết lô hàng thì đã có sẵn dữ liệu.
5. **Cho phép chọn (và thêm nhanh) nhà cung cấp cho các khoản chi hộ**:
   - Cột "Nhà cung cấp" trong bảng chi phí của `ShipmentForm.jsx` giờ có ô nhập nhỏ + nút "Thêm"
     ngay dưới danh sách dropdown — gõ tên NCC mới (ví dụ 1 nhà xe chưa có trong danh mục) rồi
     bấm "Thêm" hoặc Enter là tạo NCC mới ngay (gọi `POST /api/suppliers`) và tự chọn luôn NCC đó
     cho dòng chi phí đang sửa — không cần rời màn hình qua trang Danh mục.
   - (Trước đó ô "Nhà cung cấp" vốn đã áp dụng cho MỌI dòng chi phí kể cả chi hộ, không bị giới
     hạn theo loại phí — chỉ là danh mục NCC hay thiếu các "nhà xe" lặt vặt nên bổ sung tính năng
     thêm nhanh này cho tiện, không phải sửa lỗi chặn chọn NCC.)

## 3. Danh sách file đã sửa/thêm ở đợt này (đóng gói trong `logistic-accounting-fixes.zip`)

```
backend/src/schema.sql               customer_receipts/supplier_payments nullable owner + category_id,
                                       thêm bảng voucher_categories, cong_no_notes
backend/src/db.js                    migration đổi bảng cũ -> nullable (an toàn chạy lại nhiều lần),
                                       tự seed danh mục thu/chi khác mặc định cho DB cũ
backend/src/seed.js                  thêm seed voucher_categories (7 mục chi khác + 1 mục thu khác)
backend/src/routes/catalog.js        thêm CRUD /api/voucher-categories?type=thu|chi
backend/src/routes/vouchers.js       viết lại: receipts/payments hỗ trợ category_id thay cho
                                       customer_id/supplier_id bắt buộc; validate phải có 1 trong 2
backend/src/routes/shipments.js      BỎ toàn bộ tự sinh phiếu thu/chi khi tạo lô hàng; getShipmentFull
                                       trả thêm linked_receipts/linked_payments
backend/src/routes/reports.js        thêm ghi_chu/la_no_xau vào theo-thang (KH+NCC) từ bảng cong_no_notes,
                                       thêm 2 endpoint PUT .../notes/:month_key
frontend/src/pages/ShipmentForm.jsx  bỏ checkbox "Đã thu cước ngay"; thêm quick-add NCC ngay trong
                                       dòng chi phí; ghi chú rõ không tự tạo phiếu thu/chi
frontend/src/pages/Vouchers.jsx      viết lại: đổi tên tab "Phiếu thu"/"Phiếu chi", thêm Radio chọn
                                       Khách hàng/NCC hay Danh mục khác, cột "Đối tượng" hiển thị
                                       tên danh mục khi là phiếu "khác"
frontend/src/pages/Catalog.jsx       thêm 2 tab "Danh mục thu khác" / "Danh mục chi khác"
frontend/src/pages/CongNoKH.jsx      bảng theo-thang thêm cột Ghi chú (editable) + Nợ xấu (tag bấm
                                       tô đỏ dòng), bordered, dòng tổng tô vàng
frontend/src/pages/CongNoNCC.jsx     tương tự CongNoKH nhưng cho NCC
frontend/src/index.css               thêm class .row-no-xau (đỏ nhạt) và .row-tong-cong-no (vàng nhạt)
```

Cách bàn giao: giải nén `logistic-accounting-fixes.zip` đè trực tiếp lên đúng đường dẫn tương ứng
trong repo của Senior — **không cần xoá `data.db` hiện tại**, migration tự chạy khi server khởi
động lần đầu sau khi copy code mới. Sau khi copy đè, chạy lại đúng quy trình cũ:
`cd backend && npm install (nếu cần) && cd ../frontend && npm run build && cd ../backend && npm run start` (hoặc `pm2 restart all` nếu đang chạy trên VPS).

Đã build/test thật ở đợt này: `git clone` mới -> sửa -> chạy `node src/server.js` nền, gọi `curl`
vào từng endpoint mới/sửa (tạo phiếu thu/chi kiểu "khác" không gắn KH/NCC, tạo lô hàng kiểm tra
không còn phiếu tự sinh, lưu/đọc ghi chú công nợ theo tháng, quick-add NCC) -> `npm run build`
(vite) pass không lỗi -> dọn `data.db`/`node_modules`/`dist` khỏi gói giao cho Senior.

## 4. Việc CHƯA làm / cần bàn tiếp — quan trọng cho phiên sau

- **Trang chi tiết lô hàng chưa hiển thị `linked_receipts`/`linked_payments`** — backend đã trả
  sẵn (xem mục 2.4), nhưng `ShipmentForm.jsx` (màn sửa lô hàng) chưa render danh sách này để
  Senior biết lô hàng đã có phiếu thu/chi nào gắn vào chưa. Nên thêm 1 bảng nhỏ đọc-only ở cuối
  trang sửa lô hàng, mỗi dòng có link/nút nhảy sang màn Phiếu thu/chi để sửa nếu cần.
- **Export báo cáo Excel/PDF** vẫn chưa có (đã ghi từ các bản trước) — ưu tiên gợi ý vẫn là
  Doanh thu chi tiết và Công nợ theo tháng (giờ bảng công nợ càng giống Excel gốc hơn nên xuất
  Excel sẽ tự nhiên, gần như chỉ cần map đúng cột).
- **"Nợ xấu" mới chỉ là cờ đánh dấu tay** (Senior tự bấm), chưa có ngưỡng tự động (ví dụ tự đánh
  dấu nợ xấu nếu quá X tháng chưa thu) — có thể cần nếu Senior muốn tự động hoá thêm.
- **Bundle frontend vẫn ~1.3MB JS sau build** — vite vẫn cảnh báo, chưa cấp thiết ở giai đoạn MVP.
- Các mục "chưa làm" từ các bản gốc trước vẫn còn nguyên: import Excel cũ, đăng nhập/phân quyền,
  validate trùng tờ khai, deploy VPS thật.

## 5. Stack kỹ thuật, cấu trúc thư mục — không đổi so với bản trước

Node.js + Express + `node:sqlite`, React/Vite + Ant Design 5, `backend/` + `frontend/` tách 2
thư mục con ở gốc repo, migration qua `ensureColumn()`/các hàm migrate riêng trong `db.js`. Đợt
này đổi schema thật (không chỉ thêm cột đơn giản) — xem mục 2.3 và mục 3 để hiểu rõ cơ chế
migrate 2 bảng `customer_receipts`/`supplier_payments`.

## 6. Phong cách làm việc với Senior — giữ nguyên

- Senior là dev/tech lead, giao tiếp tiếng Việt, làm việc trên Windows (PowerShell / Git Bash).
- Ưu tiên: giao **file sẵn sàng chạy** kèm hướng dẫn copy/paste rõ ràng.
- Luôn `git clone` mới trước khi sửa, và luôn build/test thật (`npm run build`, chạy server thật
  + `curl` gọi API so số) trước khi bàn giao — đã áp dụng đầy đủ ở đợt này.
