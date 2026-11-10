# Lunas — Debt Tracker

Dashboard cicilan pribadi berbahasa Indonesia. **GitHub Pages + React/Vite + Google Sheets**, dengan pilihan login password melalui Apps Script. Koneksi OAuth langsung sebelumnya tetap tersedia sampai penghubung password dikonfigurasi.

Alamat setelah deployment berhasil: https://yudosand.github.io/tracker_debt/

## Rencana bayar akhir bulan

Tombol **Sembunyikan bunga** hanya mengubah kartu utama Ringkasan Keuangan menjadi total pokok pinjaman awal seluruh kontrak, sebelum dikurangi pembayaran. **Tampilkan bunga** mengembalikan sisa seluruh cicilan termasuk bunga/biaya. Pilihan ini disimpan per browser; nominal pembayaran dan kartu utang tidak berubah.

**Tandai semua cicilan bulan ini dibayar** menampilkan daftar angsuran dalam agenda, total termasuk bunga, tanggal pembayaran bersama, dan konfirmasi transfer. Pembayaran sekaligus tersedia untuk koneksi Apps Script dan demo. Backend memvalidasi semua angsuran dan versi kontrak di dalam satu ScriptLock sebelum menulis satu rentang jurnal. ID tetap pada dialog memungkinkan pengiriman ulang setelah respons terputus tanpa menggandakan catatan. Jika data berubah atau sebagian ID telah tersimpan, muat ulang dan tinjau daftar baru. Riwayat tetap per angsuran dan bisa dikoreksi per catatan. Maksimum 500 angsuran per pengiriman; tidak melunasi tenor mendatang di luar agenda.

Agenda dan total bulanan mengikuti pola pembayaran bersama: pinjaman dengan nama yang memuat kata **Kopkari** dibayar pada bulan jatuh tempo (autodebet); pinjaman lain dibayar pada akhir bulan sebelumnya. Contoh: jatuh tempo 1 atau 23 Desember masuk rencana November. Aturan ini berlaku sama di kedua perangkat melalui `src/payment-plan.ts`, tanpa mengubah jurnal Google Sheets.

Rincian angsuran dan target lunas menampilkan bulan rencana bayar, beserta tanggal jatuh tempo kontrak dan tanggal pembayaran sebenarnya. Total mencakup angsuran yang belum dibayar sampai bulan rencana berjalan, termasuk rencana bulan sebelumnya. Pembayaran yang sudah tercatat dan kontrak lunas tidak dihitung lagi. Agenda menampilkan seluruh pinjaman terkait dalam daftar yang dapat digulir; tombol pembayaran tetap mencatat satu angsuran penuh.

## Login password (direkomendasikan)

Ikuti [panduan pemasangan sekali](public/login-sederhana.html). Pemilik memasang [kode penghubung](public/lunas-apps-script.gs) melalui menu Ekstensi → Apps Script pada spreadsheet lama, mengatur password di Script Properties, menjalankan `setupLunas`, lalu deploy sebagai pemilik dengan akses Anyone. Setiap operasi tetap memerlukan password/sesi yang divalidasi server. Tidak ada data jurnal yang dipindahkan atau dihapus oleh setup.

Di dashboard → Google Sheets, masukkan URL /exec dan password. Dua pengguna dapat memakai password yang sama. Dengan “Ingat perangkat ini”, sesi tersimpan di browser selama maksimal 30 hari dan berlaku lintas tab serta restart browser; tanpa opsi tersebut, sesi hanya di sessionStorage selama maksimal 12 jam. Logout mencabut sesi di server. Setup ulang password mencabut semua sesi. Password dan token OAuth Google tidak disimpan di browser atau repository. Token sesi dashboard adalah kredensial, dan hanya hash token disimpan di server.

Opsional: variable GitHub Actions `APPS_SCRIPT_URL` menjadi konfigurasi URL awal bagi semua perangkat. URL ini publik; jangan mengisi password atau ID spreadsheet pada variable tersebut. `ALLOWED_ORIGIN` di Script Properties harus cocok dengan origin dashboard. Frontend berkomunikasi dengan sandbox HTML Service melalui postMessage yang dibatasi origin dan kanal acak; sandbox menggunakan google.script.run. Tidak menggunakan no-cors atau JSONP untuk mengirim password.

Sumber server ada di `apps-script/`, memakai model jurnal yang sama dengan website. Setelah mengubah server/model, jalankan `npm run script:build`. Pemeriksaan test menolak bundle Apps Script yang tidak sinkron. Apps Script menggunakan ScriptLock, pemeriksaan revisi per kontrak, dan idempotensi ID sebelum menambah baris. Hindari memakai koneksi OAuth lama bersamaan untuk menulis setelah migrasi, karena ScriptLock hanya mengunci penulisan yang melalui Apps Script.

GitHub Pages biasa tetap publik walaupun repository private. Data spreadsheet dilindungi di penghubung server, bukan dengan menyembunyikan source atau hanya mengunci tampilan.

## Koneksi OAuth langsung (opsional)

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

- Tanpa konfigurasi, mode demo menggunakan localStorage dan diberi label jelas. Data finansial live tidak disimpan di localStorage. Konfigurasi dan sesi dashboard yang diingat dapat disimpan di browser.
- Dalam mode OAuth lama, token Google hanya berada di memori tab sehingga reload meminta koneksi kembali. Mode password menggunakan sesi server yang bisa diingat. Error akses tidak pernah mengalihkan data asli diam-diam ke demo.
- Data dibaca saat masuk, setelah perubahan, ketika refresh ditekan, dan tiap 30 detik selama halaman aktif tanpa dialog pembayaran.
- Setiap mutasi **menambah baris** ke tab `Transaksi`; tidak ada penimpaan seluruh spreadsheet. `eventId` mencegah penghitungan ulang pengiriman yang sama. `versiSebelum` menolak transaksi bersamaan yang memakai versi kontrak yang sudah berubah.
- Jurnal diproses berdasarkan urutan baris. Untuk dua pembayaran dengan nomor angsuran yang sama dari tab/perangkat berbeda, hanya transaksi pertama yang sesuai versi yang diterapkan. Konflik tetap tersimpan sebagai bukti dan ditampilkan sebagai peringatan; operasi yang kalah tidak dinyatakan berhasil.
- Pembatalan menambah event `undo`, hanya untuk pembayaran terakhir per kontrak. Transfer bank tidak ikut dibatalkan.
- Jangan menghapus/mengurutkan/mengedit baris sumber, ID, aksi, atau versi. Gunakan filter view untuk membaca. Edit manual langsung di sheet akan dibaca saat sinkronisasi, tetapi struktur yang tidak valid menyebabkan galat atau konflik. Untuk koreksi pembayaran, gunakan tombol pembatalan.
- `Transaksi` adalah sumber data; jangan menjumlahkan semua baris pembayaran mentah tanpa memperhitungkan pembatalan dan konflik. Dashboard menghitung hanya peristiwa yang diterapkan.

## Perhitungan

Setiap kartu utang menampilkan target bulan lunas dan **Rincian N bulan** yang dapat dibuka. Jadwal mencakup nama bulan/tahun, nominal angsuran, jatuh tempo, status, dan tanggal pembayaran sebenarnya. Bulan angsuran mengikuti tanggal jatuh tempo pertama; pembayaran lebih awal atau terlambat tidak menggeser jadwal kontrak. Target lunas adalah akhir jadwal, dengan asumsi pembayaran sesuai jadwal.

Jumlah bulan yang sudah dibayar saat membuat kontrak dianggap sebagai angsuran berurutan dari awal jadwal. Rincian menandainya sebagai saldo awal tanpa mengarang tanggal pembayaran. Pembayaran baru dan pembatalan otomatis memperbarui rincian dari jurnal yang sama, tanpa perubahan struktur spreadsheet.

Total kewajiban = tenor × cicilan bulanan. Pokok pinjaman disimpan terpisah. Contoh Rp10 juta, 12 × Rp1,1 juta: total Rp13,2 juta; setelah 4 bulan, terbayar Rp4,4 juta dan sisa Rp8,8 juta / 8 bulan. Ini sisa cicilan termasuk bunga, bukan sisa pokok atau angka pelunasan dipercepat. Tidak mencakup denda, cicilan parsial, bunga berubah, atau restrukturisasi.

## Akses

Website dan source GitHub publik. Data Google tetap dilindungi OAuth dan izin spreadsheet, tidak disalin ke repo/hosting. Tidak ada client secret atau service-account key. OAuth memakai `https://www.googleapis.com/auth/drive.file`, bukan akses seluruh Google Drive. Spreadsheet lama yang tidak dibuat oleh OAuth app ini belum didukung tanpa alur pemilihan Google Picker; gunakan fitur Buat spreadsheet baru.

## Verifikasi

Tes unit dan simulasi HTTP mencakup hitungan, jurnal, pembayaran ganda, konflik dua tab/perangkat, pembatalan, pemulihan request yang responsnya hilang, payload RAW, dan error login. Tes browser menggunakan mode demo. **Akses live Google baru bisa diverifikasi setelah Client ID dikonfigurasi dan pemilik memberikan izin.**

Referensi: [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
