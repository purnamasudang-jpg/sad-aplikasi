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

// Sistem Autentikasi User (Toggle Login / Register)
authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    
    let nameFieldContainer = document.getElementById('nameFieldContainer');
    
    if (isRegisterMode) {
        authTitle.textContent = 'Daftar Akun Baru SAD';
        btnAuthSubmit.textContent = 'Daftar Sekarang';
        authToggleText.textContent = 'Sudah punya akun?';
        authToggleLink.textContent = 'Login di sini';
        
        if (!nameFieldContainer) {
            const div = document.createElement('div');
            div.id = 'nameFieldContainer';
            div.style.marginBottom = '10px';
            div.innerHTML = `<input type="text" id="auth_nama" placeholder="Nama Lengkap" required style="width:100%; padding:8px;">`;
            authForm.prepend(div);
        }
    } else {
        authTitle.textContent = 'Login Akun SAD';
        btnAuthSubmit.textContent = 'Masuk';
        authToggleText.textContent = 'Belum punya akun?';
        authToggleLink.textContent = 'Daftar Akun Baru';
        
        if (nameFieldContainer) {
            nameFieldContainer.remove();
        }
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth_username').value;
    const password = document.getElementById('auth_password').value;
    const nama = isRegisterMode ? document.getElementById('auth_nama').value : '';

    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    const payload = isRegisterMode ? { nama, email, password } : { email, password };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const resData = await response.json();

        if (response.ok && resData.success) {
            alert(resData.message);
            if (isRegisterMode) {
                authToggleLink.click();
            } else {
                currentUser = resData.user;
                localStorage.setItem('sad_user', JSON.stringify(currentUser));
                checkAuth();
            }
        } else {
            alert(resData.message || 'Terjadi kesalahan');
        }
    } catch (err) {
        console.error(err);
        alert('Gagal terhubung ke server backend');
    }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('sad_user');
    currentUser = null;
    checkAuth();
});

function checkAuth() {
    if (currentUser) {
        if (viewAuth) viewAuth.style.display = 'none';
        if (viewMain) viewMain.style.display = 'block';
        fetchFolders();
    } else {
        if (viewAuth) viewAuth.style.display = 'block';
        if (viewMain) viewMain.style.display = 'none';
    }
}

// Logika Aplikasi Folder & Dokumen Terisolasi
async function fetchFolders() {
    try {
        const response = await fetch(`${FOLDER_URL}/${currentUser.id}`);
        const result = await response.json();
        if (result.success) {
            renderFolderGrid(result.folders);
        }
    } catch (error) {
        console.error('Gagal mengambil folder:', error);
    }
}

function renderFolderGrid(folders) {
    const folderGrid = document.getElementById('folderGrid');
    if (!folderGrid) return;
    folderGrid.innerHTML = '';
    
    if (!folders || folders.length === 0) {
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
            <div style="font-size: 40px; margin-bottom: 5px;">ðŸ“</div>
            <strong style="color: #2d3748; display: block; word-break: break-word;">${folder.nama_folder}</strong>
            <button onclick="event.stopPropagation(); deleteFolder(${folder.id})" style="margin-top: 10px; background: #e53e3e; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">Hapus</button>
        `;
        card.addEventListener('click', () => openFolder(folder));
        folderGrid.appendChild(card);
    });
}

const folderForm = document.getElementById('folderForm');
if (folderForm) {
    folderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('nama_folder_input');
        
        try {
            const response = await fetch(FOLDER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    user_id: currentUser.id,
                    nama_folder: input.value 
                })
            });
            const resData = await response.json();
            
            if (response.ok && resData.success) {
                input.value = '';
                fetchFolders();
            } else {
                alert(resData.message);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
}

async function openFolder(folder) {
    currentFolder = folder;
    document.getElementById('currentFolderName').textContent = `ðŸ“ ${folder.nama_folder}`;
    document.getElementById('folder_id_hidden').value = folder.id;

    document.getElementById('uploadBox').style.display = 'none';
    document.getElementById('viewFolders').style.display = 'none';
    document.getElementById('viewInsideFolder').style.display = 'block';

    fetchDocsInFolder();
}

const btnToggleUpload = document.getElementById('btnToggleUpload');
if (btnToggleUpload) {
    btnToggleUpload.addEventListener('click', () => {
        const box = document.getElementById('uploadBox');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    });
}

const btnBack = document.getElementById('btnBack');
if (btnBack) {
    btnBack.addEventListener('click', () => {
        currentFolder = null;
        document.getElementById('viewInsideFolder').style.display = 'none';
        document.getElementById('viewFolders').style.display = 'block';
        fetchFolders();
    });
}

// Handler Upload Dokumen yang Diperbarui
const uploadForm = document.getElementById('uploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(uploadForm);
        formData.append('user_id', currentUser.id);
        formData.append('folder_id', currentFolder.id);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const resData = await response.json();

            if (response.ok && resData.success) {
                alert('Dokumen berhasil diunggah!');
                uploadForm.reset();
                document.getElementById('uploadBox').style.display = 'none';
                fetchDocsInFolder();
            } else {
                alert(resData.message || 'Gagal mengunggah dokumen');
            }
        } catch (error) {
            console.error('Error saat upload:', error);
            alert('Terjadi kesalahan saat menghubungi server.');
        }
    });
}

async function fetchDocsInFolder() {
    console.log('Membuka isi folder:', currentFolder.id);
}

async function deleteFolder(id) {
    if (confirm('Hapus folder ini?')) {
        alert('Fitur hapus folder segera disempurnakan.');
        fetchFolders();
    }
}

