const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const multer = require('multer'); // TAMBAH INI

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SETTING UPLOAD KE /tmp/uploads
const upload = multer({ dest: '/tmp/uploads/' }); 

let db = null;
const dbPath = path.join('/tmp', 'database.sqlite');

async function getDb() { /* ... sama seperti punya ibu ... */ }
function saveDb() { /* ... sama seperti punya ibu ... */ }

function verifyUser(req, res, next) {
    const userId = req.headers['user-id'] || req.body.user_id;
    if (!userId) return res.status(400).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });
    req.userId = userId;
    next();
}

// ... API login, register, folders sama ...

// INI YG DIBENERIN: TAMBAH upload.single('berkas')
app.post('/api/folders/:id/arsip', verifyUser, upload.single('berkas'), async (req, res) => {
    const folderId = req.params.id;
    const { judul_arsip } = req.body; 
    const user_id = req.userId;
    const file = req.file; // file yg diupload

    if (!judul_arsip) return res.status(400).json({ success: false, error: 'Nama dokumen wajib diisi.' });

    try {
        const database = await getDb();
        const file_url = file ? file.filename : ''; // simpan nama file dari multer
        const tipe_file = file ? path.extname(file.originalname) : 'FILE';
        
        database.run(`INSERT INTO arsip (folder_id, user_id, nama_dokumen, file_url, tipe_file) VALUES (?,?,?,?,?)`,
            [folderId, user_id, judul_arsip, file_url, tipe_file]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
module.exports = app;