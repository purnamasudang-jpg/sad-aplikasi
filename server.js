const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Batasi ukuran file maksimal 4MB agar aman di Vercel (limit 4.5MB)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 } // 4 MB
});

let db = null;
const dbPath = path.join('/tmp', 'database.sqlite');

async function getDb() {
    if (db) return db;
    const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist');
    const SQL = await initSqlJs({ locateFile: file => path.join(wasmPath, file) });

    if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
        db.run(`
            CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT);
            CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, nama_folder TEXT);
            CREATE TABLE IF NOT EXISTS arsip (id INTEGER PRIMARY KEY AUTOINCREMENT, folder_id INTEGER, user_id INTEGER, nama_dokumen TEXT, file_url TEXT, tipe_file TEXT);
        `);
        saveDb();
    }
    return db;
}

function saveDb() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

// FUNGSI VERIFIKASI USER
function verifyUser(req, res, next) {
    const userId = req.headers['user-id'] || req.headers['User-Id'] || (req.body && req.body.user_id);
    if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });
    }
    req.userId = userId;
    next();
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const database = await getDb();
        database.run(`INSERT INTO users (username, password) VALUES (?,?)`, [username, password]);
        saveDb();
        res.json({ success: true, message: 'Registrasi berhasil!' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT * FROM users WHERE username =? AND password =?`);
        stmt.bind([username, password]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return res.json({ success: true, user: { id: row.id, username: row.username } });
        }
        stmt.free();
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/folders', verifyUser, async (req, res) => {
    const database = await getDb();
    const stmt = database.prepare(`SELECT * FROM folders WHERE user_id =?`);
    stmt.bind([req.userId]);
    let rows = []; while (stmt.step()) { rows.push(stmt.getAsObject()); } stmt.free();
    res.json({ success: true, data: rows });
});

app.post('/api/folders', verifyUser, async (req, res) => {
    const { nama_folder } = req.body;
    const database = await getDb();
    database.run(`INSERT INTO folders (user_id, nama_folder) VALUES (?,?)`, [req.userId, nama_folder]);
    saveDb();
    res.json({ success: true });
});

app.delete('/api/folders/:id', verifyUser, async (req, res) => {
    const database = await getDb();
    database.run(`DELETE FROM arsip WHERE folder_id =? AND user_id =?`, [req.params.id, req.userId]);
    database.run(`DELETE FROM folders WHERE id =? AND user_id =?`, [req.params.id, req.userId]);
    saveDb();
    res.json({ success: true });
});

app.get('/api/folders/:id/arsip', verifyUser, async (req, res) => {
    const database = await getDb();
    const stmt = database.prepare(`SELECT * FROM arsip WHERE folder_id =? AND user_id =?`);
    stmt.bind([req.params.id, req.userId]);
    let rows = []; while (stmt.step()) { rows.push(stmt.getAsObject()); } stmt.free();
    res.json({ success: true, data: rows });
});

// UPLOAD ARSIP DENGAN PENANGANAN ERROR LIMIT
app.post('/api/folders/:id/arsip', (req, res, next) => {
    upload.single('berkas')(req, res, function (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'Ukuran file terlalu besar! Maksimal 4 MB.' });
        } else if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        next();
    });
}, verifyUser, async (req, res) => {
    try {
        const { judul_arsip } = req.body; 
        const file = req.file;
        const database = await getDb();
        
        let filename = '';
        let tipe_file = 'FILE';

        if (file) {
            const ext = path.extname(file.originalname);
            filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
            const targetPath = path.join('/tmp', filename);
            fs.writeFileSync(targetPath, file.buffer);
            tipe_file = ext;
        }
        
        database.run(`INSERT INTO arsip (folder_id, user_id, nama_dokumen, file_url, tipe_file) VALUES (?,?,?,?,?)`,
            [req.params.id, req.userId, judul_arsip, filename, tipe_file]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/arsip/:id', verifyUser, async (req, res) => {
    const database = await getDb();
    database.run(`DELETE FROM arsip WHERE id =? AND user_id =?`, [req.params.id, req.userId]);
    saveDb();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server jalan di ${PORT}`));
module.exports = app;