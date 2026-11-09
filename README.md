# Lunas — Debt Tracker

Dashboard cicilan pribadi berbahasa Indonesia. **GitHub Pages + React/Vite + Google Sheets API**, tanpa server aplikasi dan tanpa Apps Script.

Alamat setelah deployment berhasil: https://yudosand.github.io/tracker_debt/

## Penggunaan pertama

1. Ikuti [panduan Google](public/panduan.html) (juga tersedia di menu Google Sheets pada dashboard).
2. Buat OAuth Client ID Google bertipe **Web application**. Aktifkan Google Sheets API, tambahkan akun Anda sebagai test user saat aplikasi berstatus Testing, lalu daftarkan origin `https://yudosand.github.io`.
3. Di dashboard → Google Sheets, tempel Client ID dan simpan. Client ID bersifat publik; **jangan memasukkan client secret, API key, atau token**.
4. Klik **Hubungkan Google**, pilih akun, dan berikan izin `drive.file`. Aplikasi hanya meminta akses file yang dibuat/diberikan kepada aplikasi ini.
5. Klik **Buat spreadsheet baru**. File privat dengan tab `Transaksi` dan `Panduan` dibuat langsung di akun Anda. Data demo tidak dipindahkan.
6. Tambahkan kontrak, lakukan transfer manual, kemudian klik **Tandai dibayar**. Website mencatat satu angsuran penuh dan memperbarui sisa nominal/tenor setelah Google mengonfirmasi penyimpanan dan data dibaca kembali.

Spreadsheet baru tidak harus diisi melalui Google Cloud atau Apps Script. Client ID dibuat sekali; akun Google dihubungkan lagi setelah reload atau token berakhir. Jika memakai perangkat lain, masukkan Client ID yang sama dan URL spreadsheet yang sebelumnya dibuat, kemudian gunakan akun Google yang sama.

## Deploy GitHub Pages

- Repository Settings → Pages → Source: **GitHub Actions**.
- Workflow `.github/workflows/pages.yml` menjalankan pengujian, pemeriksaan TypeScript, build Vite, dan deploy pada push ke `main`.
- Opsional: Repository Settings → Secrets and variables → Actions → **Variables**, tambahkan `GOOGLE_CLIENT_ID`. Ini Client ID publik, bukan secret. Jika diisi, build berikutnya akan memasukkannya sebagai nilai awal formulir. Bisa juga dibiarkan kosong dan diisi melalui dashboard.
- Jangan commit ID spreadsheet pribadi, data utang, token, atau file kredensial. `.env` dan `.runtime` diabaikan Git.
- Base path default `/tracker_debt/`. Jika memakai domain khusus, sesuaikan `BASE_PATH` dan authorized JavaScript origin Google.

## Menjalankan lokal

Node.js 24+:

```sh
npm ci
npm run dev
npm test
npm run build
```

Buka `http://127.0.0.1:5174/tracker_debt/`. Untuk Google OAuth lokal, gunakan `http://localhost:5174/tracker_debt/` dan daftarkan origin `http://localhost:5174` di Google Cloud. `npm run preview` menyajikan hasil build pada port 4174.

## Penyimpanan dan sinkronisasi

- Tanpa koneksi, mode demo menggunakan localStorage dan diberi label jelas. Konfigurasi koneksi tersimpan di browser; data live dan access token tidak disimpan di localStorage.
- Token hanya berada di memori tab. Setelah reload/kedaluwarsa, pengguna harus menghubungkan Google lagi. Error akses tidak pernah mengalihkan data asli diam-diam ke demo.
- Data dibaca saat masuk, setelah perubahan, ketika refresh ditekan, dan tiap 30 detik selama halaman aktif tanpa dialog pembayaran.
- Setiap mutasi **menambah baris** ke tab `Transaksi`; tidak ada penimpaan seluruh spreadsheet. `eventId` mencegah penghitungan ulang pengiriman yang sama. `versiSebelum` menolak transaksi bersamaan yang memakai versi kontrak yang sudah berubah.
- Jurnal diproses berdasarkan urutan baris. Untuk dua pembayaran dengan nomor angsuran yang sama dari tab/perangkat berbeda, hanya transaksi pertama yang sesuai versi yang diterapkan. Konflik tetap tersimpan sebagai bukti dan ditampilkan sebagai peringatan; operasi yang kalah tidak dinyatakan berhasil.
- Pembatalan menambah event `undo`, hanya untuk pembayaran terakhir per kontrak. Transfer bank tidak ikut dibatalkan.
- Jangan menghapus/mengurutkan/mengedit baris sumber, ID, aksi, atau versi. Gunakan filter view untuk membaca. Edit manual langsung di sheet akan dibaca saat sinkronisasi, tetapi struktur yang tidak valid menyebabkan galat atau konflik. Untuk koreksi pembayaran, gunakan tombol pembatalan.
- `Transaksi` adalah sumber data; jangan menjumlahkan semua baris pembayaran mentah tanpa memperhitungkan pembatalan dan konflik. Dashboard menghitung hanya peristiwa yang diterapkan.

## Perhitungan

Total kewajiban = tenor × cicilan bulanan. Pokok pinjaman disimpan terpisah. Contoh Rp10 juta, 12 × Rp1,1 juta: total Rp13,2 juta; setelah 4 bulan, terbayar Rp4,4 juta dan sisa Rp8,8 juta / 8 bulan. Ini sisa cicilan termasuk bunga, bukan sisa pokok atau angka pelunasan dipercepat. Tidak mencakup denda, cicilan parsial, bunga berubah, atau restrukturisasi.

## Akses

Website dan source GitHub publik. Data Google tetap dilindungi OAuth dan izin spreadsheet, tidak disalin ke repo/hosting. Tidak ada client secret atau service-account key. OAuth memakai `https://www.googleapis.com/auth/drive.file`, bukan akses seluruh Google Drive. Spreadsheet lama yang tidak dibuat oleh OAuth app ini belum didukung tanpa alur pemilihan Google Picker; gunakan fitur Buat spreadsheet baru.

## Verifikasi

Tes unit dan simulasi HTTP mencakup hitungan, jurnal, pembayaran ganda, konflik dua tab/perangkat, pembatalan, pemulihan request yang responsnya hilang, payload RAW, dan error login. Tes browser menggunakan mode demo. **Akses live Google baru bisa diverifikasi setelah Client ID dikonfigurasi dan pemilik memberikan izin.**

Referensi: [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
