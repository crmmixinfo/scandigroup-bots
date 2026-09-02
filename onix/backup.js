// ============================================================
// ONIX — bazaning zaxira nusxasi
// ============================================================
//
// Har kuni bazaning to'liq nusxasi bitta siqilgan faylga yoziladi:
//     onix-2026-09-03-0300.sql.gz
//
// Fayl Google Drive papkasiga tushsa — Drive uni o'zi bulutga ko'taradi.
// Falokat bo'lsa shu fayldan hamma narsa aynan tiklanadi:
// har bir operatsiya, foydalanuvchi, kategoriya, ID lari bilan.
//
// Google Sheets bu ishni bajara olmaydi: u bog'lanishlarni yo'qotadi,
// sanalarni o'zgartiradi va tahrirlanadi. Sheets — ko'rish uchun,
// zaxira — tiklash uchun.
// ============================================================

const { spawn } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const zlib = require('zlib');

const KEEP    = Number(process.env.ONIX_BACKUP_KEEP) || 30;   // necha kunlik nusxa saqlansin
const TIME    = (process.env.ONIX_BACKUP_TIME || '03:00').trim();
const ENABLED = process.env.ONIX_BACKUP !== 'off';
const TO_TELEGRAM = process.env.ONIX_BACKUP_TELEGRAM !== 'off';

const FILE_RE = /^onix-\d{4}-\d{2}-\d{2}-\d{4}\.sql\.gz$/;

// ---------- Papka ----------

const expandHome = (p) => p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;

// Bulut papkasini o'zi topadi. Qaysi xizmat o'rnatilgan bo'lsa —
// Google Drive, OneDrive, iCloud, Dropbox, Yandex — o'shanisi ishlatiladi.
// Hammasining ishi bir xil: papkaga tushgan faylni bulutga ko'taradi.

const CLOUDS = [
  { name: 'Google Drive', re: /^GoogleDrive-/, sub: 'My Drive' },
  { name: 'OneDrive',     re: /^OneDrive([- ]|$)/ },
  { name: 'Dropbox',      re: /^Dropbox/ },
  { name: 'Box',          re: /^Box/ },
];

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function cloudDir() {
  const home = os.homedir();
  const found = [];

  // macOS, yangi versiyalar: ~/Library/CloudStorage/<Xizmat>-<hisob>
  const cloudStorage = path.join(home, 'Library', 'CloudStorage');
  try {
    for (const entry of fs.readdirSync(cloudStorage).sort()) {
      const cloud = CLOUDS.find(c => c.re.test(entry));
      if (!cloud) continue;
      const base = path.join(cloudStorage, entry);
      const withSub = cloud.sub && path.join(base, cloud.sub);
      found.push({ name: cloud.name, dir: withSub && isDir(withSub) ? withSub : base });
    }
  } catch { /* papka yo'q — muhim emas */ }

  // Uy papkasidagi eski joylashuvlar va Windows
  const legacy = [
    { name: 'Google Drive', dir: path.join(home, 'Google Drive', 'My Drive') },
    { name: 'Google Drive', dir: path.join(home, 'Google Drive') },
    { name: 'iCloud Drive', dir: path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs') },
    { name: 'Dropbox',      dir: path.join(home, 'Dropbox') },
    { name: 'Yandex.Disk',  dir: path.join(home, 'Yandex.Disk.localized') },
    { name: 'Yandex.Disk',  dir: path.join(home, 'Yandex.Disk') },
    { name: 'Google Drive', dir: 'G:\\My Drive' },
  ];
  if (process.env.OneDrive) legacy.unshift({ name: 'OneDrive', dir: process.env.OneDrive });

  // Uy papkasida "OneDrive" yoki "OneDrive - Kompaniya"
  try {
    for (const entry of fs.readdirSync(home)) {
      if (/^OneDrive([- ]|$)/.test(entry)) legacy.push({ name: 'OneDrive', dir: path.join(home, entry) });
    }
  } catch { /* o'qib bo'lmadi */ }

  found.push(...legacy);
  return found.find(c => isDir(c.dir)) || null;
}

// Zaxira qayerga yozilsin:
//   1. .env dagi ONIX_BACKUP_DIR
//   2. topilsa — bulut papkasi ichidagi «ONIX zaxira»
//   3. topilmasa — loyiha ichidagi zaxira/ papkasi
function backupDir() {
  if (process.env.ONIX_BACKUP_DIR) return expandHome(process.env.ONIX_BACKUP_DIR.trim());
  const cloud = cloudDir();
  if (cloud) return path.join(cloud.dir, 'ONIX zaxira');
  return path.join(__dirname, '..', 'zaxira');
}

// Papka bulut ichidami va qaysi xizmatda — foydalanuvchiga aytish uchun
const CLOUD_PATTERNS = [
  [/[/\\](Google ?Drive|GoogleDrive-)/i, 'Google Drive'],
  [/[/\\]OneDrive([- ]|[/\\]|$)/i,     'OneDrive'],
  [/com~apple~CloudDocs/i,                 'iCloud Drive'],
  [/[/\\]Dropbox([/\\]|$)/i,           'Dropbox'],
  [/[/\\]Yandex\.Disk/i,                 'Yandex.Disk'],
  [/[/\\]Box([- ]|[/\\]|$)/i,          'Box'],
];

const cloudName = (dir = backupDir()) =>
  (CLOUD_PATTERNS.find(([re]) => re.test(dir)) || [])[1] || null;

const inCloud = (dir = backupDir()) => cloudName(dir) !== null;

// ---------- pg_dump ----------

// pg_dump har doim ham PATH da bo'lmaydi (Postgres.app, Homebrew, EDB o'rnatuvchi)
function findPgDump() {
  if (process.env.ONIX_PG_DUMP) return process.env.ONIX_PG_DUMP;

  const dirs = [
    '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/usr/local/pgsql/bin',
  ];
  for (const base of ['/Applications/Postgres.app/Contents/Versions', '/Library/PostgreSQL', '/usr/lib/postgresql']) {
    try {
      for (const v of fs.readdirSync(base).sort().reverse()) dirs.push(path.join(base, v, 'bin'));
    } catch { /* yo'q */ }
  }
  for (const dir of dirs) {
    const bin = path.join(dir, 'pg_dump');
    try { fs.accessSync(bin, fs.constants.X_OK); return bin; } catch { /* keyingisi */ }
  }
  return 'pg_dump';   // PATH ga umid qilamiz
}

// Parolni buyruq qatoriga qo'ymaymiz — u `ps` da hammaga ko'rinadi.
// libpq muhit o'zgaruvchilari orqali uzatamiz.
function pgEnv(url = process.env.DATABASE_URL) {
  const env = { ...process.env };
  try {
    const u = new URL(url);
    if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
    if (u.port)     env.PGPORT = u.port;
    if (u.username) env.PGUSER = decodeURIComponent(u.username);
    if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
    const dbname = decodeURIComponent(u.pathname.replace(/^\//, ''));
    if (dbname) env.PGDATABASE = dbname;
    const sslmode = u.searchParams.get('sslmode');
    if (sslmode) env.PGSSLMODE = sslmode;
  } catch {
    return null;   // URL tushunarsiz — chaqiruvchi o'zi hal qiladi
  }
  return env;
}

const pad = (n) => String(n).padStart(2, '0');

// Nom daqiqagacha aniq. Bir daqiqa ichida ikkinchi marta nusxa olinsa
// fayl ustiga yoziladi — mazmuni aynan bir xil, klaster qilib yotishi shart emas.
const fileName = (now = new Date()) =>
  `onix-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}.sql.gz`;

// ---------- Nusxa olish ----------

async function dump(targetDir) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL topilmadi (.env)');

  const dir = targetDir || backupDir();
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, fileName());
  const part = `${file}.part`;          // yarim fayl Drive ga ko'tarilmasin
  const env  = pgEnv();

  const args = ['--no-owner', '--no-privileges', '--clean', '--if-exists'];
  if (!env) args.push(process.env.DATABASE_URL);

  await new Promise((resolve, reject) => {
    const child = spawn(findPgDump(), args, { env: env || process.env });
    const out = fs.createWriteStream(part);

    let stderr = '', code = null, written = false;
    const finish = () => {
      if (code === null || !written) return;
      if (code === 0) return resolve();
      reject(new Error(stderr.trim().split('\n').pop() || `pg_dump xato kodi ${code}`));
    };

    child.on('error', (err) => reject(
      err.code === 'ENOENT'
        ? new Error('pg_dump topilmadi — PostgreSQL o\'rnatilganini tekshiring')
        : err));
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (c) => { code = c; finish(); });

    out.on('error', reject);
    out.on('finish', () => { written = true; finish(); });

    child.stdout.pipe(zlib.createGzip({ level: 9 })).pipe(out);
  }).catch((err) => {
    try { fs.unlinkSync(part); } catch { /* yo'q edi */ }
    throw err;
  });

  fs.renameSync(part, file);
  return { file, dir, size: fs.statSync(file).size };
}

// ---------- Eskilarini tozalash ----------

function list(dir = backupDir()) {
  try {
    return fs.readdirSync(dir).filter(n => FILE_RE.test(n)).sort().reverse();
  } catch { return []; }
}

// Chegara — fayl soni emas, KUN soni. Bir kunda qo'lda bir necha marta
// nusxa olinsa ham «oxirgi 30 kun» o'z ma'nosini yo'qotmasin.
const dayOf = (name) => name.slice(5, 15);          // onix-2026-09-03-0300… → 2026-09-03

function prune(dir = backupDir(), keep = KEEP) {
  const files = list(dir);
  const alive = new Set([...new Set(files.map(dayOf))].sort().reverse().slice(0, keep));
  const old = files.filter(n => !alive.has(dayOf(n)));
  for (const name of old) {
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* boshqa birov o'chirgan */ }
  }
  return old.length;
}

// Nusxa olish + tozalash — bitta chaqiruv
async function run(targetDir) {
  const res = await dump(targetDir);
  res.removed = prune(res.dir);
  const files = list(res.dir);
  res.total = files.length;
  res.days  = new Set(files.map(dayOf)).size;
  return res;
}

// ---------- Vaqt ----------

function due(now = new Date()) {
  const [h, m] = TIME.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
}

const today = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const humanSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

module.exports = {
  KEEP, TIME, ENABLED, TO_TELEGRAM,
  backupDir, cloudDir, cloudName, inCloud, findPgDump, pgEnv,
  fileName, dayOf, dump, list, prune, run, due, today, humanSize,
};
