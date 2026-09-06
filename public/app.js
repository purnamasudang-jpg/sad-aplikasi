const FOLDER_URL = '/api/folders';
let currentUser = JSON.parse(localStorage.getItem('sad_user')) || null;
let currentFolder = null;

const viewAuth = document.getElementById('viewAuth');
const viewMain = document.getElementById('viewMain');
const authForm = document.getElementById('authForm');

document.addEventListener('DOMContentLoaded', () => { checkAuth(); });

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth_username').value;
    const password = document.getElementById('auth_password').value;
    const endpoint = '/api/login'; // sementara pake login aja biar cepet

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const resData = await response.json();
        if (response.ok) {
            currentUser = resData.user;
            localStorage.setItem('sad_user', JSON.stringify(currentUser));
            checkAuth();
        } else { alert(resData.error); }
    } catch (err) { alert('Gagal konek ke server'); }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('sad_user');
    currentUser = null;
    checkAuth();
});

function checkAuth() {
    if (currentUser && currentUser.id) { // WAJIB ADA .id
        viewAuth.style.display = 'none';
        viewMain.style.display = 'block';
        fetchFolders();
    } else {
        localStorage.removeItem('sad_user'); // hapus data rusak
        currentUser = null;
        viewAuth.style.display = 'block';
        viewMain.style.display = 'none';
    }
}

async function fetchFolders() {
    const response = await fetch(FOLDER_URL, { headers: { 'user-id': currentUser.id } });
    const result = await response.json();
    renderFolderGrid(result.data);
}

function renderFolderGrid(folders) { /* ... sama seperti punya ibu ... */ }

async function openFolder(folder) {
    currentFolder = folder;
    document.getElementById('currentFolderName').textContent = `📁 ${folder.nama_folder}`;
    document.getElementById('folder_id_hidden').value = folder.id;
    document.getElementById('viewFolders').style.display = 'none';
    document.getElementById('viewInsideFolder').style.display = 'block';
    fetchDocsInFolder();
}

async function fetchDocsInFolder() {
    const response = await fetch(`${FOLDER_URL}/${currentFolder.id}/arsip`, { headers: { 'user-id': currentUser.id } });
    const result = await response.json();
    renderTable(result.data);
}

function renderTable(dataList) { /* ... sama seperti punya ibu ... */ }

// INI YG PENTING: KIRIM DENGAN FORMDATA BIAR BISA UPLOAD FILE
document.getElementById('arsipForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const folderId = document.getElementById('folder_id_hidden').value;
    const formData = new FormData(document.getElementById('arsipForm')); // ambil semua form
    formData.append('user_id', currentUser.id); // paksa kirim user_id

    try {
        const response = await fetch(`${FOLDER_URL}/${folderId}/arsip`, {
            method: 'POST',
            headers: { 'user-id': currentUser.id }, // jangan set Content-Type kalau pake FormData
            body: formData
        });
        const resData = await response.json();
        if (response.ok) {
            document.getElementById('arsipForm').reset();
            document.getElementById('uploadBox').style.display = 'none';
            fetchDocsInFolder();
            alert('Dokumen berhasil disimpan!');
        } else { alert(resData.error); }
    } catch (error) { alert('Gagal simpan: ' + error.message); }
});