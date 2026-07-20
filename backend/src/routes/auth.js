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
    .prepare(`SELECT id, username, password_hash, full_name FROM users WHERE username = ?`)
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
    user: { id: user.id, username: user.username, fullName: user.full_name },
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

// GET /api/auth/me — kiểm tra token hiện tại còn hợp lệ không (dùng khi load lại trang)
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare(`SELECT id, username, full_name FROM users WHERE id = ?`)
    .get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  res.json({ user: { id: user.id, username: user.username, fullName: user.full_name } });
});

module.exports = router;
