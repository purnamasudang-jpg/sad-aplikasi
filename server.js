// ==================== ARsip / DOKUMEN ====================
app.get('/api/folders/:id/arsip', async (req, res) => {
    const folderId = req.params.id;
    const userId = req.headers['user-id'];
    try {
        const database = await getDb();
        // Pastikan folder benar-benar milik user yang sedang login
        const folderCheck = database.exec(`SELECT id FROM folders WHERE id = ${folderId} AND user_id = ${userId}`);
        if (folderCheck.length === 0 || folderCheck[0].values.length === 0) {
            return res.json({ success: false, error: "Folder tidak ditemukan atau akses ditolak." });
        }

        const resQuery = database.exec(`SELECT * FROM arsip WHERE folder_id = ${folderId}`);
        let arsipList = [];
        if (resQuery.length > 0) {
            const cols = resQuery[0].columns;
            arsipList = resQuery[0].values.map(row => {
                let obj = {};
                cols.forEach((c, i) => obj[c] = row[i]);
                return obj;
            });
        }
        res.json({ success: true, data: arsipList });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/folders/:id/arsip', async (req, res) => {
    const folderId = req.params.id;
    const userId = req.headers['user-id'];
    const { nama_dokumen, file_url, tipe_file } = req.body;
    try {
        const database = await getDb();
        
        // Validasi kepemilikan folder sebelum insert arsip
        const folderCheck = database.exec(`SELECT id FROM folders WHERE id = ${folderId} AND user_id = ${userId}`);
        if (folderCheck.length === 0 || folderCheck[0].values.length === 0) {
            return res.json({ success: false, error: "Akses ditolak ke folder ini." });
        }

        try {
            database.run(`ALTER TABLE arsip ADD COLUMN tipe_file TEXT;`);
        } catch (err) {
            // Kolom sudah ada
        }

        database.run(`INSERT INTO arsip (folder_id, nama_dokumen, file_url, tipe_file) VALUES (?, ?, ?, ?)`, [folderId, nama_dokumen, file_url, tipe_file || 'FILE']);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.delete('/api/arsip/:id', async (req, res) => {
    const arsipId = req.params.id;
    try {
        const database = await getDb();
        database.run(`DELETE FROM arsip WHERE id = ?`, [arsipId]);
        saveDb();
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});