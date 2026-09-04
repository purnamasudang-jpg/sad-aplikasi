const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
// Menggunakan port dinamis dari environment cloud server atau default 3000
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('Gagal koneksi database:', err.message);
    else console.log('Terhubung ke database SQLite.');
});

// Inisialisasi Tabel Users, Folders, Arsip
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        kuota_klik INTEGER DEFAULT 10
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        nama_folder TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS arsip_dokumen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        user_id INTEGER,
        judul_arsip TEXT NOT NULL,
        nomor_surat TEXT,
        instansi_asal TEXT,
        tanggal_dokumen TEXT NOT NULL,
        lokasi_fisik TEXT,
        keterangan TEXT,
        file_path TEXT
    )`);
});

// Middleware Cek & Potong Kuota Klik Otomatis
function potongKuota(req, res, next) {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ error: 'Silakan login terlebih dahulu!' });

    db.get('SELECT kuota_klik FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Pengguna tidak ditemukan.' });
        if (user.kuota_klik <= 0) {
            return res.status(403).json({ error: 'Kuota klik Anda telah habis! Silakan isi ulang kuota.' });
        }

        db.run('UPDATE users SET kuota_klik = kuota_klik - 1 WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json({ error: 'Gagal memotong kuota.' });
            next();
        });
    });
}

// API AUTHENTICATION
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    db.run('INSERT INTO users (username, password, kuota_klik) VALUES (?, ?, 10)', [username, password], function(err) {
        if (err) return res.status(400).json({ error: 'Username sudah digunakan!' });
        res.json({ message: 'Registrasi berhasil! Anda mendapatkan bonus 10 Kuota Klik Gratis.' });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Username atau password salah!' });
        res.json({ message: 'Login berhasil!', user: { id: user.id, username: user.username, kuota_klik: user.kuota_klik } });
    });
});

app.get('/api/user-info/:id', (req, res) => {
    db.get('SELECT id, username, kuota_klik FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User tidak ditemukan' });
        res.json(user);
    });
});

// API FOLDER
app.get('/api/folders', (req, res) => {
    const userId = req.headers['user-id'];
    db.all('SELECT * FROM folders WHERE user_id = ?', [userId], (err, rows) => {
        res.json({ data: rows || [] });
    });
});

app.post('/api/folders', potongKuota, (req, res) => {
    const userId = req.headers['user-id'];
    const { nama_folder } = req.body;
    db.run('INSERT INTO folders (user_id, nama_folder) VALUES (?, ?)', [userId, nama_folder], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.delete('/api/folders/:id', (req, res) => {
    db.run('DELETE FROM folders WHERE id = ?', [req.params.id], (err) => {
        res.json({ message: 'Folder dihapus' });
    });
});

// API ARSIP DOKUMEN
app.get('/api/arsip', (req, res) => {
    const userId = req.headers['user-id'];
    db.all('SELECT * FROM arsip_dokumen WHERE user_id = ?', [userId], (err, rows) => {
        res.json({ data: rows || [] });
    });
});

app.post('/api/arsip', upload.single('berkas'), potongKuota, (req, res) => {
    const userId = req.headers['user-id'];
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;
    const file_path = req.file ? req.file.filename : null;

    db.run(`INSERT INTO arsip_dokumen (folder_id, user_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan, file_path) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [folder_id, userId, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan, file_path],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.delete('/api/arsip/:id', (req, res) => {
    db.run('DELETE FROM arsip_dokumen WHERE id = ?', [req.params.id], (err) => {
        res.json({ message: 'Dokumen dihapus' });
    });
});

// Menjalankan server pada port dinamis
app.listen(PORT, () => {
    console.log(`Server SAD Berjalan di port ${PORT}`);
});