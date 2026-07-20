const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('./db'); // đảm bảo schema được khởi tạo

const catalogRoutes = require('./routes/catalog');
const shipmentRoutes = require('./routes/shipments');
const voucherRoutes = require('./routes/vouchers');
const reportRoutes = require('./routes/reports');
const debitNoteRoutes = require('./routes/debit-notes');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.use(cors());
// Giới hạn mặc định của express.json() là 100kb — không đủ cho ảnh đại diện dạng base64
// (data URL), nên tăng lên 5mb (ảnh gốc đã được FE resize/nén nhỏ trước khi gửi lên).
app.use(express.json({ limit: '5mb' }));

// Route công khai, không cần đăng nhập (phải khai báo TRƯỚC middleware requireAuth bên dưới).
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Từ đây trở đi, mọi route /api/* đều bắt buộc phải có token đăng nhập hợp lệ.
app.use('/api', requireAuth);

app.use('/api', catalogRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/debit-notes', debitNoteRoutes);

// Phục vụ luôn frontend đã build (nếu có) để chỉ cần chạy 1 server duy nhất
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend chạy tại http://localhost:${PORT}`);
});
