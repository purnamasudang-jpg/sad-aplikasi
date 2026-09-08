const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Menggunakan memory storage agar aman di serverless Vercel
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// Database sementara dalam memori (untuk Vercel serverless)
let inMemoryDB = {
    users: [],
    folders: [],
    data: [],
    aktivitas: []
};

function catatAktivitas(namaAktivitas, userId = 'public') {
    inMemoryDB.aktivitas.push({
        id: Date.now() + Math.random(),
        aktivitas: namaAktivitas,
        user_id: userId,
        waktu: new Date().toISOString()
    });
}

// API Register
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }
    const existing = inMemoryDB.users.find(u => u.username === username);
    if(existing) {
        return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
    }
    const newUser = {
        id: Date.now(),
        username,
        password,
        kuota_klik: 10
    };
    inMemoryDB.users.push(newUser);
    catatAktivitas('Register Akun Baru', newUser.id);
    res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
});

// API Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = inMemoryDB.users.find(u => u.username === username && u.password === password);
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
    const user = inMemoryDB.users.find(u => u.id === userId);
    if(user) {
        res.json({ id: user.id, username: user.username, kuota_klik: user.kuota_klik || 0 });
    } else {
        res.status(404).json({ error: 'User tidak ditemukan' });
    }
});

// API Folders
app.get('/api/folders', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const userFolders = inMemoryDB.folders.filter(f => f.user_id === userId);
    catatAktivitas('Buka / Lihat Daftar Folder', userId);
    res.json({ success: true, data: userFolders });
});

app.post('/api/folders', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { nama_folder } = req.body;
    if(!nama_folder) return res.status(400).json({ error: 'Nama folder wajib diisi' });

    const newFolder = {
        id: Date.now(),
        user_id: userId,
        nama_folder
    };
    inMemoryDB.folders.push(newFolder);
    catatAktivitas('Buat Folder Baru', userId);
    res.json({ success: true, data: newFolder });
});

app.delete('/api/folders/:id', (req, res) => {
    const id = parseInt(req.params.id);
    inMemoryDB.folders = inMemoryDB.folders.filter(f => f.id !== id);
    inMemoryDB.data = inMemoryDB.data.filter(d => d.folder_id !== id);
    res.json({ success: true });
});

// API Arsip / Dokumen
app.get('/api/arsip', (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const userArsip = inMemoryDB.data.filter(d => d.user_id === userId);
    catatAktivitas('Buka Daftar Arsip Dokumen', userId);
    res.json({ success: true, data: userArsip });
});

app.post('/api/arsip', upload.single('berkas'), (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;

    let user = inMemoryDB.users.find(u => u.id === userId);

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

    inMemoryDB.data.push(newArsip);
    
    if (user) {
        user.kuota_klik = Math.max(0, (user.kuota_klik || 10) - 1);
    }
    
    catatAktivitas('Upload / Buat Dokumen Arsip', userId);
    res.json({ success: true, data: newArsip });
});

app.delete('/api/arsip/:id', (req, res) => {
    const id = parseInt(req.params.id);
    inMemoryDB.data = inMemoryDB.data.filter(d => d.id !== id);
    res.json({ success: true });
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;