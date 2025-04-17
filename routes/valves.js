const express = require("express");
const router = express.Router();
const pool = require("../db");

// ✅ جلب حالة الصمامات لجميع الغرف
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM valve_status ORDER BY room_id;");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ البحث عن حالة الصمام حسب رقم الغرفة
router.get("/:room_id", async (req, res) => {
    try {
        const { room_id } = req.params;
        const result = await pool.query("SELECT * FROM valve_status WHERE room_id = $1", [room_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Valve status not found for this room" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// ✅ تحديث حالة الصمام (فتح/إغلاق)
router.put("/:room_id", async (req, res) => {
    try {
        const { room_id } = req.params;
        const { status } = req.body;

        if (status !== "open" && status !== "closed") {
            return res.status(400).json({ error: "Invalid status. Use 'open' or 'closed'" });
        }

        const result = await pool.query(
            "UPDATE valve_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE room_id = $2 RETURNING *",
            [status, room_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Room not found" });
        }

        await pool.query(
            "INSERT INTO valve_control_logs (room_id, action, performed_by) VALUES ($1, $2, $3)",
            [room_id, status === "open" ? "opened" : "closed", "System"]
          );
          
        // سجل العملية في جدول valve_control_logs
        res.json({ valve_status: result.rows[0] });
    } catch (err) {
        console.error("Database error:", err);  // ✅ إضافة رسالة خطأ تفصيلية
        res.status(500).json({ error: "Server error", details: err.message });
    }
});

// ✅ إضافة حالة صمام جديدة
router.post("/", async (req, res) => {
    try {
        const { room_id, status } = req.body;

        if (status !== "open" && status !== "closed") {
            return res.status(400).json({ error: "Invalid status. Use 'open' or 'closed'" });
        }

        const result = await pool.query(
            "INSERT INTO valve_status (room_id, status) VALUES ($1, $2) RETURNING *",
            [room_id, status]
        );

        // سجل العملية في جدول valve_control_logs
        const controlLog = await pool.query(
            "INSERT INTO valve_control_logs (room_id, action, performed_by) VALUES ($1, $2, $3) RETURNING *",
            [room_id, status === "open" ? "opened" : "closed", "System"]
        );

        res.json({ valve_status: result.rows[0], control_log: controlLog.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});


// valves.js
router.post("/schedule", async (req, res) => {
    try {
        const { start, end } = req.body;

        if (!start || !end) {
            return res.status(400).json({ error: "يجب تحديد وقت البداية والنهاية" });
        }

       // (اختياري) احفظ الجدولة في قاعدة البيانات إذا كنت تحتاجها لاحقًا
       await pool.query(
        "INSERT INTO valve_schedules (start_time, end_time) VALUES ($1, $2)",
        [start, end]
    );

    res.json({ 
        success: true,
        message: "تم ضبط الجدولة بنجاح"
    });
} catch (err) {
    console.error("Error setting schedule:", err);
    res.status(500).json({ error: "فشل في ضبط الجدولة" });
}
});

// ✅ حذف حالة صمام
router.delete("/:room_id", async (req, res) => {
    try {
        const { room_id } = req.params;
        const result = await pool.query("DELETE FROM valve_status WHERE room_id = $1 RETURNING *", [room_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Valve status not found" });
        }

        res.json({ message: "Valve status deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;