import { put } from '@vercel/blob';

export default async function handler(req, res) {
  // Mengizinkan CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const filename = req.query.filename || 'dokumen.pdf';

      // Mengunggah ke Vercel Blob dengan menyertakan Store ID kustom Anda
      const blob = await put(filename, req, {
        access: 'public',
        storeId: process.env.SAD_BLOB_STORE_ID,
      });

      return res.status(200).json({
        success: true,
        message: 'Berhasil mengunggah berkas ke Vercel Blob',
        url: blob.url,
      });
    } catch (error) {
      console.error('Error saat upload ke Vercel Blob:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}