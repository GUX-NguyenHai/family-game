// Tối ưu model: bỏ hoạt ảnh trùng ("AnimalArmature|...") và hoạt ảnh không dùng, dọn dữ liệu thừa.
// Đọc từ animal/, ghi ra build/models/ (file gốc giữ nguyên). Chạy: npm run models
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample } from '@gltf-transform/functions';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/assets/animals.json'), 'utf8'));
const keep = new Set(Object.values(manifest.clips).flat());
const srcDir = path.join(root, 'animal');
const outDir = path.join(root, 'build/models');
await fs.mkdir(outDir, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let before = 0;
let after = 0;

for (const animal of manifest.animals) {
  const src = path.join(srcDir, animal.file);
  const out = path.join(outDir, animal.file);
  const doc = await io.read(src);

  const seen = new Set();
  const kept = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const name = anim.getName();
    if (name.includes('|') || !keep.has(name) || seen.has(name)) {
      anim.dispose();
    } else {
      seen.add(name);
      kept.push(name);
    }
  }

  await doc.transform(prune(), dedup(), resample());
  await io.write(out, doc);

  const a = (await fs.stat(src)).size;
  const b = (await fs.stat(out)).size;
  before += a;
  after += b;
  console.log(`${animal.file.padEnd(16)} ${(a / 1024).toFixed(0).padStart(5)}KB → ${(b / 1024).toFixed(0).padStart(5)}KB  [${kept.join(', ')}]`);
}

console.log(`\nTổng: ${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB (ghi vào build/models/)`);
