const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Jika berjalan di Vercel, gunakan database in-memory agar tidak error read-only
const dbPath = process.env.VERCEL ? ':memory:' : path.resolve(__dirname, 'data.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Gagal terhubung ke database:', err.message);
    else console.log('Terhubung ke database SQLite (SAD).');
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_folder TEXT NOT NULL UNIQUE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS arsip_dokumen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id INTEGER,
            nomor_surat TEXT,
            judul_arsip TEXT NOT NULL,
            instansi_asal TEXT,
            tanggal_dokumen TEXT NOT NULL,
            lokasi_fisik TEXT,
            keterangan TEXT,
            file_path TEXT,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        )
    `);
});

module.exports = db;