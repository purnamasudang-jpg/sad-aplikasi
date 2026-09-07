const db = require('./db');

db.serialize(() => {
    // 1. Buat Tabel Users
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error("Gagal buat tabel users:", err.message);
        else console.log('Tabel "users" siap.');
    });

    // 2. Buat Tabel Folders (Terisolasi per user_id)
    db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nama_folder TEXT NOT NULL,
            jumlah_file INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) console.error("Gagal buat tabel folders:", err.message);
        else console.log('Tabel "folders" siap dengan sistem isolasi user.');
    });
});

db.close();