const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(cors());

// Menyajikan file statis dari folder public
app.use(express.static(path.join(__dirname, '../public')));

// FUNGSI INISIALISASI TABEL OTOMATIS (Mencegah error tabel belum ada)
async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                nama VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                nama_folder VARCHAR(255) NOT NULL,
                jumlah_file INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log("Struktur tabel PostgreSQL Supabase siap.");
    } catch (err) {
        console.error("Gagal inisialisasi tabel:", err.message);
    }
}
initDB();

// 1. ENDPOINT REGISTER AKUN BARU
app.post('/api/register', async (req, res) => {
    const { nama, email, password } = req.body;
    if (!nama || !email || !password) {
        return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi!' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (nama, email, password) VALUES ($1, $2, $3) RETURNING id`;
        
        await db.query(query, [nama, email, hashedPassword]);
        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    } catch (err) {
        if (err.code === '23505') { // Kode error PostgreSQL untuk unique constraint violation
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar!' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. ENDPOINT LOGIN AKUN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi!' });
    }

    try {
        const query = `SELECT * FROM users WHERE email = $1`;
        const result = await db.query(query, [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Email atau password salah!' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Email atau password salah!' });
        }

        res.json({
            success: true,
            message: 'Login berhasil',
            user: { id: user.id, nama: user.nama, email: user.email }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. ENDPOINT AMBIL FOLDER (TERISOLASI)
app.get('/api/folders/:user_id', async (req, res) => {
    const userId = req.params.user_id;
    try {
        const query = `SELECT * FROM folders WHERE user_id = $1 ORDER BY id DESC`;
        const result = await db.query(query, [userId]);
        res.json({ success: true, folders: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. ENDPOINT BUAT FOLDER BARU (TERISOLASI)
app.post('/api/folders', async (req, res) => {
    const { user_id, nama_folder } = req.body;
    if (!user_id || !nama_folder) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap!' });
    }

    try {
        const query = `INSERT INTO folders (user_id, nama_folder) VALUES ($1, $2) RETURNING id`;
        const result = await db.query(query, [user_id, nama_folder]);
        res.json({ success: true, message: 'Folder berhasil dibuat', folderId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server publik berjalan di port ${PORT}`);
});