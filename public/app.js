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
    const response = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const resData = await response.json();
    if (response.ok) {
        currentUser = resData.user;
        localStorage.setItem('sad_user', JSON.stringify(currentUser));
        checkAuth();
    } else { alert(resData.error); }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('sad_user'); currentUser = null; checkAuth();
});

function checkAuth() {
    if (currentUser && currentUser.id) {
        viewAuth.style.display = 'none'; viewMain.style.display = 'block'; fetchFolders();
    } else {
        localStorage.removeItem('sad_user'); currentUser = null;
        viewAuth.style.display = 'block'; viewMain.style.display = 'none';
    }
}

async function fetchFolders() {
    const res = await fetch(FOLDER_URL, { headers: { 'user-id': currentUser.id } });
    const result = await res.json();
    document.getElementById('folderGrid').innerHTML = result.data.map(f => `
        <div onclick="openFolder(${JSON.stringify(f).replace(/"/g, '&quot;')})" style="background:#f7fafc;border:2px solid #cbd5e0;border-radius:8px;padding:15px;cursor:pointer;text-align:center;">
            <div style="font-size:40px;">📁</div><strong>${f.nama_folder}</strong>
        </div>
    `).join('');
}

document.getElementById('folderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nama = document.getElementById('nama_folder_input').value;
    await fetch(FOLDER_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'user-id': currentUser.id },
        body: JSON.stringify({ nama_folder: nama })
    });
    document.getElementById('nama_folder_input').value = ''; fetchFolders();
});

async function openFolder(folder) {
    currentFolder = folder;
    document.getElementById('currentFolderName').textContent = `📁 ${folder.nama_folder}`;
    document.getElementById('folder_id_hidden').value = folder.id;
    document.getElementById('viewFolders').style.display = 'none';
    document.getElementById('viewInsideFolder').style.display = 'block';
    fetchDocsInFolder();
}

document.getElementById('btnBack').addEventListener('click', () => {
    document.getElementById('viewInsideFolder').style.display = 'none';
    document.getElementById('viewFolders').style.display = 'block'; fetchFolders();
});

async function fetchDocsInFolder() {
    const res = await fetch(`${FOLDER_URL}/${currentFolder.id}/arsip`, { headers: { 'user-id': currentUser.id } });
    const result = await res.json();
    document.getElementById('dataTable').innerHTML = result.data.map((item, i) => `
        <tr><td>${i+1}</td><td>${item.nama_dokumen}</td><td>${item.tipe_file}</td><td>${item.file_url}</td></tr>
    `).join('');
}

// INI YG BUAT UPLOAD
document.getElementById('arsipForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(document.getElementById('arsipForm'));
    formData.append('user_id', currentUser.id);
    const response = await fetch(`${FOLDER_URL}/${currentFolder.id}/arsip`, {
        method: 'POST', headers: { 'user-id': currentUser.id }, body: formData
    });
    const resData = await response.json();
    if (response.ok) {
        alert('Berhasil!'); document.getElementById('arsipForm').reset(); fetchDocsInFolder();
    } else { alert(resData.error); }
});