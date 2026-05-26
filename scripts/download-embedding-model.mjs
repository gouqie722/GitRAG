import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const MODEL_ID = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';
const OUT_DIR = join(projectRoot, 'models', MODEL_ID);

const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
];

const SOURCES = [
  (file) => `https://modelscope.cn/models/${MODEL_ID}/resolve/master/${file}`,
  (file) => `https://hf-mirror.com/${MODEL_ID}/resolve/main/${file}`,
  (file) => `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`,
];

async function downloadFile(url, dest, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    return buf.length;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadOne(file) {
  const dest = join(OUT_DIR, file);
  if (existsSync(dest)) {
    console.log(`  skip (exists): ${file}`);
    return;
  }

  let lastError;
  for (const buildUrl of SOURCES) {
    const url = buildUrl(file);
    process.stdout.write(`  downloading ${file} from ${new URL(url).host} ... `);
    try {
      const size = await downloadFile(url, dest);
      console.log(`ok (${(size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    } catch (err) {
      lastError = err;
      console.log(`failed (${err.message})`);
    }
  }

  throw new Error(`All sources failed for ${file}: ${lastError?.message}`);
}

console.log(`Downloading embedding model: ${MODEL_ID}`);
console.log(`Output: ${OUT_DIR}\n`);

for (const file of FILES) {
  await downloadOne(file);
}

console.log('\nDone! Restart backend with EMBEDDING_PROVIDER=local');
