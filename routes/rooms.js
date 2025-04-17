const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, checkRole } = require('../middlewares/auth');

// 🔹 الحصول على جميع الغرف مع معلومات المريض والصمام
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.room_number,
        r.floor,
        r.occupied,
        r.created_at,
        r.updated_at,
        p.name as patient_name,
        p.age as patient_age,
        p.doctor_name,
        p.blood_group,
        v.status as valve_status
      FROM rooms r
      LEFT JOIN (
        SELECT DISTINCT ON (room_id) * 
        FROM patients 
        WHERE room_id IS NOT NULL
      ) p ON p.room_id = r.id
      LEFT JOIN valve_status v ON v.room_id = r.id
      ORDER BY r.floor, r.room_number
    `);
    
    res.json({ success: true, rooms: result.rows });
  } catch (err) {
    console.error('Error fetching rooms:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 🔹 الغرف المتاحة فقط
router.get('/available', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, room_number, floor
      FROM rooms
      WHERE occupied = false
      ORDER BY floor, room_number
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No available rooms found' });
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching available rooms:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 🔹 إضافة غرفة جديدة
router.post('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { room_number, floor } = req.body;

    if (!room_number || !floor) {
      return res.status(400).json({ error: 'Room number and floor are required' });
    }

    const result = await pool.query(
      `INSERT INTO rooms (room_number, floor, occupied, created_at, updated_at)
       VALUES ($1, $2, false, NOW(), NOW()) 
       RETURNING *`,
      [room_number, floor]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Room already exists' });
    }
    console.error('Error adding room:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 🔹 تحديث بيانات غرفة
router.put('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { room_number, floor, occupied } = req.body;

    const result = await pool.query(
      `UPDATE rooms 
       SET room_number = $1, 
           floor = $2, 
           occupied = $3,
           updated_at = NOW()
       WHERE id = $4 
       RETURNING *`,
      [room_number, floor, occupied, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating room:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 🔹 حجز غرفة لمريض
router.put('/:id/reserve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({ error: 'Patient ID is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const roomCheck = await client.query(
        'SELECT occupied FROM rooms WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (roomCheck.rows.length === 0 || roomCheck.rows[0].occupied) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Room not available or already occupied' });
      }

      await client.query(
        'UPDATE rooms SET occupied = true, updated_at = NOW() WHERE id = $1',
        [id]
      );

      await client.query(
        'UPDATE patients SET room_id = $1 WHERE id = $2',
        [id, patientId]
      );

      await client.query('COMMIT');
      res.json({ message: 'Room reserved successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error reserving room:', err.message);
      res.status(500).json({ error: 'Server error', details: err.message });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// 🔹 تسجيل خروج مريض
router.post('/:id/checkout', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // استعلام معدل: يبحث عن المريض الموجود في الغرفة بغض النظر عن حالة occupied
    const roomCheck = await client.query(`
      SELECT 
        r.id AS room_id,
        p.id AS patient_id,
        p.name AS patient_name
      FROM rooms r
      LEFT JOIN patients p ON p.room_id = r.id
      WHERE r.id = $1 AND p.room_id IS NOT NULL
      LIMIT 1
      FOR UPDATE`, [id]);

    if (roomCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'لا يوجد مريض مرتبط بهذه الغرفة',
        debug: `تحقق من room_id=${id} في جدول patients`
      });
    }

    const patientId = roomCheck.rows[0].patient_id;

    // تحديث الغرفة والمريض
    await client.query('UPDATE rooms SET occupied = false WHERE id = $1', [id]);
    await client.query('UPDATE patients SET room_id = NULL WHERE id = $1', [patientId]);

    await client.query('COMMIT');

    res.json({ 
      success: true,
      message: `تم تسجيل خروج المريض ${roomCheck.rows[0].patient_name} بنجاح`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Checkout Error:', err);
    res.status(500).json({ 
      success: false,
      error: 'فشل في تسجيل الخروج',
      details: err.message 
    });
  } finally {
    client.release();
  }
});

// 🔹 حذف غرفة
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const patientsInRoom = await pool.query(
      'SELECT id FROM patients WHERE room_id = $1',
      [id]
    );

    if (patientsInRoom.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete room with assigned patients' });
    }

    const result = await pool.query(
      'DELETE FROM rooms WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      message: 'Room deleted successfully',
      deletedRoom: result.rows[0]
    });
  } catch (err) {
    console.error('Error deleting room:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;

