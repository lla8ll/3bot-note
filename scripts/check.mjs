import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const oldBrandPattern = new RegExp(['Dyoth', 'AI'].join('[ _-]?'), 'i');
const secretPatterns = [
  new RegExp(['sk', '(?:proj-)?[A-Za-z0-9_-]{20,}'].join('-')),
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{30,}/
];
const textExtensions = new Set(['', '.css', '.html', '.js', '.json', '.md', '.mjs', '.txt']);

function fail(message) {
  errors.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature || buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

const manifestPath = join(ROOT, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  fail(`manifest.json غير صالح: ${error.message}`);
}

let vercelConfig;
try {
  vercelConfig = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
} catch (error) {
  fail(`vercel.json غير صالح: ${error.message}`);
}

if (vercelConfig) {
  if (vercelConfig.functions?.['api/summarize.js']?.maxDuration < 35) {
    fail('مهلة Vercel يجب أن تترك وقتًا لإرجاع استجابة بعد مهلة OpenAI.');
  }
  const globalHeaders = vercelConfig.headers?.find(rule => rule.source === '/(.*)')?.headers || [];
  if (!globalHeaders.some(header => header.key === 'Content-Security-Policy')) {
    fail('vercel.json يجب أن يطبق Content-Security-Policy على الإنتاج.');
  }
  const apiHeaders = vercelConfig.headers?.find(rule => rule.source === '/api/(.*)')?.headers || [];
  if (!apiHeaders.some(header => header.key === 'Cache-Control' && header.value === 'no-store')) {
    fail('vercel.json يجب أن يمنع تخزين استجابات API.');
  }
}

if (manifest) {
  if (manifest.name !== 'Dyoth' || manifest.short_name !== 'Dyoth') {
    fail('اسم PWA في manifest يجب أن يكون Dyoth.');
  }
  if (manifest.start_url !== './' || manifest.scope !== './') {
    fail('start_url وscope يجب أن يشيرا إلى جذر التطبيق.');
  }

  for (const icon of Array.isArray(manifest.icons) ? manifest.icons : []) {
    const iconPath = join(ROOT, icon.src || '');
    if (!await exists(iconPath)) {
      fail(`الأيقونة مفقودة: ${icon.src}`);
      continue;
    }
    const expected = String(icon.sizes || '').match(/^(\d+)x(\d+)$/);
    const actual = pngDimensions(await readFile(iconPath));
    if (!expected || !actual || actual.width !== Number(expected[1]) || actual.height !== Number(expected[2])) {
      fail(`أبعاد الأيقونة لا تطابق manifest: ${icon.src}`);
    }
  }
}

for (const file of ['service-worker.js', 'cloud-sync.js', 'server.mjs', 'api/summarize.js', 'src/summarize-handler.mjs']) {
  const result = spawnSync(process.execPath, ['--check', join(ROOT, file)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${file} يحتوي خطأ JavaScript: ${(result.stderr || '').trim()}`);
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (!match[1].trim()) continue;
  try {
    new Script(match[1], { filename: 'index.html:inline-script' });
  } catch (error) {
    fail(`السكربت المضمّن في index.html غير صالح: ${error.message}`);
  }
}

if (!html.includes("fetch('/api/summarize'")) fail('واجهة التلخيص لا تستدعي endpoint الخادمي المتوقع.');
if (html.includes('OPENAI_API_KEY')) fail('يجب ألا يظهر OPENAI_API_KEY في الواجهة.');

const serviceWorker = await readFile(join(ROOT, 'service-worker.js'), 'utf8');
if (!serviceWorker.includes("url.pathname.startsWith('/api/')")) fail('Service Worker يجب أن يستثني /api/.');
for (const path of ['./index.html', './manifest.json', './cloud-sync.js']) {
  if (!serviceWorker.includes(path)) fail(`Service Worker لا يسبق تخزين ${path}.`);
}

const gitignore = await readFile(join(ROOT, '.gitignore'), 'utf8');
if (!gitignore.includes('.env.*') || !gitignore.includes('!.env.example')) {
  fail('.gitignore لا يحمي ملفات البيئة كما هو مطلوب.');
}

const envExample = await readFile(join(ROOT, '.env.example'), 'utf8');
if (!envExample.includes('OPENAI_API_KEY=your_openai_api_key_here')) {
  fail('.env.example لا يحتوي placeholder الآمن المطلوب.');
}

for (const filePath of await walk(ROOT)) {
  const relative = filePath.slice(ROOT.length + 1);
  if (relative === '.env.local' || relative === '.env') continue;
  if (!textExtensions.has(extname(filePath)) && !relative.startsWith('.')) continue;
  const content = await readFile(filePath, 'utf8');
  if (oldBrandPattern.test(content)) fail(`بقي اسم المنتج القديم في ${relative}.`);
  if (secretPatterns.some(pattern => pattern.test(content))) fail(`يوجد نمط Secret محتمل في ${relative}.`);
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Dyoth checks passed.');
}
