/**
 * 生成访问二维码图片
 *
 * 用法：node scripts/make-qr.mjs <url> [输出文件] [scale]
 * 例：  node scripts/make-qr.mjs http://192.168.1.10:8787 访问二维码.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qrToPng } from '../src/lib/qrcode.js';
import { pngSize } from '../src/lib/png.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const url = process.argv[2] || 'http://127.0.0.1:8787';
const out = process.argv[3] || path.join(ROOT, '访问二维码.png');
const scale = Number(process.argv[4]) || 10;

const png = qrToPng(url, { ecc: 'M', margin: 3, scale });
fs.writeFileSync(out, png);
const size = pngSize(png);
console.log(`已生成 ${out}`);
console.log(`内容：${url}`);
console.log(`尺寸：${size ? `${size.width}×${size.height}` : '?'}，${png.length} 字节`);
