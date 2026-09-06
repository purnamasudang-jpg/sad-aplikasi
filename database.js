const initSqlJs = require('sql.js');
let db = null;

async function initDb() {
    if (db) return db;
    const SQL = await initSqlJs();
    db = new SQL.Database();

    // Buat tabel otomatis
    db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_folder TEXT NOT NULL UNIQUE
        );
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
            file_path TEXT
        );
    `);
    
    console.log('Terhubung ke database SQLite (sql.js in-memory).');
    return db;
}

module.exports = {
    getDb: async () => await initDb()
};