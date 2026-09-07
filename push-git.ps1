Write-Host 'Memeriksa status repositori Git...' -ForegroundColor Cyan

# Cek status perubahan
git status

# Menambahkan seluruh file yang berubah
Write-Host 'Menambahkan file ke staging area...' -ForegroundColor Cyan
git add .

# Mengambil tanggal dan waktu saat ini untuk pesan commit otomatis
$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$commitMessage = 'Update sistem pada ' + $timestamp

# Melakukan commit
Write-Host ('Melakukan commit dengan pesan: ' + $commitMessage + '...') -ForegroundColor Cyan
git commit -m $commitMessage

# Melakukan push ke branch utama
$currentBranch = (git branch --show-current)
Write-Host ('Mengirim perubahan ke remote (branch: ' + $currentBranch + ')...') -ForegroundColor Cyan
git push origin $currentBranch

Write-Host 'Selesai! Perubahan berhasil dikirim ke Git.' -ForegroundColor Green
