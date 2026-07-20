const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }

  const user = db
    .prepare(`SELECT id, username, password_hash, full_name, avatar_url FROM users WHERE username = ?`)
    .get(username.trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, avatarUrl: user.avatar_url },
  });
});

// POST /api/auth/change-password — đổi mật khẩu cho tài khoản đang đăng nhập.
// Đặt requireAuth trực tiếp ở route này (không phải cả router) vì /api/auth/* được mount TRƯỚC
// middleware requireAuth chung ở server.js (để /login và /me hoạt động không cần token cũ).
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  const user = db
    .prepare(`SELECT id, password_hash FROM users WHERE id = ?`)
    .get(req.user.sub);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  }
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, user.id);

  res.json({ ok: true });
});

// Giới hạn kích thước avatar lưu trong DB (data URL base64) — ảnh gốc thường nặng hơn base64
// khoảng 1.37 lần, 3MB base64 ~ đủ cho ảnh vuông ~500x500 nén JPEG/PNG chất lượng vừa phải.
const MAX_AVATAR_LENGTH = 3 * 1024 * 1024;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;

// POST /api/auth/avatar — đổi ảnh đại diện cho tài khoản đang đăng nhập.
// Nhận avatarUrl dạng data URL base64 (FE tự resize/nén ảnh trước khi gửi lên), lưu thẳng vào
// cột users.avatar_url — không cần thư mục upload riêng trên server.
router.post('/avatar', requireAuth, (req, res) => {
  const { avatarUrl } = req.body || {};
  if (!avatarUrl || typeof avatarUrl !== 'string') {
    return res.status(400).json({ error: 'Vui lòng chọn ảnh đại diện' });
  }
  if (!AVATAR_DATA_URL_RE.test(avatarUrl)) {
    return res.status(400).json({ error: 'Ảnh không đúng định dạng (chỉ hỗ trợ PNG/JPEG/WEBP/GIF)' });
  }
  if (avatarUrl.length > MAX_AVATAR_LENGTH) {
    return res.status(400).json({ error: 'Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn (tối đa ~2MB)' });
  }

  db.prepare(`UPDATE users SET avatar_url = ? WHERE id = ?`).run(avatarUrl, req.user.sub);
  res.json({ ok: true, avatarUrl });
});

// DELETE /api/auth/avatar — gỡ ảnh đại diện, quay về icon mặc định.
router.delete('/avatar', requireAuth, (req, res) => {
  db.prepare(`UPDATE users SET avatar_url = NULL WHERE id = ?`).run(req.user.sub);
  res.json({ ok: true });
});

// GET /api/auth/me — kiểm tra token hiện tại còn hợp lệ không (dùng khi load lại trang)
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare(`SELECT id, username, full_name, avatar_url FROM users WHERE id = ?`)
    .get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  res.json({ user: { id: user.id, username: user.username, fullName: user.full_name, avatarUrl: user.avatar_url } });
});

module.exports = router;
