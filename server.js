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

const dbFile = path.join('/tmp', 'database.json');

function loadDB() {
    try {
        if (fs.existsSync(dbFile)) {
            const data = fs.readFileSync(dbFile, 'utf8');
            return JSON.parse(data);
        }
    } catch(e) {}
    return {
        users: [],
        folders: [],
        data: [],
        aktivitas: []
    };
}

function saveDB(dbData) {
    try {
        fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
    } catch(e) {}
}

function catatAktivitas(namaAktivitas, userId = 'public') {
    let db = loadDB();
    if (!db.aktivitas) db.aktivitas = [];
    db.aktivitas.push({
        id: Date.now() + Math.random(),
        aktivitas: namaAktivitas,
        user_id: userId,
        waktu: new Date().toISOString()
    });
    saveDB(db);
}

// API Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }
    let db = loadDB();
    const existing = db.users.find(u => u.username === username);
    if(existing) {
        return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
    }
    const newUser = {
        id: Date.now(),
        username,
        password,
        kuota_klik: 10
    };
    db.users.push(newUser);
    saveDB(db);
    catatAktivitas('Register Akun Baru', newUser.id);
    res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
});

// API Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    let db = loadDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    if(user) {
        catatAktivitas('Login Berhasil', user.id);
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah' });
    }
});

// API Info User & Kuota
app.get('/api/user-info/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    let db = loadDB();
    const user = db.users.find(u => u.id === userId);
    if(user) {
        res.json({ id: user.id, username: user.username, kuota_klik: user.kuota_klik || 0 });
    } else {
        res.status(404).json({ error: 'User tidak ditemukan' });
    }
});

// API Folders
app.get('/api/folders', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    let db = loadDB();
    const userFolders = db.folders.filter(f => f.user_id === userId);
    catatAktivitas('Buka / Lihat Daftar Folder', userId);
    res.json({ success: true, data: userFolders });
});

app.post('/api/folders', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { nama_folder } = req.body;
    if(!nama_folder) return res.status(400).json({ error: 'Nama folder wajib diisi' });

    let db = loadDB();
    const newFolder = {
        id: Date.now(),
        user_id: userId,
        nama_folder
    };
    db.folders.push(newFolder);
    saveDB(db);
    catatAktivitas('Buat Folder Baru', userId);
    res.json({ success: true, data: newFolder });
});

app.delete('/api/folders/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let db = loadDB();
    db.folders = db.folders.filter(f => f.id !== id);
    db.data = db.data.filter(d => d.folder_id !== id);
    saveDB(db);
    res.json({ success: true });
});

// API Arsip / Dokumen
app.get('/api/arsip', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    let db = loadDB();
    const userArsip = db.data.filter(d => d.user_id === userId);
    catatAktivitas('Buka Daftar Arsip Dokumen', userId);
    res.json({ success: true, data: userArsip });
});

// API Pencarian Arsip / Dokumen Lama
app.get('/api/arsip/cari', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const keyword = (req.query.q || '').toLowerCase();
    
    let db = loadDB();
    const userArsip = db.data.filter(d => d.user_id === userId);
    
    if (!keyword) {
        return res.json({ success: true, data: userArsip });
    }

    const hasilPencarian = userArsip.filter(d => {
        return (
            (d.judul_arsip && d.judul_arsip.toLowerCase().includes(keyword)) ||
            (d.nomor_surat && d.nomor_surat.toLowerCase().includes(keyword)) ||
            (d.instansi_asal && d.instansi_asal.toLowerCase().includes(keyword)) ||
            (d.keterangan && d.keterangan.toLowerCase().includes(keyword)) ||
            (d.lokasi_fisik && d.lokasi_fisik.toLowerCase().includes(keyword))
        );
    });

    catatAktivitas(`Pencarian Dokumen: "${keyword}"`, userId);
    res.json({ success: true, data: hasilPencarian });
});

app.post('/api/arsip', upload.single('berkas'), (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;

    let db = loadDB();
    let user = db.users.find(u => u.id === userId);

    if (!judul_arsip || !folder_id) {
        return res.status(400).json({ error: 'Judul arsip dan folder wajib diisi' });
    }

    const newArsip = {
        id: Date.now(),
        user_id: userId,
        folder_id: parseInt(folder_id),
        judul_arsip,
        nomor_surat,
        instansi_asal,
        tanggal_dokumen,
        lokasi_fisik,
        keterangan,
        file_path: req.file ? req.file.originalname : null
    };

    db.data.push(newArsip);
    
    if (user) {
        user.kuota_klik = Math.max(0, (user.kuota_klik || 10) - 1);
    }
    
    saveDB(db);
    catatAktivitas('Upload / Buat Dokumen Arsip', userId);
    res.json({ success: true, data: newArsip });
});

app.delete('/api/arsip/:id', (req, res) => {
    const id = parseInt(req.params.id);
    let db = loadDB();
    db.data = db.data.filter(d => d.id !== id);
    saveDB(db);
    res.json({ success: true });
});

// API Rekap Aktivitas
app.get('/api/rekap-aktivitas', (req, res) => {
    let db = loadDB();
    let totalKlik = (db.aktivitas || []).length;
    res.json({
        success: true,
        total_aktivitas_klik: totalKlik,
        riwayat_aktivitas: db.aktivitas || []
    });
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;