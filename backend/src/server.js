const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('./db'); // đảm bảo schema được khởi tạo

const catalogRoutes = require('./routes/catalog');
const shipmentRoutes = require('./routes/shipments');
const voucherRoutes = require('./routes/vouchers');
const reportRoutes = require('./routes/reports');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', catalogRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

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
