const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

let dbData = {
    users: [{ id: 1, username: 'admin', password: '123' }],
    folders: [
        { id: 1, nama_folder: 'ARSIPIJAZAH SMA TAHUN 2026', tanggal: '2026-09-04' }
    ],
    arsip: []
};

// Route Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = dbData.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

// Route Ambil Data & Hitung Jumlah Dokumen per Folder
app.get('/api/data', (req, res) => {
    const foldersWithCount = dbData.folders.map(f => {
        const count = dbData.arsip.filter(a => a.folder_id === f.id).length;
        return { ...f, jumlah_dokumen: count };
    });
    res.json({ success: true, folders: foldersWithCount, arsip: dbData.arsip });
});

// Route Tambah Folder Baru
app.post('/api/folders', (req, res) => {
    const { nama_folder, tanggal } = req.body;
    if (!nama_folder) return res.status(400).json({ success: false, error: 'Nama folder wajib diisi' });
    
    const newFolder = { 
        id: Date.now(), 
        nama_folder, 
        tanggal: tanggal || new Date().toISOString().split('T')[0] 
    };
    dbData.folders.push(newFolder);
    res.json({ success: true, data: newFolder });
});

// Route Hapus Folder
app.delete('/api/folders/:id', (req, res) => {
    const folderId = parseInt(req.params.id);
    dbData.folders = dbData.folders.filter(f => f.id !== folderId);
    dbData.arsip = dbData.arsip.filter(a => a.folder_id !== folderId);
    res.json({ success: true });
});

// Route Tambah Arsip / Dokumen ke Folder
app.post('/api/arsip', upload.single('berkas'), (req, res) => {
    const { tanggal, folder_id, judul_dokumen, pengirim, lokasi_fisik, keterangan } = req.body;

    if (!judul_dokumen || !folder_id) {
        return res.status(400).json({ success: false, error: 'Judul dokumen dan folder wajib diisi!' });
    }

    let fileBufferData = null;
    let fileName = null;
    let fileType = null;

    if (req.file) {
        fileBufferData = req.file.buffer.toString('base64');
        fileName = req.file.originalname;
        fileType = path.extname(fileName).replace('.', '').toUpperCase();
    }

    const newArsip = {
        id: Date.now(),
        tanggal: tanggal || new Date().toISOString().split('T')[0],
        folder_id: parseInt(folder_id),
        judul_dokumen,
        pengirim: pengirim || '-',
        lokasi_fisik: lokasi_fisik || '-',
        keterangan: keterangan || '',
        file_nama: fileName,
        file_tipe: fileType,
        file_data: fileBufferData
    };

    dbData.arsip.unshift(newArsip);
    res.json({ success: true, data: newArsip });
});

// Route Hapus Arsip
app.delete('/api/arsip/:id', (req, res) => {
    const id = parseInt(req.params.id);
    dbData.arsip = dbData.arsip.filter(a => a.id !== id);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;