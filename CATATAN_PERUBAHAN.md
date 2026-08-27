# Catatan Perubahan — Sinkronisasi dengan KBMDU UPDATE TERAKHIR

## Ringkasan
`index.html` di repo ini disamakan dengan `Index.html` terbaru dari paket
**KBMDU UPDATE TERAKHIR**, dengan tetap mempertahankan bagian yang memang
khusus untuk hosting statis di GitHub (favicon/manifest/PWA & pendaftaran
service worker) karena bagian itu tidak ada di paket Apps Script.


## Perbaikan performa pengambilan data (aplikasi cepat & responsif)

### 1. Cache opsi filter (Kecamatan/Desa/Periode) di server

Sebelumnya `getFilterOptions` **menscan seluruh 3.652 baris** dari cache data mentah
SETIAP kali aplikasi dibuka/login (hasilnya jarang berubah). Sekarang hasilnya
di-cache per-user (5 menit) di Script Properties — scan 3.652 baris hanya terjadi
sekali per masa berlaku, bukan setiap buka aplikasi. Cache otomatis dibuang begitu
ada perubahan data (simpan hasil penelusuran, edit Sheet manual, rename username,
arsip periode).

### 2. Cegah rebuild cache Dashboard ganda di jam sibuk (LockService)

`ensureDashboardCache_` sebelumnya hanya mengandalkan flag variabel global
(`DASHCACHE_REBUILDING_`) yang TIDAK melindungi antar-request Apps Script yang
berjalan bersamaan — kalau 2+ petugas membuka Dashboard/Report/Papan Peringkat
hampir bersamaan saat cache kotor, SEMUANYA bisa memicu rebuild penuh (scan 3.652
baris + bangun semua agregasi + tulis ulang sheet) serentak. Sekarang rebuild
dibungkus **LockService**: hanya request pertama yang rebuild, request lain
menunggu (maks 25 detik) lalu memakai hasilnya.

### 3. Prefetch Daftar Kendaraan ditunda saat login

Saat login, aplikasi sebelumnya menjalankan 3 panggilan server hampir serentak:
`loadFilterOptions` + `prefetchDefaultList_` + `getDashboardBundle` (dashboard).
Di HP dengan koneksi lambat ini saling memperlambat. Prefetch daftar sekarang
ditunda sampai browser menganggur (`requestIdleCallback`/`setTimeout`), jadi
Dashboard & filter options tampil lebih dulu — daftar tetap ter-prefetch di
belakang layar tanpa bikin login terasa berat.

### 4. Dropdown filter diisi dengan string HTML sekaligus

`loadFilterOptions` sebelumnya membuat elemen `<option>` satu-per-satu
(`createElement` + `appendChild`) untuk puluhan kecamatan/desa/periode — lambat
di HP dan memicu banyak reflow DOM. Sekarang diisi lewat SATU string HTML sekaligus
(`innerHTML`), jauh lebih cepat.

### 5. Catatan: server sudah optimal sebelumnya

- Semua fungsi baca (daftar, detail, dashboard, laporan, leaderboard) memakai
  `getKendaraanRawCached_` (cache data mentah 5 menit, di-patch per-baris saat
  simpan, bukan dihapus total).
- `getKendaraanList_core` hanya mengonversi baris yang benar-benar dirender
  (pagination), bukan semua 3.652 baris.
- Dashboard/Report/Leaderboard membaca dari **DashboardCache** (agregasi satu-pass,
  lazy rebuild), bukan menscan ulang Sheet.
- Payload per halaman daftar cuma ±11 KB — data bukan biaya dominan.

## Perbaikan terbaru (analisis penyebab "berat/lambat/tidak responsif")

### 1. Bug fatal: aplikasi tidak bisa dijalankan sama sekali (paling berdampak)

Ditemukan fungsi `loadLeaderboard()` di `Index.html` (paket KBMDU) yang **tidak
ditutup dengan kurung kurawal `}`** — kemungkinan akibat edit parsial sebelumnya.
Seluruh JavaScript di halaman gagal di-parse browser, sehingga aplikasi **tidak
jalan sama sekali** (layar kosong / error di console). Ini yang paling mungkin
dirasakan sebagai "aplikasi berat, lambat, tidak responsif" — sebenarnya aplikasi
tidak berfungsi total. Sekarang sudah ditutup dengan benar.

### 2. Fungsi skeleton chart hilang (`skelLbChart_`)

Fungsi `skelLbChart_()` (placeholder loading grafik Papan Peringkat/Dashboard)
**tidak ada** di `Index.html` KBMDU, padahal dipanggil di 2 tempat. Kalau
Dashboard/Papan Peringkat dibuka, browser akan error `skelLbChart_ is not
defined`. Fungsi ini sudah ditambahkan kembali.

### 3. Shim `google.script.run` tanpa retry/timeout (kadang error di lapangan)

`Index.html` KBMDU masih memakai shim versi lama: setiap panggilan ke server
Apps Script hanya dilakukan **satu kali** — begitu koneksi HP putus sesaat atau
server sedang sibuk (kuota "too many simultaneous invocations"), langsung
menampilkan error dan petugas harus menekan ulang sendiri. Sekarang diselaraskan
dengan versi terbaru di Repo_Github:
- **Retry otomatis** (maks 2× ulang, total 3×) untuk error sementara (server
  sibuk / koneksi putus), dengan jeda backoff 0,7–2,5 detik.
- **Timeout 25 detik** — panggilan tidak pernah menggantung tanpa batas.
- **Ping cold-start** di latar belakang begitu halaman dibuka, supaya login
  pertama tidak kena "cold start" Apps Script yang lama.

### 4. Verifikasi menyeluruh

- `Index.html` KBMDU & `index.html` Repo_Github: sintaks valid (node --check).
- Semua fungsi lokal yang dipanggil **terdefinisi** (cek AST).
- Eksekusi blok JS di lingkungan simulasi **tanpa error**; `google.script.run`,
  `callServerFn_`, `skelLbChart_`, `loadLeaderboard` semua tersedia.
- `_script_check.js` (alat verifikasi di paket KBMDU) **diperbaiki** — sebelumnya
  merupakan ekstrak yang rusak/terpotong sehingga cek sintaks selalu gagal.
## Fitur/perbaikan baru yang ikut masuk dari update KBMDU
- **Tombol "Unduh Daftar (Semua)"** di layar Daftar Kendaraan — label tombol
  otomatis mengikuti tab/kategori yang sedang aktif (Semua / Belum
  Ditelusuri / Sudah Ditelusuri / Sudah Bayar / Belum Bayar), mengunduh
  Excel sesuai filter yang sedang tampil di layar.
- **Tombol "Cetak Per Kecamatan"** di layar Report — mencetak PDF rekap
  ringkas per kecamatan (tanpa rincian per desa), terpisah dari export
  Excel/PDF rekap lengkap yang sudah ada.
- **Optimasi render Daftar Kendaraan** — kartu kendaraan sekarang dirender
  sebagai string HTML sekaligus (bukan satu-per-satu lewat DOM API) dan
  memakai satu event listener bersama (event delegation) di kontainer
  daftar, bukan satu listener per kartu — mengurangi beban render saat
  daftar panjang.
- **Shim `google.script.run` (fetch ke Apps Script) ditulis ulang** lebih
  ringkas dan rapi; nama variabel URL endpoint berubah dari `API_URL`
  menjadi `API_URL_`, nilainya tetap sama (deployment Apps Script yang
  sudah ada, tidak perlu diganti).
- **Perbaikan tampilan**: kontainer aplikasi (`#app`), bottom navigation,
  dan sheet pemilih kecamatan tidak lagi dibatasi lebar maksimum 520px —
  sekarang responsif penuh mengikuti lebar layar (mobile maupun
  tablet/desktop).
- Judul di layar login diperbaiki dari salah ketik "SAKTI PKBK" menjadi
  "SAKTI PKB" (judul tab browser sebelumnya sudah benar).
- Script pihak ketiga (Leaflet, XLSX, jsPDF) sekarang dimuat dengan atribut
  `defer` supaya layar login tampil lebih cepat di jaringan lambat.

## Bagian yang SENGAJA dipertahankan (khusus repo GitHub, tidak ada di paket KBMDU)
Paket KBMDU berisi `Index.html` untuk disalin ke proyek Apps Script (dibuka
lewat `doGet()`), sedangkan repo ini adalah versi hosting statis (GitHub
Pages) dari file HTML yang sama — jadi beberapa bagian berikut tetap
dipertahankan karena hanya relevan untuk hosting statis:
- Tag `<link>`/`<meta>` favicon, `manifest.json`, dan meta PWA
  (`theme-color`, `mobile-web-app-capable`, dll.) di `<head>`.
- Pendaftaran service worker (`sw.js`) di akhir skrip — syarat agar Chrome
  bisa membuatkan WebAPK resmi saat "Install app"/"Add to Home screen".

`sw.js` dan `manifest.json` tidak ada perubahan pada update kali ini.

---

# Catatan Perubahan Sebelumnya — Role Viewer + Optimasi Performa

## 1. Role baru: **Viewer**

- Role akun sekarang ada 3: `admin`, `petugas`, `viewer`.
- **Viewer HANYA bisa melihat**: Dashboard, Daftar Kendaraan, Report, dan Papan Peringkat
  (persis 4 menu yang diminta). Menu "Kelola Akun" dan "Log Aktivitas" tetap khusus admin.
- Saat viewer membuka **Detail Kendaraan**, kartu "Update Hasil Penelusuran" (form isi
  tanggal, status, peta lokasi, kamera bukti foto, tombol Simpan) **tidak ditampilkan sama
  sekali** — diganti kartu ringkasan **hanya-baca** berisi hasil penelusuran yang sudah ada
  (kalau ada). Peta & permintaan lokasi GPS juga tidak pernah dijalankan untuk viewer, karena
  memang tidak diperlukan.
- Untuk keperluan **melihat data**, viewer diberi akses penuh seperti admin (bukan dibatasi
  per-tugas seperti petugas) — karena viewer memang tidak punya "kendaraan yang ditugaskan".
  Dashboard & Papan Peringkat viewer akan menampilkan tampilan gaya "admin" (semua kecamatan),
  bukan tampilan sempit ala petugas.
- **Pemblokiran aksi ubah/tambah data dilakukan di server** (fungsi `assertCanEdit_` di
  `Code.gs`), bukan cuma menyembunyikan tombol di layar HP. Jadi walau ada yang mencoba
  memaksa lewat console browser, permintaan simpan/upload foto tetap ditolak oleh server
  kalau akunnya viewer.
- Cara membuat akun viewer: buka **Kelola Akun** (login sebagai admin) → **Tambah Akun Baru**
  → pilih peran **Viewer**. Bisa juga lewat impor Excel, isi kolom **PERAN** dengan
  `viewer` (boleh huruf besar/kecil bebas).
- **Perbaikan bug**: sebelumnya, kalau admin **mengedit** akun yang sudah ada lewat Kelola
  Akun, perannya selalu tertulis balik jadi "petugas" walau dipilih "admin" di dropdown
  (kecuali admin). Sekarang perbaikan ini otomatis berlaku juga untuk peran "viewer" — role
  yang dipilih di dropdown akan benar-benar tersimpan.

## 2. Optimasi performa

- **Saat menyimpan hasil penelusuran** (`saveKendaraanUpdate_core`): sebelumnya, SETIAP kali
  tombol "Simpan" ditekan, aplikasi membaca ulang **satu kolom penuh Nopol** langsung dari
  Google Sheets hanya untuk mencari baris yang mau diubah — baru setelah itu membaca ulang
  barisnya, lalu menulis. Itu berarti 3 permintaan terpisah ke Google Sheets setiap kali
  simpan. Sekarang pencarian posisi baris memakai data yang sudah ada di **cache** (yang
  sudah dipakai bersama oleh Daftar Kendaraan/Dashboard/Detail), sehingga permintaan ke
  Google Sheets berkurang 1 kali per penyimpanan — dengan jaring pengaman: kalau ternyata
  data di cache sudah tidak sama dengan Sheet yang sesungguhnya (jarang terjadi), aplikasi
  otomatis jatuh balik ke cara lama (baca ulang penuh) supaya data **tidak pernah** salah
  tertulis ke baris yang keliru.
- Viewer tidak lagi memicu inisialisasi peta (Leaflet) maupun permintaan lokasi GPS saat
  membuka detail kendaraan (karena memang tidak butuh form input) — mengurangi beban di
  perangkat viewer.

## Catatan jujur soal "performa aplikasi terasa berat"

Setelah ditelusuri, aplikasi ini sebenarnya **sudah cukup banyak dioptimasi sebelumnya**
(sudah ada caching daftar kendaraan, pencarian dengan debounce, pagination, kompresi foto
sebelum diunggah, retry otomatis saat Google Sheets sibuk, dsb — semua terlihat dari
komentar-komentar di kode). Bagian yang paling realistis membuat proses **membuat/menyimpan
data** terasa berat biasanya adalah:

1. **Unggah foto bukti ke Google Drive** — ini operasi yang secara alami lebih lambat
   daripada baca/tulis ke Sheets di Apps Script (kadang 1–3 detik), apalagi kalau sinyal
   internet petugas di lapangan lemah. Foto sudah dikompres di sisi HP sebelum diunggah,
   jadi ukuran file bukan penyebab utamanya — sinyal jaringan lebih berpengaruh di sini.
2. Kalau banyak petugas menyimpan data **bersamaan** dalam waktu berdekatan, Google Sheets
   API punya kuota/antrian sendiri — aplikasi ini sudah menangani itu dengan retry otomatis
   (coba lagi otomatis kalau kena limit), tapi tetap akan terasa sedikit lebih lambat saat
   jam sibuk dibanding saat sepi.

Kalau ada langkah/menu tertentu yang menurut Anda paling terasa berat (misalnya: buka daftar
kendaraan, buka detail, atau justru saat menekan Simpan), beri tahu saya nanti — supaya bisa
saya telusuri lebih spesifik ke titik itu.
