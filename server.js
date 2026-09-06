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
        { id: 1, nama_folder: 'Dokumen Umum' }
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

// Route Ambil Daftar Folder & Arsip Sekaligus
app.get('/api/folders', (req, res) => {
    const foldersWithArsip = dbData.folders.map(folder => ({
        ...folder,
        arsip: dbData.arsip.filter(a => a.folder_id === folder.id)
    }));
    res.json({ success: true, data: foldersWithArsip });
});

// Route Buat Folder Baru
app.post('/api/folders', (req, res) => {
    const { nama_folder } = req.body;
    if (!nama_folder) return res.status(400).json({ success: false, error: 'Nama folder wajib diisi' });
    
    const newFolder = { id: Date.now(), nama_folder };
    dbData.folders.push(newFolder);
    res.json({ success: true, data: newFolder });
});

// Route Upload Arsip
app.post('/api/folders/:id/arsip', upload.single('berkas'), (req, res) => {
    const folderId = parseInt(req.params.id);
    const { judul_arsip } = req.body;

    if (!judul_arsip) return res.status(400).json({ success: false, error: 'Judul arsip wajib diisi' });

    let fileExtension = 'FILE';
    let originalName = null;

    if (req.file) {
        originalName = req.file.originalname;
        const ext = path.extname(originalName).replace('.', '').toUpperCase();
        if (ext) fileExtension = ext;
    }

    const newArsip = {
        id: Date.now(),
        folder_id: folderId,
        nama_dokumen: judul_arsip,
        file_nama: originalName,
        tipe_file: fileExtension
    };

    dbData.arsip.push(newArsip);
    res.json({ success: true, data: newArsip });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;