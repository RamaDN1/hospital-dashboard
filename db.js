const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database:process.env.DB_NAME || "general",
    password:process.env.DB_PASSWORD || "RAMA12deena_1",
    port: process.env.DB_PORT || "5432",
});

module.exports = pool;
