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

// GET /api/auth/me — kiểm tra token hiện tại còn hợp lệ không (dùng khi load lại trang)
router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare(`SELECT id, username, full_name FROM users WHERE id = ?`)
    .get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  res.json({ user: { id: user.id, username: user.username, fullName: user.full_name } });
});

module.exports = router;
