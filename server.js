const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// Simulasi Database Persisten Sederhana
const dbFile = path.join(__dirname, 'database.json');

function loadDB() {
    if (fs.existsSync(dbFile)) {
        try {
            return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        } catch(e) {
            return { users: [], folders: [], arsip: [] };
        }
    }
    return { users: [], folders: [], arsip: [] };
}

function saveDB(data) {
    try {
        fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
    } catch(e) {
        // Abaikan jika read-only di serverless murni
    }
}

// API Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) {
        return res.json({ success: false, error: 'Username dan password wajib diisi' });
    }
    let db = loadDB();
    const existing = db.users.find(u => u.username === username);
    if(existing) {
        return res.json({ success: false, error: 'Username sudah terdaftar' });
    }
    db.users.push({ username, password });
    saveDB(db);
    res.json({ success: true });
});

// API Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let db = loadDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if(user) {
        res.json({ success: true, user: { username: user.username } });
    } else {
        res.json({ success: false, error: 'Username atau password salah' });
    }
});

// API Ambil Data
app.get('/api/data', (req, res) => {
    const username = req.query.username || '';
    let db = loadDB();
    const userFolders = db.folders.filter(f => f.username === username);
    const userFolderIds = userFolders.map(f => f.id);
    const userArsip = db.arsip.filter(a => userFolderIds.includes(a.folder_id));

    const formattedFolders = userFolders.map(f => {
        const count = userArsip.filter(a => a.folder_id === f.id).length;
        return { ...f, jumlah_dokumen: count };
    });

    res.json({
        success: true,
        folders: formattedFolders,
        arsip: userArsip
    });
});

// API Buat Folder
app.post('/api/folders', (req, res) => {
    const { nama_folder, tanggal, username } = req.body;
    if(!nama_folder) return res.json({ success: false });

    let db = loadDB();
    const newFolder = {
        id: Date.now(),
        nama_folder,
        tanggal,
        username
    };
    db.folders.push(newFolder);
    saveDB(db);
    res.json({ success: true, folder: newFolder });
});

// API Hapus Folder
app.delete('/api/folders/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const username = req.query.username || '';
    
    let db = loadDB();
    const folderIdx = db.folders.findIndex(f => f.id === id && f.username === username);
    if(folderIdx !== -1) {
        db.folders.splice(folderIdx, 1);
        db.arsip = db.arsip.filter(a => a.folder_id !== id);
        saveDB(db);
        return res.json({ success: true });
    }
    res.json({ success: false, error: 'Folder tidak ditemukan' });
});

// API Simpan Arsip & Multi-Upload File
app.post('/api/arsip', upload.array('berkas'), (req, res) => {
    const { folder_id, judul_dokumen, keterangan, pengirim, tanggal, lokasi_fisik } = req.body;
    
    if(!judul_dokumen || !folder_id) {
        return res.json({ success: false, error: 'Data tidak lengkap' });
    }

    let db = loadDB();
    if(req.files && req.files.length > 0) {
        req.files.forEach(file => {
            let ext = path.extname(file.originalname).replace('.', '').toUpperCase();
            if(ext === 'JPEG') ext = 'JPG';

            const newArsip = {
                id: Date.now() + Math.random(),
                folder_id: parseInt(folder_id),
                judul_dokumen: req.files.length > 1 ? `${judul_dokumen} (${file.originalname})` : judul_dokumen,
                keterangan,
                pengirim,
                tanggal,
                lokasi_fisik,
                file_tipe: ext,
                file_data: file.buffer.toString('base64')
            };
            db.arsip.push(newArsip);
        });
    } else {
        const newArsip = {
            id: Date.now(),
            folder_id: parseInt(folder_id),
            judul_dokumen,
            keterangan,
            pengirim,
            tanggal,
            lokasi_fisik,
            file_tipe: null,
            file_data: null
        };
        db.arsip.push(newArsip);
    }

    saveDB(db);
    res.json({ success: true });
});

// API Hapus Arsip
app.delete('/api/arsip/:id', (req, res) => {
    const id = parseFloat(req.params.id);
    let db = loadDB();
    const index = db.arsip.findIndex(a => a.id === id);
    if(index !== -1) {
        db.arsip.splice(index, 1);
        saveDB(db);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

// Export untuk Vercel Serverless / Jalankan lokal
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;