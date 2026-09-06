const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            );
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                nama_folder TEXT
            );
            CREATE TABLE IF NOT EXISTS arsip (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER,
                user_id INTEGER,
                nama_dokumen TEXT,
                file_url TEXT,
                tipe_file TEXT
            );
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

function verifyUser(req, res, next) {
    const userId = req.headers['user-id'] || req.body.user_id || req.query.user_id;
    if (!userId || userId === 'undefined' || userId === 'null') {
        return res.status(400).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });
    }
    req.userId = userId;
    next();
}

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username ||!password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi!' });
    }
    try {
        const database = await getDb();
        const stmtCheck = database.prepare(`SELECT * FROM users WHERE username =?`);
        stmtCheck.bind([username]);
        const exists = stmtCheck.step();
        stmtCheck.free();
        if (exists) {
            return res.status(400).json({ success: false, error: 'Username sudah digunakan!' });
        }
        database.run(`INSERT INTO users (username, password) VALUES (?,?)`, [username, password]);
        saveDb();
        res.json({ success: true, message: 'Registrasi berhasil!' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/folders', verifyUser, async (req, res) => {
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT * FROM folders WHERE user_id =?`);
        stmt.bind([req.userId]);
        let rows = [];
        while (stmt.step()) { rows.push(stmt.getAsObject()); }
        stmt.free();
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/folders', verifyUser, async (req, res) => {
    const { nama_folder } = req.body;
    if (!nama_folder) return res.status(400).json({ success: false, error: 'Nama folder harus diisi.' });
    try {
        const database = await getDb();
        database.run(`INSERT INTO folders (user_id, nama_folder) VALUES (?,?)`, [req.userId, nama_folder]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/folders/:id', verifyUser, async (req, res) => {
    const folderId = req.params.id;
    try {
        const database = await getDb();
        database.run(`DELETE FROM arsip WHERE folder_id =? AND user_id =?`, [folderId, req.userId]);
        database.run(`DELETE FROM folders WHERE id =? AND user_id =?`, [folderId, req.userId]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/folders/:id/arsip', verifyUser, async (req, res) => {
    const folderId = req.params.id;
    try {
        const database = await getDb();
        const stmt = database.prepare(`SELECT * FROM arsip WHERE folder_id =? AND user_id =?`);
        stmt.bind([folderId, req.userId]);
        let rows = [];
        while (stmt.step()) { rows.push(stmt.getAsObject()); }
        stmt.free();
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/folders/:id/arsip', verifyUser, async (req, res) => {
    const folderId = req.params.id;
    const { nama_dokumen, file_url, tipe_file, user_id } = req.body; // <-- TAMBAH user_id dari body
    if (!nama_dokumen) return res.status(400).json({ success: false, error: 'Nama dokumen wajib diisi.' });
    if (!user_id) return res.status(400).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });

    try {
        const database = await getDb();
        // YG DIBENERIN: dari 4 tanda tanya jadi 5 tanda tanya
        database.run(`INSERT INTO arsip (folder_id, user_id, nama_dokumen, file_url, tipe_file) VALUES (?,?,?,?,?)`,
            [folderId, user_id, nama_dokumen, file_url || '', tipe_file || 'FILE']); // <-- Pake user_id dari body
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/arsip/:id', verifyUser, async (req, res) => {
    const arsipId = req.params.id;
    try {
        const database = await getDb();
        database.run(`DELETE FROM arsip WHERE id =? AND user_id =?`, [arsipId, req.userId]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
module.exports = app;