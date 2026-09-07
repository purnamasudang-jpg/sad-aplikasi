const { Pool } = require('pg');

// Menggunakan Connection String dari Supabase Abang
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Akan otomatis membaca dari environment variable Vercel / file .env
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log('Berhasil terhubung ke database PostgreSQL Supabase!');
});

module.exports = pool;