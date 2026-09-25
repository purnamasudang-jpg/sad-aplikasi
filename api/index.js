require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { put, del } = require('@vercel/blob');
const { supabase } = require('../supabase');

const app = express();

// Pengirim email untuk fitur Lupa Password (pakai Gmail SMTP + App Password).
// SAD_EMAIL_USER dan SAD_EMAIL_PASS diset lewat Environment Variables Vercel.
const transporterEmail = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SAD_EMAIL_USER,
        pass: process.env.SAD_EMAIL_PASS
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Hapus file di Vercel Blob berdasarkan URL-nya. Dibuat "aman" (tidak
// melempar error) supaya kalau filenya sudah tidak ada / URL kosong,
// proses hapus data di database tetap bisa lanjut.
async function hapusBlobJikaAda(fileUrl) {
    if (!fileUrl) return;
    try {
        await del(fileUrl, { token: process.env.SAD_BLOB_READ_WRITE_TOKEN });
    } catch (e) {
        console.error('Gagal menghapus file di Vercel Blob:', fileUrl, e);
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
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username dan password wajib diisi' });
    }

    try {
        const { data: existing } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (existing) {
            return res.status(400).json({ success: false, error: 'Username sudah terdaftar' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ username, password: hashedPassword }])
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
            .single();

        if (!user) {
            return res.status(401).json({ success: false, error: 'Username atau password salah' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            await catatAktivitas('Login Berhasil', user.id);
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role || 'Operator' } });
        } else {
            res.status(401).json({ success: false, error: 'Username atau password salah' });
        }
    } catch (err) {
        res.status(401).json({ success: false, error: 'Username atau password salah' });
    }
});

// API Lupa Password — kirim link reset ke email pengguna
app.post('/api/forgot-password', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'Email / username wajib diisi' });
    }

    // Pesan balasan dibuat SAMA baik akunnya ketemu atau tidak, supaya
    // orang lain tidak bisa menebak-nebak email mana saja yang terdaftar.
    const pesanUmum = { success: true, message: 'Jika akun terdaftar, link reset password telah dikirim ke email Anda.' };

    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (!user) {
            return res.json(pesanUmum);
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // link berlaku 1 jam

        await supabase
            .from('users')
            .update({ reset_token: token, reset_token_expiry: expiry.toISOString() })
            .eq('id', user.id);

        const linkReset = `${req.protocol}://${req.get('host')}/?reset=${token}`;

        await transporterEmail.sendMail({
            from: `"SAD - Sistem Arsip Digital" <${process.env.SAD_EMAIL_USER}>`,
            to: user.username,
            subject: 'Reset Password Akun SAD',
            html: `
                <p>Halo,</p>
                <p>Kami menerima permintaan untuk mengatur ulang password akun SAD Anda.</p>
                <p><a href="${linkReset}" style="background:#3e2723;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Buat Password Baru</a></p>
                <p>Atau salin tautan berikut ke browser Anda:<br>${linkReset}</p>
                <p>Tautan ini hanya berlaku selama 1 jam. Jika Anda tidak meminta reset password, abaikan email ini.</p>
            `
        });

        await catatAktivitas('Permintaan Reset Password', user.id);
        res.json(pesanUmum);
    } catch (err) {
        console.error('Gagal proses forgot-password:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server, coba lagi nanti' });
    }
});

// API Reset Password — simpan password baru berdasarkan token dari email
app.post('/api/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Data tidak lengkap' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
    }

    try {
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('reset_token', token)
            .single();

        if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
            return res.status(400).json({ success: false, error: 'Link reset tidak valid atau sudah kedaluwarsa. Silakan minta link baru.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await supabase
            .from('users')
            .update({ password: hashedPassword, reset_token: null, reset_token_expiry: null })
            .eq('id', user.id);

        await catatAktivitas('Reset Password Berhasil', user.id);
        res.json({ success: true, message: 'Password berhasil diubah, silakan login dengan password baru.' });
    } catch (err) {
        console.error('Gagal proses reset-password:', err);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server, coba lagi nanti' });
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

        if (user) {
            res.json({ id: user.id, username: user.username, role: user.role || 'Operator' });
        } else {
            res.status(404).json({ error: 'User tidak ditemukan' });
        }
    } catch (err) {
        res.status(404).json({ error: 'User tidak ditemukan' });
    }
});

// Cek apakah pemanggil API adalah Admin. Dipakai untuk melindungi
// endpoint manajemen pengguna supaya hanya pengendali (Admin) yang bisa akses.
async function apakahAdmin(userId) {
    if (!userId || isNaN(userId)) return false;
    const { data: requester } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();
    return !!requester && requester.role === 'Admin';
}

// API Manajemen Pengguna (khusus Admin) — menampilkan semua akun asli
app.get('/api/users', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    try {
        if (!(await apakahAdmin(userId))) {
            return res.status(403).json({ success: false, error: 'Hanya Admin yang bisa melihat daftar pengguna' });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, role')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Hapus Akun Pengguna (khusus Admin, tidak bisa hapus akun sendiri)
app.delete('/api/users/:id', async (req, res) => {
    const requesterId = parseInt(req.headers['user-id']);
    const targetId = parseInt(req.params.id);
    try {
        if (!(await apakahAdmin(requesterId))) {
            return res.status(403).json({ success: false, error: 'Hanya Admin yang bisa menghapus akun pengguna' });
        }
        if (requesterId === targetId) {
            return res.status(400).json({ success: false, error: 'Tidak bisa menghapus akun sendiri' });
        }

        const folderIdsTarget = await ambilFolderIdMilikUser(targetId);
        if (folderIdsTarget.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Akun ini masih punya ${folderIdsTarget.length} folder arsip. Hapus/pindahkan folder-foldernya dulu sebelum menghapus akun, supaya data arsip tidak hilang atau tidak jelas pemiliknya.`
            });
        }

        await supabase.from('users').delete().eq('id', targetId);
        await catatAktivitas(`Hapus Akun Pengguna (ID: ${targetId})`, requesterId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
    if (!nama_folder) return res.status(400).json({ success: false, error: 'Nama folder wajib diisi' });

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
        const { data: dokumenDalamFolder } = await supabase
            .from('arsip_dokumen')
            .select('file_path')
            .eq('folder_id', id);

        for (const dok of (dokumenDalamFolder || [])) {
            await hapusBlobJikaAda(dok.file_path);
        }

        await supabase.from('arsip_dokumen').delete().eq('folder_id', id);
        await supabase.from('folders').delete().eq('id', id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Ambil daftar ID folder milik seorang user (dipakai untuk menentukan
// dokumen mana saja yang boleh dilihat user itu, karena tabel arsip_dokumen
// tidak punya kolom user_id sendiri -- kepemilikan ditentukan lewat folder_id)
async function ambilFolderIdMilikUser(userId) {
    const { data: folders, error } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', userId);
    if (error) throw error;
    return (folders || []).map(f => f.id);
}

// API Arsip / Dokumen
app.get('/api/arsip', async (req, res) => {
    const userId = parseInt(req.headers['user-id']);
    try {
        const folderIds = await ambilFolderIdMilikUser(userId);
        if (folderIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const { data: arsip, error } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .in('folder_id', folderIds);

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
        const folderIds = await ambilFolderIdMilikUser(userId);
        if (folderIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const { data: userArsip, error } = await supabase
            .from('arsip_dokumen')
            .select('*')
            .in('folder_id', folderIds);

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

// Membaca isi teks dari berkas yang diunggah (khusus PDF & Word/.docx).
// Untuk tipe file lain (gambar, scan, dll) hasilnya kosong -- karena memang
// tidak bisa "dibaca" tanpa teknologi OCR terpisah.
async function ekstrakTeksDariBerkas(buffer, originalname) {
    const ekstensi = (originalname.split('.').pop() || '').toLowerCase();
    try {
        if (ekstensi === 'pdf') {
            const data = await pdfParse(buffer);
            return data.text || '';
        }
        if (ekstensi === 'docx') {
            const hasil = await mammoth.extractRawText({ buffer });
            return hasil.value || '';
        }
    } catch (e) {
        console.error('Gagal membaca isi berkas untuk deteksi nomor surat:', e.message);
    }
    return '';
}

// Mencari pola "Nomor : ..." pada teks dokumen (format umum surat dinas/SK
// pemerintahan, misal: "NOMOR : 400.2.1/015/SK/IX/2026")
function cariNomorSuratDariTeks(teks) {
    if (!teks) return null;
    const pola = /NOMOR\s*[:.\-]?\s*([A-Za-z0-9./\-]{5,50})/i;
    const cocok = teks.match(pola);
    if (cocok && cocok[1]) {
        return cocok[1].trim().replace(/[.,;]+$/, '');
    }
    return null;
}

// API Upload Berkas (dipakai halaman Kelola Berkas)
app.post('/api/upload', upload.single('berkas'), async (req, res) => {
    const userId = parseInt(req.headers['user-id'] || req.body.user_id);
    const { folder_id, judul_arsip, instansi_asal, tanggal_dokumen, lokasi_fisik, keterangan } = req.body;
    let { nomor_surat } = req.body;

    const finalJudul = judul_arsip || (req.file ? req.file.originalname : 'Dokumen Tanpa Judul');
    const finalFolderId = folder_id ? parseInt(folder_id) : null;

    if (!finalFolderId) {
        return res.status(400).json({ success: false, error: 'Folder wajib dipilih' });
    }
    if (isNaN(userId)) {
        return res.status(401).json({ success: false, error: 'Sesi pengguna tidak valid, silakan login ulang' });
    }

    try {
        let filePath = null;
        let nomorSuratTerdeteksiOtomatis = false;

        if (req.file) {
            // Kalau pengguna TIDAK mengisi nomor surat secara manual, coba deteksi
            // otomatis dari isi berkas (khusus PDF & Word yang berisi teks asli).
            if (!nomor_surat || !nomor_surat.trim()) {
                const teksBerkas = await ekstrakTeksDariBerkas(req.file.buffer, req.file.originalname);
                const hasilDeteksi = cariNomorSuratDariTeks(teksBerkas);
                if (hasilDeteksi) {
                    nomor_surat = hasilDeteksi;
                    nomorSuratTerdeteksiOtomatis = true;
                }
            }

            const fileName = `${Date.now()}-${req.file.originalname}`;
            const blob = await put(fileName, req.file.buffer, {
                access: 'public',
                token: process.env.SAD_BLOB_READ_WRITE_TOKEN
            });
            filePath = blob.url;
        }

        const { data: newArsip, error } = await supabase
            .from('arsip_dokumen')
            .insert([{
                folder_id: finalFolderId,
                judul_arsip: finalJudul,
                nomor_surat: nomor_surat || '-',
                instansi_asal: instansi_asal || '-',
                tanggal_dokumen: tanggal_dokumen || new Date().toISOString().split('T')[0],
                lokasi_fisik: lokasi_fisik || '-',
                keterangan: keterangan || '-',
                file_path: filePath
            }])
            .select()
            .single();

        if (error) throw error;

        await catatAktivitas('Upload Dokumen', userId);
        res.json({
            success: true,
            message: 'Dokumen berhasil diunggah!',
            data: newArsip,
            nomorSuratTerdeteksiOtomatis: nomorSuratTerdeteksiOtomatis
        });
    } catch (err) {
        console.error('Error upload:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/arsip/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const { data: dokumen } = await supabase
            .from('arsip_dokumen')
            .select('file_path')
            .eq('id', id)
            .single();

        if (dokumen) {
            await hapusBlobJikaAda(dokumen.file_path);
        }

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