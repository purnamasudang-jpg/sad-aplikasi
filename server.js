require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const { supabase } = require('./supabase');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } 
});

async function catatAktivitas(namaAktivitas, userId = 'public') {
    try {
        await supabase.from('aktivitas').insert([{
            aktivitas: namaAktivitas,
            user_id: String(userId),
            waktu: new Date().toISOString()
        }]);
    } catch (e) {
        console.error('Gagal mencatat aktivitas:', e);
    }
}

// API Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }

    try {
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if(existing) {
            return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
        }

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ username, password, kuota_klik: 10 }])
            .select()
            .single();

        if (error) throw error;

        await catatAktivitas('Register Akun Baru', newUser.id);
        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        if(user) {
            await catatAktivitas('Login Berhasil', user.id);
            res.json({ success: true, user: { id: user.id, username: user.username } });
        } else {
            res.status(401).json({ success: false, error: 'Username atau password salah' });
        }
    } catch (err) {
        res.status(401).json({ success: false, error: 'Username atau password salah' });
    }
});

// API Info User & Kuota
app.get('/api/user-info/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if(user) {
            res.json({ id: user.id, username: user.username, kuota_klik: user.kuota_klik || 0 });
        } else {
            res.status(404).json({ error: 'User tidak ditemukan' });
        }
    } catch (err) {
        res.status(404).json({ error: 'User tidak ditemukan' });
    }
});

// API Folders
app.get('/api/folders', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    try {
        const { data: folders, error } = await supabase
            .from('folders')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        await catatAktivitas('Buka / Lihat Daftar Folder', userId);
        res.json({ success: true, data: folders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/folders', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { nama_folder } = req.body;
    if(!nama_folder) return res.status(400).json({ error: 'Nama folder wajib diisi' });

    try {
        const { data: newFolder, error } = await supabase
            .from('folders')
            .insert([{ user_id: userId, nama_folder }])
            .select()
            .single();

        if (error) throw error;
        await catatAktivitas('Buat Folder Baru', userId);
        res.json({ success: true, data: newFolder });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/folders/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await supabase.from('arsip_dokumen').delete().eq('folder_id', id);
        await supabase.from('folders').delete().eq('id', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Arsip / Dokumen
app.get('/api/arsip', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    try {
        const { data: arsip, error } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        await catatAktivitas('Buka Daftar Arsip Dokumen', userId);
        res.json({ success: true, data: arsip });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Pencarian Arsip / Dokumen
app.get('/api/arsip/cari', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const keyword = (req.query.q || '').toLowerCase();
    
    try {
        const { data: userArsip, error } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;

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

        await catatAktivitas(`Pencarian Dokumen: "${keyword}"`, userId);
        res.json({ success: true, data: hasilPencarian });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/arsip', upload.single('berkas'), async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;

    if (!judul_arsip || !folder_id) {
        return res.status(400).json({ error: 'Judul arsip dan folder wajib diisi' });
    }

    try {
        let filePath = null;
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const blob = await put(fileName, req.file.buffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
            filePath = blob.url;
        }

        const { data: newArsip, error } = await supabase
            .from('arsip_dokumen')
            .insert([{
                user_id: userId,
                folder_id: parseInt(folder_id),
                judul_arsip,
                nomor_surat,
                instansi_asal,
                tanggal_dokumen,
                lokasi_fisik,
                keterangan,
                file_path: filePath
            }])
            .select()
            .single();

        if (error) throw error;

        const { data: user } = await supabase.from('users').select('kuota_klik').eq('id', userId).single();
        if (user) {
            await supabase.from('users')
                .update({ kuota_klik: Math.max(0, (user.kuota_klik || 10) - 1) })
                .eq('id', userId);
        }

        await catatAktivitas('Upload / Buat Dokumen Arsip', userId);
        res.json({ success: true, data: newArsip });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Alias Endpoint /api/upload
app.post('/api/upload', upload.single('berkas'), async (req, res) => {
    const userId = parseInt(req.headers['user-id'] || req.body.user_id);
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;

    const finalJudul = judul_arsip || (req.file ? req.file.originalname : 'Dokumen Tanpa Judul');
    const finalFolderId = folder_id ? parseInt(folder_id) : null;

    if (!finalFolderId) {
        return res.status(400).json({ success: false, error: 'Folder wajib dipilih' });
    }

    try {
        let filePath = null;
        if (req.file) {
            const fileName = `${Date.now()}-${req.file.originalname}`;
            const blob = await put(fileName, req.file.buffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
            filePath = blob.url;
        }

        const { data: newArsip, error } = await supabase
            .from('arsip_dokumen')
            .insert([{
                user_id: isNaN(userId) ? 1 : userId,
                folder_id: finalFolderId,
                judul_arsip: finalJudul,
                nomor_surat: nomor_surat || '-',
                instansi_asal: instansi_asal || '-',
                tanggal_dokumen: tanggal_dokumen || null,
                lokasi_fisik: lokasi_fisik || '-',
                keterangan: keterangan || '-',
                file_path: filePath
            }])
            .select()
            .single();

        if (error) throw error;

        await catatAktivitas('Upload Dokumen via /api/upload', userId);
        res.json({ success: true, message: 'Dokumen berhasil diunggah!', data: newArsip });
    } catch (err) {
        console.error('Error upload:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/arsip/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await supabase.from('arsip_dokumen').delete().eq('id', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Rekap Aktivitas
app.get('/api/rekap-aktivitas', async (req, res) => {
    try {
        const { data: aktivitas, error } = await supabase.from('aktivitas').select('*');
        if (error) throw error;
        
        res.json({
            success: true,
            total_aktivitas_klik: aktivitas.length,
            riwayat_aktivitas: aktivitas
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;