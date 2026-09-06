const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 }
});

let dbData = {
    users: [{ id: 1, username: 'admin', password: '123' }],
    folders: [],
    arsip: []
};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = dbData.users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ success: true, user: { id: user.id, username: user.username } });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

app.get('/api/folders', (req, res) => {
    res.json({ success: true, data: dbData.folders });
});

app.post('/api/folders', (req, res) => {
    const { nama_folder } = req.body;
    const newFolder = { id: Date.now(), user_id: 1, nama_folder };
    dbData.folders.push(newFolder);
    res.json({ success: true, data: newFolder });
});

app.get('/api/folders/:id/arsip', (req, res) => {
    const folderArsip = dbData.arsip.filter(a => a.folder_id == req.params.id);
    res.json({ success: true, data: folderArsip });
});

// UPLOAD TANPA VERIFIKASI SAMA SEKALI
app.post('/api/folders/:id/arsip', upload.single('berkas'), (req, res) => {
    try {
        const { judul_arsip } = req.body; 
        const file = req.file;
        
        let filename = '';
        let tipe_file = 'FILE';

        if (file) {
            const ext = path.extname(file.originalname);
            filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
            const targetPath = path.join('/tmp', filename);
            fs.writeFileSync(targetPath, file.buffer);
            tipe_file = ext;
        }
        
        const newArsip = {
            id: Date.now(),
            folder_id: req.params.id,
            user_id: 1,
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