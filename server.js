const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Perbaikan jalur static folder public agar terbaca di Vercel
app.use(express.static(path.join(process.cwd(), 'public')));

// Folder uploads untuk sementara di serverless
const uploadDir = path.join('/tmp', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Inisialisasi Database sql.js (In-Memory untuk Vercel)
let db = null;
async function getDb() {
    if (db) return db;
    const SQL = await initSqlJs();
    db = new SQL.Database();
    
    // Buat Tabel
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
        judul_arsip TEXT,
        nomor_surat TEXT,
        instansi_asal TEXT,
        tanggal_dokumen TEXT,
        lokasi_fisik TEXT,
        file_path TEXT,
        original_name TEXT
    )`);

    console.log("Berhasil terhubung ke Database sql.js (In-Memory).");
    return db;
}

// Middleware Cek Login
const authMiddleware = (req, res, next) => {
    const userId = req.headers['user-id'];
    if (!userId) return res.status(401).json({ success: false, error: "Harap login terlebih dahulu!" });
    req.userId = userId;
    next();
};

// ================= API ROUTES =================

// Rute utama untuk melayani file index.html dari folder public
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const database = await getDb();
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Cek duplikat username
        const check = database.exec(`SELECT * FROM users WHERE username = '${username}'`);
        if (check.length > 0 && check[0].values.length > 0) {
            return res.json({ success: false, error: "Username sudah dipakai!" });
        }

        database.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword]);
        res.json({ success: true, message: "Registrasi berhasil!" });
    } catch (e) {
        res.json({ success: false, error: "Terjadi kesalahan server: " + e.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT * FROM users WHERE username = ?`);
        stmt.bind([username]);
        
        if (stmt.step()) {
            const user = stmt.getAsObject();
            stmt.free();
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) return res.json({ success: false, error: "Password salah!" });
            return res.json({ success: true, user: { id: user.id, username: user.username } });
        }
        stmt.free();
        res.json({ success: false, error: "Akun tidak ditemukan!" });
    } catch (e) {
        res.json({ success: false, error: "Terjadi kesalahan server." });
    }
});

// Ambil Daftar Folder
app.get('/api/folders', authMiddleware, async (req, res) => {
    try {
        const database = await getDb();
        const query = `
            SELECT f.*, (SELECT COUNT(*) FROM arsip a WHERE a.folder_id = f.id) as jumlah_arsip 
            FROM folders f WHERE f.user_id = ?
        `;
        const stmt = database.prepare(query);
        stmt.bind([req.userId]);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Buat Folder Baru
app.post('/api/folders', authMiddleware, async (req, res) => {
    const { nama_folder } = req.body;
    try {
        const database = await getDb();
        database.run(`INSERT INTO folders (user_id, nama_folder) VALUES (?, ?)`, [req.userId, nama_folder]);
        const resId = database.exec("SELECT last_insert_rowid() as id");
        const newId = resId[0].values[0][0];
        res.json({ success: true, id: newId });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Hapus Folder
app.delete('/api/folders/:id', authMiddleware, async (req, res) => {
    try {
        const database = await getDb();
        database.run(`DELETE FROM folders WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
        database.run(`DELETE FROM arsip WHERE folder_id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Ambil Arsip di Dalam Folder
app.get('/api/arsip', authMiddleware, async (req, res) => {
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT * FROM arsip WHERE folder_id = ? AND user_id = ?`);
        stmt.bind([req.query.folder_id, req.userId]);
        const rows = [];
        while (stmt.step()) {
            rows.push(stmt.getAsObject());
        }
        stmt.free();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Tambah Arsip Baru
app.post('/api/arsip', authMiddleware, upload.single('berkas'), async (req, res) => {
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik } = req.body;
    const fileName = req.file ? req.file.filename : '';
    const originalName = req.file ? req.file.originalname : '';
    
    try {
        const database = await getDb();
        database.run(`INSERT INTO arsip (folder_id, user_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, file_path, original_name) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [folder_id, req.userId, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, fileName, originalName]
        );
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Lihat / Buka File di Tab Baru (Inline View)
app.get('/arsip/view/:id', async (req, res) => {
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT file_path, original_name FROM arsip WHERE id = ?`);
        stmt.bind([req.params.id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            if (!row.file_path) return res.status(404).send("File tidak ditemukan.");
            return res.sendFile(path.join(uploadDir, row.file_path));
        }
        stmt.free();
        res.status(404).send("File tidak ditemukan.");
    } catch (err) {
        res.status(404).send("File tidak ditemukan.");
    }
});

// Unduh File
app.get('/arsip/download/:id', async (req, res) => {
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT file_path, original_name FROM arsip WHERE id = ?`);
        stmt.bind([req.params.id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            if (!row.file_path) return res.status(404).send("File tidak ditemukan.");
            return res.download(path.join(uploadDir, row.file_path), row.original_name);
        }
        stmt.free();
        res.status(404).send("File tidak ditemukan.");
    } catch (err) {
        res.status(404).send("File tidak ditemukan.");
    }
});

// Hapus Arsip
app.delete('/api/arsip/:id', authMiddleware, async (req, res) => {
    try {
        const database = await getDb();
        database.run(`DELETE FROM arsip WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Export untuk Vercel Serverless
module.exports = app;

// Jalankan lokal jika tidak di Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`✅ Server berjalan di http://localhost:${PORT}`);
    });
}