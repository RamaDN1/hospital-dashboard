const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const authenticateToken = require('./middlewares/auth');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.env.JWT_SECRET = '5ddf4a564f24e49de2ee20c9b55964a967c4bdaeeb43359cd6857e83e9fadfe7';

const app = express();

// إعداد CORS
app.use(cors({
    origin: 'http://localhost:3000', 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "front")));


// استيراد المسارات
const roomRoutes = require("./routes/rooms");
const patientRoutes = require("./routes/patients");
const entryRoutes = require("./routes/entries");
const valveRoutes = require("./routes/valves");
const userRoutes = require("./routes/users");
const sessionRoutes = require("./routes/sessions");
const reviewRoutes = require("./routes/reviews");
const helpRoutes = require("./routes/help");
const feedbackRoutes = require("./routes/feedback");

// استخدام المسارات
app.use("/api/rooms", roomRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/entries", entryRoutes);
app.use("/api/valve_status", valveRoutes);
app.use("/api/users", userRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/feedback", feedbackRoutes);

// تسجيل الدخول
app.post("/api/login", async (req, res) => {
  try {
      if (!req.body?.email || !req.body?.password) {
          return res.status(400).json({ 
              success: false,
              message: "البريد الإلكتروني وكلمة المرور مطلوبان"
          });
      }

      const { email, password } = req.body;

      const user = await pool.query(
          "SELECT id, name, email, password FROM users WHERE email = $1", 
          [email]
      );

      if (user.rows.length === 0) {
          return res.status(401).json({
              success: false,
              message: "بيانات الدخول غير صحيحة"
          });
      }

      const validPassword = await bcrypt.compare(password, user.rows[0].password);
      if (!validPassword) {
          return res.status(401).json({
              success: false,
              message: "بيانات الدخول غير صحيحة"
          });
      }

      const token = jwt.sign(
        { 
          user_id: user.rows[0].id,
          email: user.rows[0].email,
          role: user.rows[0].role || 'doctor' // إضافة دور افتراضي إذا لم يكن موجوداً
        },
        process.env.JWT_SECRET,
        { 
          expiresIn: '24h',
          algorithm: 'HS256'
        }
      );

     return res.json({
        success: true,
        token,
        user: {
            id: user.rows[0].id,
            name: user.rows[0].name,
            email: user.rows[0].email
        },
        redirectTo: '/home.html'
     });

  } catch (err) {
      console.error("🔥 خطأ في تسجيل الدخول:", err);
      return res.status(500).json({
          success: false,
          message: "حدث خطأ تقني",
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
  }
});

// تسجيل مستخدم جديد
app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;

    // تعديل الإيميل إذا كان @example.com ليصير @gmail.com
    if (email.endsWith('@example.com')) {
      email = email.replace('@example.com', '@gmail.com');
    }

    // التحقق من أن الإيميل هو فقط @gmail.com
    if (!email.endsWith('@gmail.com')) {
      return res.status(400).json({
        message: "فقط إيميلات Gmail مسموح بها (@gmail.com)"
      });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await pool.query(
      "INSERT INTO users (name, email, password, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, name, email",
      [name, email, hashedPassword]
    );

    res.status(201).json({
      message: "تم إنشاء المستخدم بنجاح",
      user: newUser.rows[0]
    });
  } catch (err) {
    console.error("🚨 خطأ أثناء التسجيل:", err);
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
});


  
  // إعادة توجيه أي طلب غير موجود
  app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "front", "login.html"));
  });
  
  // التعامل مع الأخطاء
  app.use((err, req, res, next) => {
      console.error("❌ Internal Server Error:", err.message);
      res.status(500).json({ error: err.message });
  });
  
  // تشغيل السيرفر
  if (process.env.NODE_ENV !== "test") {
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
          console.log(`🚀 Server running on port: http://localhost:${PORT}`);
      });
  }
  

module.exports = app;

