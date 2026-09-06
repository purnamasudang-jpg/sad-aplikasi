const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });
const DB_FILE = path.join(__dirname, 'database.json');

// Inisialisasi Database JSON jika belum ada
function getDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [
                { username: 'admin', password: '123' }
            ],
            folders: [],
            arsip: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Endpoint Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDB();
    
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { username: user.username } });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

// Endpoint Register (Daftar Akun Baru)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi!' });
    }

    const db = getDB();
    const existingUser = db.users.find(u => u.username === username);
    if (existingUser) {
        return res.status(400).json({ success: false, error: 'Username sudah terdaftar, silakan gunakan yang lain.' });
    }

    db.users.push({ username, password });
    saveDB(db);
    res.json({ success: true, message: 'Registrasi berhasil' });
});

// Endpoint Ambil Data Berdasarkan User yang Login
app.get('/api/data', (req, res) => {
    const username = req.query.username || '';
    const db = getDB();
    
    // Filter folder dan arsip khusus milik user tersebut
    const userFolders = db.folders.filter(f => f.username === username);
    const folderIds = userFolders.map(f => f.id);
    const userArsip = db.arsip.filter(a => folderIds.includes(a.folder_id));

    // Hitung jumlah dokumen per folder
    const foldersWithCount = userFolders.map(f => {
        const count = userArsip.filter(a => a.folder_id === f.id).length;
        return { ...f, jumlah_dokumen: count };
    });

    res.json({
        success: true,
        folders: foldersWithCount,
        arsip: userArsip
    });
});

// Endpoint Tambah Folder
app.post('/api/folders', (req, res) => {
    const { nama_folder, tanggal, username } = req.body;
    if (!nama_folder || !username) {
        return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
    }

    const db = getDB();
    const newFolder = {
        id: Date.now(),
        username,
        nama_folder,
        tanggal: tanggal || new Date().toISOString().split('T')[0]
    };

    db.folders.push(newFolder);
    saveDB(db);
    res.json({ success: true, folder: newFolder });
});

// Endpoint Hapus Folder
app.delete('/api/folders/:id', (req, res) => {
    const folderId = parseInt(req.params.id);
    const username = req.query.username || '';
    const db = getDB();

    // Validasi kepemilikan folder
    const folderIndex = db.folders.findIndex(f => f.id === folderId && f.username === username);
    if (folderIndex === -1) {
        return res.status(403).json({ success: false, error: 'Akses ditolak atau folder tidak ditemukan' });
    }

    db.folders.splice(folderIndex, 1);
    db.arsip = db.arsip.filter(a => a.folder_id !== folderId);
    saveDB(db);

    res.json({ success: true });
});

// Endpoint Tambah Arsip Dokumen
app.post('/api/arsip', upload.array('berkas'), (req, res) => {
    const { folder_id, judul_dokumen, keterangan, pengirim, tanggal, lokasi_fisik, username } = req.body;
    const db = getDB();

    const folderIdNum = parseInt(folder_id);
    const folder = db.folders.find(f => f.id === folderIdNum && f.username === username);
    if (!folder) {
        return res.status(403).json({ success: false, error: 'Folder tidak valid atau bukan milik Anda' });
    }

    let files = req.files || [];
    if (files.length === 0) {
        const newArsip = {
            id: Date.now(),
            folder_id: folderIdNum,
            judul_dokumen,
            keterangan,
            pengirim,
            tanggal,
            lokasi_fisik,
            file_tipe: null,
            file_data: null
        };
        db.arsip.push(newArsip);
    } else {
        files.forEach((file, index) => {
            const ext = path.extname(file.originalname).substring(1).toUpperCase();
            const base64Data = file.buffer.toString('base64');
            const newArsip = {
                id: Date.now() + index,
                folder_id: folderIdNum,
                judul_dokumen: files.length > 1 ? `${judul_dokumen} (${index + 1})` : judul_dokumen,
                keterangan,
                pengirim,
                tanggal,
                lokasi_fisik,
                file_tipe: ext || 'FILE',
                file_data: base64Data
            };
            db.arsip.push(newArsip);
        });
    }

    saveDB(db);
    res.json({ success: true });
});

// Endpoint Hapus Arsip
app.delete('/api/arsip/:id', (req, res) => {
    const arsipId = parseInt(req.params.id);
    const username = req.query.username || '';
    const db = getDB();

    const arsip = db.arsip.find(a => a.id === arsipId);
    if (!arsip) {
        return res.status(404).json({ success: false, error: 'Arsip tidak ditemukan' });
    }

    const folder = db.folders.find(f => f.id === arsip.folder_id && f.username === username);
    if (!folder) {
        return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    db.arsip = db.arsip.filter(a => a.id !== arsipId);
    saveDB(db);

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});