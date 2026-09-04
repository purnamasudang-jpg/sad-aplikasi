const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'sad-secret-key-2026',
    resave: false,
    saveUninitialized: false
}));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Gagal koneksi database:', err.message);
    else console.log('Terhubung ke database SQLite.');
});

// Buat Tabel Database jika belum ada
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_folder TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS arsip (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        judul TEXT,
        nomor_surat TEXT,
        instansi TEXT,
        tanggal TEXT,
        lokasi_fisik TEXT,
        keterangan TEXT
    )`);
});

// Middleware Cek Login
function cekAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ message: 'Belum login' });
    }
}

// Route Registrasi
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function(err) {
        if (err) {
            return res.status(400).json({ message: 'Username sudah digunakan!' });
        }
        res.json({ message: 'Registrasi berhasil!' });
    });
});

// Route Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (row) {
            req.session.user = row.username;
            res.json({ message: 'Login sukses' });
        } else {
            res.status(401).json({ message: 'Username atau password salah!' });
        }
    });
});

// Route Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/index.html');
    });
});

// Route Ambil Folder
app.get('/api/folders', cekAuth, (req, res) => {
    db.all(`SELECT * FROM folders`, [], (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

// Route Buat Folder
app.post('/api/folders', cekAuth, (req, res) => {
    const { nama_folder } = req.body;
    db.run(`INSERT INTO folders (nama_folder) VALUES (?)`, [nama_folder], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ id: this.lastID, nama_folder });
    });
});

// Route Simpan Arsip
app.post('/api/arsip', cekAuth, (req, res) => {
    const { folder_id, judul, nomor_surat, instansi, tanggal, lokasi_fisik, keterangan } = req.body;
    const query = `INSERT INTO arsip (folder_id, judul, nomor_surat, instansi, tanggal, lokasi_fisik, keterangan) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [folder_id, judul, nomor_surat, instansi, tanggal, lokasi_fisik, keterangan], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: 'Arsip berhasil disimpan' });
    });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});