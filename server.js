require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const { supabase } = require('./supabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now to allow file uploads
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting using express-rate-limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Terlalu banyak request. Coba lagi setelah 15 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Input sanitization middleware using xss library
function sanitizeInput(obj) {
    const sanitized = {};
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            sanitized[key] = xss(obj[key].trim());
        } else {
            sanitized[key] = obj[key];
        }
    }
    return sanitized;
}

// File upload validation
const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg'
];

const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Tipe file tidak diizinkan. Hanya PDF, DOC, DOCX, JPG, PNG yang diperbolehkan.'));
        }
        cb(null, true);
    }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Generate JWT token
function generateToken(userId, username) {
    return jwt.sign(
        { userId, username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token tidak ditemukan' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token tidak valid' });
    }
}

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
    const { username, password } = sanitizeInput(req.body);

    if(!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }

    // Password validation
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
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

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ username, password: hashedPassword, kuota_klik: 10 }])
            .select()
            .single();

        if (error) throw error;

        await catatAktivitas('Register Akun Baru', newUser.id);
        res.json({ success: true, message: 'Registrasi berhasil! Silakan login.' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Login
app.post('/api/login', async (req, res) => {
    const { username, password } = sanitizeInput(req.body);

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (!user || error) {
            await catatAktivitas('Login Gagal - Username tidak ditemukan', 'public');
            return res.status(401).json({ success: false, error: 'Username atau password salah' });
        }

        // Verify password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            await catatAktivitas('Login Gagal - Password salah', 'public');
            return res.status(401).json({ success: false, error: 'Username atau password salah' });
        }

        // Generate JWT token
        const token = generateToken(user.id, user.username);

        await catatAktivitas('Login Berhasil', user.id);
        res.json({
            success: true,
            user: { id: user.id, username: user.username },
            token: token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Info User & Kuota (Protected)
app.get('/api/user-info/:id', verifyToken, async (req, res) => {
    const userId = parseInt(req.params.id);

    // Verify user can only access their own data
    if (req.user.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    try {
        const { data: user } = await supabase
            .from('users')
            .select('id, username, kuota_klik')
            .eq('id', userId)
            .single();

        if(user) {
            res.json({ id: user.id, username: user.username, kuota_klik: user.kuota_klik || 0 });
        } else {
            res.status(404).json({ error: 'User tidak ditemukan' });
        }
    } catch (err) {
        console.error('User info error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// API Folders (Protected)
app.get('/api/folders', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { data: folders, error } = await supabase
            .from('folders')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        await catatAktivitas('Buka / Lihat Daftar Folder', userId);
        res.json({ success: true, data: folders });
    } catch (err) {
        console.error('Folders error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

app.post('/api/folders', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { nama_folder } = sanitizeInput(req.body);

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
        console.error('Create folder error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

app.delete('/api/folders/:id', verifyToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.userId;

    try {
        // Verify folder belongs to user
        const { data: folder } = await supabase
            .from('folders')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!folder) {
            return res.status(403).json({ success: false, error: 'Folder tidak ditemukan atau bukan milik Anda' });
        }

        await supabase.from('arsip_dokumen').delete().eq('folder_id', id);
        await supabase.from('folders').delete().eq('id', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete folder error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Arsip / Dokumen (Protected)
app.get('/api/arsip', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { data: arsip, error } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .eq('user_id', userId);

        if (error) throw error;
        await catatAktivitas('Buka Daftar Arsip Dokumen', userId);
        res.json({ success: true, data: arsip });
    } catch (err) {
        console.error('Arsip error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Pencarian Arsip / Dokumen (Protected)
app.get('/api/arsip/cari', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const keyword = sanitizeInput({ q: req.query.q || '' }).q.toLowerCase();

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
        console.error('Search error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

app.post('/api/arsip', upload.single('berkas'), verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = sanitizeInput(req.body);

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
        console.error('Upload arsip error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// Alias Endpoint /api/upload (Protected)
app.post('/api/upload', upload.single('berkas'), verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { folder_id, judul_arsip, nomor_surat, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = sanitizeInput(req.body);

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
                user_id: userId,
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
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

app.delete('/api/arsip/:id', verifyToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.user.userId;

    try {
        // Verify arsip belongs to user
        const { data: arsip } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!arsip) {
            return res.status(403).json({ success: false, error: 'Dokumen tidak ditemukan atau bukan milik Anda' });
        }

        await supabase.from('arsip_dokumen').delete().eq('id', id);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete arsip error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Rekap Aktivitas (Protected - Admin only)
app.get('/api/rekap-aktivitas', verifyToken, async (req, res) => {
    try {
        // Only allow specific users to see all activities
        const adminUsernames = ['admin', 'superadmin'];
        if (!adminUsernames.includes(req.user.username)) {
            return res.status(403).json({ success: false, error: 'Akses ditolak' });
        }

        const { data: aktivitas, error } = await supabase.from('aktivitas').select('*');
        if (error) throw error;

        res.json({
            success: true,
            total_aktivitas_klik: aktivitas.length,
            riwayat_aktivitas: aktivitas
        });
    } catch (err) {
        console.error('Rekap aktivitas error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

// API Statistik Dokumen (Protected)
app.get('/api/statistik-dokumen', verifyToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const { data: arsip, error } = await supabase
            .from('arsip_dokumen')
            .select('nomor_surat')
            .eq('user_id', userId);

        if (error) throw error;

        // Hitung dokumen dengan no_register (nomor_surat tidak kosong)
        const noRegisterCount = arsip.filter(d => d.nomor_surat && d.nomor_surat.trim() !== '-' && d.nomor_surat.trim() !== '').length;

        // Hitung total semua dokumen
        const totalDokumen = arsip.length;

        res.json({
            success: true,
            no_register: noRegisterCount,
            no_surat: totalDokumen,
            total_dokumen: totalDokumen
        });
    } catch (err) {
        console.error('Statistik dokumen error:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan server' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di port ${PORT}`));
}

module.exports = app;