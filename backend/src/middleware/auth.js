const jwt = require('jsonwebtoken');

// Lưu ý: nên đặt biến môi trường JWT_SECRET khi chạy production (VD: trong file .env hoặc
// biến môi trường của server). Nếu không có, dùng giá trị mặc định này để không chặn Senior
// dùng thử ngay, nhưng KHÔNG an toàn nếu public server ra internet.
const JWT_SECRET = process.env.JWT_SECRET || 'logistics-accounting-dev-secret-change-me';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
