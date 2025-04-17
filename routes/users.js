const express = require('express');
const router = express.Router();
const pool = require('../db');
const { generateToken, comparePassword, authenticateToken, checkRole } = require('../middlewares/auth');
const bcrypt = require('bcryptjs');

// تسجيل مستخدم جديد
router.post('/register', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, role]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    const isMatch = await comparePassword(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user.id, user.role);
    res.json({ token });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// تحديث بيانات المستخدم
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;
    
    // التحقق من الصلاحيات
    if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    let hashedPassword;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }
    
    const result = await pool.query(
      `UPDATE users SET 
      username = COALESCE($1, username), 
      password_hash = COALESCE($2, password_hash), 
      role = COALESCE($3, role) 
      WHERE id = $4 RETURNING *`,
      [username || null, hashedPassword || null, role || null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// حذف مستخدم (للمشرف فقط)
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;