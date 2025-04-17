const express = require('express');
const router = express.Router();
const pool = require('../db');
const { body, validationResult } = require('express-validator');

// تحقق من صحة البيانات
const validateHelpData = [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Invalid email'),
    body('subject').notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required')
];

// إضافة رسالة مساعدة
router.post('/', validateHelpData, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, organization, subject, message } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO help_requests (name, email, organization, subject, message, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
            [name, email, organization || null, subject, message]
        );

        res.status(201).json({
            success: true,
            message: 'Help request submitted successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Failed to submit help request:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while submitting your request'
        });
    }
});

module.exports = router;
