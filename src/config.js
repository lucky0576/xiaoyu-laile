/**
 * 小鱼来了 — 运行时配置
 *
 * 所有配置都可以通过环境变量或项目根目录的 .env 文件覆盖。
 * 没有任何必填项：不配置 AI / 微信 / 邮件时，平台会自动使用内置的
 * 本地规则引擎与演示模式，保证开箱即跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* .env 加载（零依赖）                                                  */
/* ------------------------------------------------------------------ */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const env = (k, d = '') => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) ? v : d;
};
const bool = (k, d = false) => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  return /^(1|true|yes|on)$/i.test(v);
};

/* ------------------------------------------------------------------ */
/* 密钥：首次启动自动生成并落盘，避免每次重启导致登录态失效              */
/* ------------------------------------------------------------------ */
const SECRET_FILE = path.join(ROOT, 'data', '.secret');
function persistentSecret() {
  const fromEnv = env('SESSION_SECRET');
  if (fromEnv) return fromEnv;
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (s.length >= 32) return s;
    }
  } catch {
    /* ignore */
  }
  const s = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  } catch {
    /* ignore */
  }
  return s;
}

export const DATA_DIR = path.resolve(ROOT, env('DATA_DIR', 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const PUBLIC_DIR = path.join(ROOT, 'public');

for (const d of [DATA_DIR, UPLOAD_DIR, TMP_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

export const config = {
  appName: env('APP_NAME', '小鱼来了'),
  appSlogan: env('APP_SLOGAN', '让每一条好项目，都被对的人看见'),

  host: env('HOST', '0.0.0.0'),
  port: num('PORT', 8787),
  /** 对外可访问的根地址，用于生成分享链接与二维码。留空则用请求头推断。 */
  publicBaseUrl: env('PUBLIC_BASE_URL', '').replace(/\/+$/, ''),

  sessionSecret: persistentSecret(),
  sessionDays: num('SESSION_DAYS', 30),

  /** 上传限制 */
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 512 * 1024 * 1024), // 512MB，支持视频
  maxJsonBytes: num('MAX_JSON_BYTES', 8 * 1024 * 1024),

  /* ---------------------------------------------------------------- */
  /* AI：任何 OpenAI 兼容接口都能用（DeepSeek / 通义 / Moonshot / GPT） */
  /* ---------------------------------------------------------------- */
  ai: {
    baseUrl: env('AI_BASE_URL', 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey: env('AI_API_KEY', ''),
    model: env('AI_MODEL', 'deepseek-chat'),
    timeoutMs: num('AI_TIMEOUT_MS', 60000),
    /** 关闭后强制使用内置本地规则引擎 */
    enabled: bool('AI_ENABLED', true),
  },

  /* ---------------------------------------------------------------- */
  /* 微信：公众号（网页授权 + JS-SDK 分享）与开放平台（扫码/APP 登录）  */
  /* ---------------------------------------------------------------- */
  wechat: {
    appId: env('WECHAT_APP_ID', ''),
    appSecret: env('WECHAT_APP_SECRET', ''),
    /** 开放平台网站应用，用于 PC 扫码登录 */
    openAppId: env('WECHAT_OPEN_APP_ID', ''),
    openAppSecret: env('WECHAT_OPEN_APP_SECRET', ''),
    token: env('WECHAT_TOKEN', ''),
    /** 允许在未配置微信时使用一键演示登录 */
    demoMode: bool('WECHAT_DEMO_MODE', true),
  },

  /* ---------------------------------------------------------------- */
  /* 邮件登录 / 通知                                                    */
  /* ---------------------------------------------------------------- */
  smtp: {
    host: env('SMTP_HOST', ''),
    port: num('SMTP_PORT', 465),
    secure: bool('SMTP_SECURE', true),
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('SMTP_FROM', ''),
  },

  /** 短信：未配置真实网关时，验证码写入控制台并（仅演示模式）随响应返回 */
  sms: {
    provider: env('SMS_PROVIDER', 'demo'),
    demoReturnCode: bool('SMS_DEMO_RETURN_CODE', true),
  },

  payments: {
    provider: env('PAYMENT_PROVIDER', 'offline'),
    /** 居间费/报名费的平台服务费率 */
    platformFeeRate: num('PLATFORM_FEE_RATE', 0.03),
  },

  /** 线上会议：默认为内置的 WebRTC 房间；可换成第三方 SDK 的入会模板 */
  meeting: {
    provider: env('MEETING_PROVIDER', 'builtin'),
    externalUrlTemplate: env('MEETING_URL_TEMPLATE', ''),
  },
};

/** 是否已经接入真实 AI */
export const aiConfigured = () => Boolean(config.ai.apiKey && config.ai.enabled);
export const wechatConfigured = () =>
  Boolean(config.wechat.appId && config.wechat.appSecret);

export default config;
