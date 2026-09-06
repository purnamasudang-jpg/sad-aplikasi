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
    isRegisterMode =!isRegisterMode;
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

    const endpoint = isRegisterMode? '/api/register' : '/api/login';

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
        alert('Gagal konek ke server');
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
        fetchFolders();
    } else {
        viewAuth.style.display = 'block';
        viewMain.style.display = 'none';
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
    box.style.display = box.style.display === 'none'? 'block' : 'none';
});

document.getElementById('btnBack').addEventListener('click', () => {
    currentFolder = null;
    document.getElementById('viewInsideFolder').style.display = 'none';
    document.getElementById('viewFolders').style.display = 'block';
    fetchFolders();
});

async function fetchDocsInFolder() {
    try {
        const response = await fetch(`${FOLDER_URL}/${currentFolder.id}/arsip`, {
            headers: { 'user-id': currentUser.id }
        });
        const result = await response.json();
        allDocsInFolder = result.data;
        renderTable(allDocsInFolder);
    } catch (error) {
        console.error(error);
    }
}

function renderTable(dataList) {
    const dataTable = document.getElementById('dataTable');
    dataTable.innerHTML = '';
    
    if (dataList.length === 0) {
        dataTable.innerHTML = '<tr><td colspan="5" style="text-align:center;">Folder ini masih kosong.</td></tr>';
        return;
    }

    dataList.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${item.nama_dokumen}</strong></td>
            <td>${item.tipe_file}</td>
            <td>${item.file_url || '-'}</td>
            <td><button class="btn-delete" onclick="deleteArsip(${item.id})">Hapus</button></td>
        `;
        dataTable.appendChild(row);
    });
}

// INI BAGIAN YG DIBENERIN
document.getElementById('arsipForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const folderId = document.getElementById('folder_id_hidden').value;
    const nama_dokumen = document.getElementById('judul_arsip').value;
    const fileInput = document.getElementById('berkas');

    let tipe_file = 'FILE';
    let file_url = '';
    if (fileInput.files[0]) {
        file_url = fileInput.files[0].name; // sementara simpan nama file
        const ext = fileInput.files[0].name.split('.').pop().toUpperCase();
        tipe_file = ext;
    }

    try {
        const response = await fetch(`${FOLDER_URL}/${folderId}/arsip`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'user-id': currentUser.id
            },
            body: JSON.stringify({ 
                nama_dokumen: nama_dokumen,
                file_url: file_url,
                tipe_file: tipe_file,
                user_id: currentUser.id // WAJIB INI
            })
        });

        const resData = await response.json();

        if (response.ok) {
            document.getElementById('arsipForm').reset();
            document.getElementById('uploadBox').style.display = 'none';
            fetchDocsInFolder();
            alert('Dokumen berhasil disimpan!');
        } else {
            alert(resData.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Gagal simpan: ' + error.message);
    }
});

async function deleteFolder(id) {
    if (confirm('Hapus folder ini?')) {
        await fetch(`${FOLDER_URL}/${id}`, { 
            method: 'DELETE',
            headers: { 'user-id': currentUser.id }
        });
        fetchFolders();
    }
}

async function deleteArsip(id) {
    if (confirm('Hapus dokumen ini?')) {
        await fetch(`/api/arsip/${id}`, { 
            method: 'DELETE',
            headers: { 'user-id': currentUser.id }
        });
        fetchDocsInFolder();
    }
}
