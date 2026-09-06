const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database SQLite
const dbFile = path.join(__dirname, 'arsip.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) console.error('Gagal koneksi database:', err.message);
    else console.log('Terhubung ke database SQLite.');
});

// Buat Tabel jika belum ada
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        nama_folder TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS arsip (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        user_id INTEGER,
        nama_dokumen TEXT,
        file_url TEXT,
        tipe_file TEXT
    )`);
});

// Middleware untuk validasi user-id dari header
function verifyUser(req, res, next) {
    const userId = req.headers['user-id'];
    if (!userId || userId === 'undefined' || userId === 'null') {
        return res.status(400).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });
    }
    req.userId = userId;
    next();
}

// Route: Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi!' });
    }

    const query = `INSERT INTO users (username, password) VALUES (?, ?)`;
    db.run(query, [username, password], function(err) {
        if (err) {
            return res.status(400).json({ success: false, error: 'Username sudah digunakan!' });
        }
        res.json({ success: true, message: 'Registrasi berhasil! Silakan masuk.' });
    });
});

// Route: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = ? AND password = ?`;
    
    db.get(query, [username, password], (err, row) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!row) return res.status(401).json({ success: false, error: 'Username atau password salah!' });

        res.json({ success: true, user: { id: row.id, username: row.username } });
    });
});

// Route: Ambil Daftar Folder
app.get('/api/folders', verifyUser, (req, res) => {
    const query = `SELECT * FROM folders WHERE user_id = ?`;
    db.all(query, [req.userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

// Route: Buat Folder Baru
app.post('/api/folders', verifyUser, (req, res) => {
    const { nama_folder } = req.body;
    if (!nama_folder) return res.status(400).json({ success: false, error: 'Nama folder harus diisi.' });

    const query = `INSERT INTO folders (user_id, nama_folder) VALUES (?, ?)`;
    db.run(query, [req.userId, nama_folder], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Route: Hapus Folder
app.delete('/api/folders/:id', verifyUser, (req, res) => {
    const folderId = req.params.id;
    
    db.serialize(() => {
        db.run(`DELETE FROM arsip WHERE folder_id = ? AND user_id = ?`, [folderId, req.userId]);
        db.run(`DELETE FROM folders WHERE id = ? AND user_id = ?`, [folderId, req.userId], function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true });
        });
    });
});

// Route: Ambil Arsip dalam Folder Tertentu
app.get('/api/folders/:id/arsip', verifyUser, (req, res) => {
    const folderId = req.params.id;
    const query = `SELECT * FROM arsip WHERE folder_id = ? AND user_id = ?`;
    
    db.all(query, [folderId, req.userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: rows });
    });
});

// Route: Tambah Arsip ke Folder
app.post('/api/folders/:id/arsip', verifyUser, (req, res) => {
    const folderId = req.params.id;
    const { nama_dokumen, file_url, tipe_file } = req.body;

    if (!nama_dokumen) return res.status(400).json({ success: false, error: 'Nama dokumen wajib diisi.' });

    const query = `INSERT INTO arsip (folder_id, user_id, nama_dokumen, file_url, tipe_file) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [folderId, req.userId, nama_dokumen, file_url || '', tipe_file || 'FILE'], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// Route: Hapus Arsip
app.delete('/api/arsip/:id', verifyUser, (req, res) => {
    const arsipId = req.params.id;
    const query = `DELETE FROM arsip WHERE id = ? AND user_id = ?`;

    db.run(query, [arsipId, req.userId], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});