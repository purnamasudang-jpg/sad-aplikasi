const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Rute Utama untuk melayani file index.html secara eksplisit
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let db = null;
const dbPath = path.join('/tmp', 'database.sqlite');

async function getDb() {
    if (db) return db;
    
    // Konfigurasi locateFile agar sql.js menemukan file wasm-nya di dalam node_modules
    const SQL = await initSqlJs({
        locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
    });
    
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
                nama_dokumen TEXT,
                file_url TEXT
            );
        `);
        saveDb();
    }
    return db;
}

function saveDb() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

// ==================== ENDPOINT AUTH ====================

// Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const database = await getDb();
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const check = database.exec(`SELECT * FROM users WHERE username = '${username.replace(/'/g, "''")}'`);
        if (check.length > 0 && check[0].values.length > 0) {
            return res.json({ success: false, error: "Username sudah dipakai!" });
        }

        database.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword]);
        saveDb();
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
        const safeUser = username.replace(/'/g, "''");
        const resQuery = database.exec(`SELECT * FROM users WHERE username = '${safeUser}'`);
        
        if (resQuery.length > 0 && resQuery[0].values.length > 0) {
            const columns = resQuery[0].columns;
            const values = resQuery[0].values[0];
            const user = {};
            columns.forEach((col, index) => {
                user[col] = values[index];
            });

            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) return res.json({ success: false, error: "Password salah!" });
            return res.json({ success: true, user: { id: user.id, username: user.username } });
        }
        
        res.json({ success: false, error: "Akun tidak ditemukan!" });
    } catch (e) {
        res.json({ success: false, error: "Terjadi kesalahan server: " + e.message });
    }
});

// ==================== ENDPOINT FOLDER ====================

// Ambil Daftar Folder
app.get('/api/folders', async (req, res) => {
    const userId = req.headers['user-id'];
    try {
        const database = await getDb();
        const resQuery = database.exec(`
            SELECT f.id, f.nama_folder, COUNT(a.id) as jumlah_arsip 
            FROM folders f 
            LEFT JOIN arsip a ON f.id = a.folder_id 
            WHERE f.user_id = ${userId} 
            GROUP BY f.id
        `);

        let folders = [];
        if (resQuery.length > 0) {
            const cols = resQuery[0].columns;
            folders = resQuery[0].values.map(row => {
                let obj = {};
                cols.forEach((c, i) => obj[c] = row[i]);
                return obj;
            });
        }
        res.json({ success: true, data: folders });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Buat Folder Baru
app.post('/api/folders', async (req, res) => {
    const userId = req.headers['user-id'];
    const { nama_folder } = req.body;
    try {
        const database = await getDb();
        database.run(`INSERT INTO folders (user_id, nama_folder) VALUES (?, ?)`, [userId, nama_folder]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Hapus Folder
app.delete('/api/folders/:id', async (req, res) => {
    const folderId = req.params.id;
    try {
        const database = await getDb();
        database.run(`DELETE FROM arsip WHERE folder_id = ?`, [folderId]);
        database.run(`DELETE FROM folders WHERE id = ?`, [folderId]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));

module.exports = app;