/**
 * 凭据加载器（Node 脚本用）
 *
 * 为什么需要：仓库是公开的，凭据绝不能写进代码。
 * 这里从项目根目录的 `.secrets.env`（已 gitignore）读取，
 * 已存在的真实环境变量优先，方便 CI 注入。
 *
 * 用法：
 *   import { loadSecrets, requireEnv } from './lib/secrets.mjs';
 *   loadSecrets();
 *   const pwd = requireEnv('XYL_ADMIN_PASSWORD');
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SECRETS_FILE = path.join(ROOT, '.secrets.env');

let loaded = false;

/** 把 .secrets.env 读进 process.env（不覆盖已存在的变量） */
export function loadSecrets() {
  if (loaded) return;
  loaded = true;
  try {
    const text = fs.readFileSync(SECRETS_FILE, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // 文件不存在是正常的（CI / 临时环境用真实环境变量）
  }
}

/** 取一个必须存在的环境变量，缺失就报错，绝不回退到硬编码默认值 */
export function requireEnv(name, hint = '') {
  loadSecrets();
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `缺少环境变量 ${name}。${hint ? `${hint} ` : ''}见 scripts/SECRETS.md`,
    );
  }
  return v;
}

/** 取一个可选的环境变量 */
export function envOr(name, fallback = '') {
  loadSecrets();
  return process.env[name] || fallback;
}

export default { loadSecrets, requireEnv, envOr };
