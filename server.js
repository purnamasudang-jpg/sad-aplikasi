const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Konfigurasi body parser dengan limit besar untuk mengantisipasi data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Konfigurasi folder public untuk frontend
app.use(express.static(path.join(__dirname, 'public')));

// Menggunakan memoryStorage untuk Vercel (serverless environment)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 } // Batas 4MB sesuai ketentuan
});

// SIMULASI DATABASE SEDERHANA (atau sesuaikan dengan file database.js Anda)
// Jika menggunakan database.js terpisah, pastikan fungsi getDb/saveDb diimpor dengan benar.
let dbData = {
    users: [{ id: 1, username: 'admin', password: '123' }],
    folders: [],
    arsip: []
};

// Fungsi helper database (atau hubungkan ke file database.js Anda)
async function getDb() { return dbData; }
function saveDb() { /* simpan state jika diperlukan */ }

// Middleware Verifikasi User
function verifyUser(req, res, next) {
    const userId = req.headers['user-id'] || req.body.user_id || req.query.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'User ID tidak valid. Silakan login ulang.' });
    }
    req.userId = userId;
    next();
}

// ROUTE LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = dbData.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

// ROUTE GET FOLDERS
app.get('/api/folders', verifyUser, (req, res) => {
    const userFolders = dbData.folders.filter(f => f.user_id == req.userId);
    res.json({ success: true, data: userFolders });
});

// ROUTE POST FOLDER
app.post('/api/folders', verifyUser, (req, res) => {
    const { nama_folder } = req.body;
    const newFolder = { id: Date.now(), user_id: req.userId, nama_folder };
    dbData.folders.push(newFolder);
    res.json({ success: true, data: newFolder });
});

// ROUTE GET ARSIP DALAM FOLDER
app.get('/api/folders/:id/arsip', verifyUser, (req, res) => {
    const folderArsip = dbData.arsip.filter(a => a.folder_id == req.params.id);
    res.json({ success: true, data: folderArsip });
});

// ROUTE UPLOAD ARSIP (Middleware verifyUser ditaruh di depan agar req.headers terbaca multer)
app.post('/api/folders/:id/arsip', verifyUser, (req, res, next) => {
    upload.single('berkas')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, error: 'Ukuran berkas melebihi batas maksimal 4MB!' });
            }
            return res.status(400).json({ success: false, error: `Error upload: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { judul_arsip } = req.body; 
        const file = req.file;
        
        let filename = '';
        let tipe_file = 'FILE';

        if (file) {
            const ext = path.extname(file.originalname);
            filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
            // Di Vercel, simpan file sementara ke direktori /tmp
            const targetPath = path.join('/tmp', filename);
            fs.writeFileSync(targetPath, file.buffer);
            tipe_file = ext;
        }
        
        const newArsip = {
            id: Date.now(),
            folder_id: req.params.id,
            user_id: req.userId,
            nama_dokumen: judul_arsip || (file ? file.originalname : 'Tanpa Judul'),
            file_url: filename,
            tipe_file: tipe_file
        };

        dbData.arsip.push(newArsip);
        res.json({ success: true, data: newArsip });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));

module.exports = app;