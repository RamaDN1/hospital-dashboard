// routes/sessions.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// ✅ جلب جميع الجلسات
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM sessions ORDER BY created_at;");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ إضافة جلسة جديدة
router.post("/", async (req, res) => {
    try {
        const { user_id, session_token, expires_at } = req.body;
        const result = await pool.query(
            "INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3) RETURNING *",
            [user_id, session_token, expires_at]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ حذف جلسة
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM sessions WHERE id = $1 RETURNING *", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Session not found" });
        }
        res.json({ message: "Session deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;