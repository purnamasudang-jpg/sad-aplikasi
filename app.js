const API_URL = '/api/arsip';
const FOLDER_URL = '/api/folders';

let currentUser = JSON.parse(localStorage.getItem('sad_user')) || null;
let currentFolder = null;
let allDocsInFolder = [];

// DOM Elements
const viewAuth = document.getElementById('viewAuth');
const viewMain = document.getElementById('viewMain');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const btnAuthSubmit = document.getElementById('btnAuthSubmit');
const authToggleLink = document.getElementById('authToggleLink');
const authToggleText = document.getElementById('authToggleText');

let isRegisterMode = false;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// Sistem Autentikasi User
authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
        authTitle.textContent = 'Daftar Akun Baru SAD';
        btnAuthSubmit.textContent = 'Daftar & Dapatkan 10 Klik Gratis';
        authToggleText.textContent = 'Sudah punya akun?';
        authToggleLink.textContent = 'Login di sini';
    } else {
        authTitle.textContent = 'Login Akun SAD';
        btnAuthSubmit.textContent = 'Masuk';
        authToggleText.textContent = 'Belum punya akun?';
        authToggleLink.textContent = 'Daftar Akun Baru';
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth_username').value;
    const password = document.getElementById('auth_password').value;

    const endpoint = isRegisterMode ? '/api/register' : '/api/login';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const resData = await response.json();

        if (response.ok) {
            alert(resData.message);
            if (isRegisterMode) {
                authToggleLink.click();
            } else {
                currentUser = resData.user;
                localStorage.setItem('sad_user', JSON.stringify(currentUser));
                checkAuth();
            }
        } else {
            alert(resData.error);
        }
    } catch (err) {
        console.error(err);
    }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('sad_user');
    currentUser = null;
    checkAuth();
});

function checkAuth() {
    if (currentUser) {
        viewAuth.style.display = 'none';
        viewMain.style.display = 'block';
        updateUserInfo();
        fetchFolders();
    } else {
        viewAuth.style.display = 'block';
        viewMain.style.display = 'none';
    }
}

async function updateUserInfo() {
    if (!currentUser) return;
    try {
        const res = await fetch(`/api/user-info/${currentUser.id}`);
        const user = await res.json();
        document.getElementById('lblUsername').textContent = user.username;
        document.getElementById('lblKuota').textContent = user.kuota_klik;
        currentUser.kuota_klik = user.kuota_klik;
        localStorage.setItem('sad_user', JSON.stringify(currentUser));
    } catch (err) {
        console.error(err);
    }
}

// Logika Aplikasi Folder & Dokumen
async function fetchFolders() {
    try {
        const response = await fetch(FOLDER_URL, {
            headers: { 'user-id': currentUser.id }
        });
        const result = await response.json();
        renderFolderGrid(result.data);
    } catch (error) {
        console.error('Gagal mengambil folder:', error);
    }
}

function renderFolderGrid(folders) {
    const folderGrid = document.getElementById('folderGrid');
    folderGrid.innerHTML = '';
    
    if (folders.length === 0) {
        folderGrid.innerHTML = '<p style="color:#718096;">Belum ada folder. Buat folder pertama Anda!</p>';
        return;
    }

    folders.forEach(folder => {
        const card = document.createElement('div');
        card.style.cssText = `
            background: #f7fafc; border: 2px solid #cbd5e0; border-radius: 8px;
            padding: 15px; cursor: pointer; text-align: center; transition: all 0.2s;
        `;
        card.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 5px;">📁</div>
            <strong style="color: #2d3748; display: block; word-break: break-word;">${folder.nama_folder}</strong>
            <button onclick="event.stopPropagation(); deleteFolder(${folder.id})" style="margin-top: 10px; background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Hapus</button>
        `;
        card.addEventListener('click', () => openFolder(folder));
        folderGrid.appendChild(card);
    });
}

document.getElementById('folderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('nama_folder_input');
    
    try {
        const response = await fetch(FOLDER_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'user-id': currentUser.id
            },
            body: JSON.stringify({ nama_folder: input.value })
        });
        const resData = await response.json();
        
        if (response.ok) {
            input.value = '';
            updateUserInfo();
            fetchFolders();
        } else {
            alert(resData.error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

async function openFolder(folder) {
    currentFolder = folder;
    document.getElementById('currentFolderName').textContent = `📁 ${folder.nama_folder}`;
    document.getElementById('folder_id_hidden').value = folder.id;

    document.getElementById('uploadBox').style.display = 'none';
    document.getElementById('viewFolders').style.display = 'none';
    document.getElementById('viewInsideFolder').style.display = 'block';

    fetchDocsInFolder();
}

document.getElementById('btnToggleUpload').addEventListener('click', () => {
    const box = document.getElementById('uploadBox');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('btnBack').addEventListener('click', () => {
    currentFolder = null;
    document.getElementById('viewInsideFolder').style.display = 'none';
    document.getElementById('viewFolders').style.display = 'block';
    fetchFolders();
});

async function fetchDocsInFolder() {
    try {
        const response = await fetch(API_URL, {
            headers: { 'user-id': currentUser.id }
        });
        const result = await response.json();
        allDocsInFolder = result.data.filter(doc => doc.folder_id === currentFolder.id);
        renderTable(allDocsInFolder);
    } catch (error) {
        console.error(error);
    }
}

function renderTable(dataList) {
    const dataTable = document.getElementById('dataTable');
    dataTable.innerHTML = '';
    
    if (dataList.length === 0) {
        dataTable.innerHTML = '<tr><td colspan="7" style="text-align:center;">Folder ini masih kosong.</td></tr>';
        return;
    }

    dataList.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.tanggal_dokumen}</td>
            <td><strong>${item.judul_arsip}</strong></td>
            <td>${item.instansi_asal || '-'}</td>
            <td>${item.lokasi_fisik || '-'}</td>
            <td>${item.file_path ? `<a href="/uploads/${item.file_path}" target="_blank" class="btn-file">📄 Lihat File</a>` : 'Tidak Ada'}</td>
            <td><button class="btn-delete" onclick="deleteArsip(${item.id})">Hapus</button></td>
        `;
        dataTable.appendChild(row);
    });
}

document.getElementById('arsipForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('folder_id', document.getElementById('folder_id_hidden').value);
    formData.append('judul_arsip', document.getElementById('judul_arsip').value);
    formData.append('nomor_surat', document.getElementById('nomor_surat').value);
    formData.append('instansi_asal', document.getElementById('instansi_asal').value);
    formData.append('tanggal_dokumen', document.getElementById('tanggal_dokumen').value);
    formData.append('lokasi_fisik', document.getElementById('lokasi_fisik').value);
    formData.append('keterangan', document.getElementById('keterangan').value);
    
    const fileInput = document.getElementById('berkas');
    if (fileInput.files[0]) formData.append('berkas', fileInput.files[0]);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'user-id': currentUser.id },
            body: formData
        });

        const resData = await response.json();

        if (response.ok) {
            document.getElementById('arsipForm').reset();
            document.getElementById('uploadBox').style.display = 'none';
            updateUserInfo();
            fetchDocsInFolder();
            alert('Dokumen berhasil disimpan!');
        } else {
            alert(resData.error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

async function deleteFolder(id) {
    if (confirm('Hapus folder ini?')) {
        await fetch(`${FOLDER_URL}/${id}`, { method: 'DELETE' });
        fetchFolders();
    }
}

async function deleteArsip(id) {
    if (confirm('Hapus dokumen ini?')) {
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        fetchDocsInFolder();
    }
}