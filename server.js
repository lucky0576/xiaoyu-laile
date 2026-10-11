/**
 * 小鱼来了 — 服务入口
 *
 * 启动：node server.js
 * 环境变量：PORT / HOST / PUBLIC_BASE_URL / AI_API_KEY / WECHAT_APP_ID …
 */
import os from 'node:os';
import path from 'node:path';
import { createApp } from './src/http/app.js';
import { config, PUBLIC_DIR } from './src/config.js';
import db from './src/store/db.js';
import registerRoutes from './src/routes/index.js';
import notifySvc from './src/services/notify.js';
import { sweepOtps } from './src/services/auth.js';
import { seedIfEmpty } from './scripts/seed.js';

/* ------------------------------------------------------------------ */
/* 参数                                                                */
/* ------------------------------------------------------------------ */
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.findIndex((a) => a === `--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const PORT = Number(argOf('port') || process.env.PORT || config.port);
const HOST = argOf('host') || config.host;
const NO_SEED = argv.includes('--no-seed') || process.env.NO_SEED === '1';

/* ------------------------------------------------------------------ */
/* 应用                                                                */
/* ------------------------------------------------------------------ */
const app = createApp();

// 静态资源：/static 放前端资源；其余路径走 SPA（前端 hash 路由）
app.static('/static', path.join(PUBLIC_DIR, 'static'), { cache: 'public, max-age=3600' });
app.static('', PUBLIC_DIR, {
  spa: true,
  cache: 'no-cache',
  exclude: [/^\/api\//, /^\/files\//],
});

registerRoutes(app);

/* ------------------------------------------------------------------ */
/* 定时任务                                                            */
/* ------------------------------------------------------------------ */
let timers = [];
function startJobs() {
  const run = (name, fn, everyMs) => {
    const t = setInterval(() => {
      try {
        const r = fn();
        if (r && (r.expired || r.reminded)) console.log(`[job:${name}]`, r);
      } catch (err) {
        console.warn(`[job:${name}] 失败:`, err.message);
      }
    }, everyMs);
    if (t.unref) t.unref();
    timers.push(t);
  };
  run('expire', () => ({ expired: notifySvc.expireListings() }), 5 * 60_000);
  run('remind', () => ({ reminded: notifySvc.remindExpiring() }), 30 * 60_000);
  run('otp-sweep', () => ({ swept: sweepOtps() }), 60 * 60_000);
  // 首轮立即跑一次
  try {
    notifySvc.expireListings();
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function banner(port, host) {
  const lan = lanAddresses();
  const base = config.publicBaseUrl || '';
  const lines = [
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    `  │  ${config.appName}${' '.repeat(Math.max(0, 44 - config.appName.length * 2))}│`,
    `  │  ${config.appSlogan}${' '.repeat(Math.max(0, 40 - config.appSlogan.length * 2))}│`,
    '  └──────────────────────────────────────────────────────────────┘',
    '',
    `  本机访问     http://127.0.0.1:${port}`,
  ];
  for (const ip of lan) {
    lines.push(`  局域网/手机  http://${ip}:${port}`);
  }
  lines.push(
    `  对外访问     ${base || '（未设置 PUBLIC_BASE_URL，分享链接将按访问者浏览器地址生成）'}`,
    '',
    `  AI 引擎      ${config.ai.apiKey ? `${config.ai.model} @ ${config.ai.baseUrl}` : '内置本地规则引擎（未配置 AI_API_KEY）'}`,
    `  微信         ${config.wechat.appId ? '已配置公众号' : '演示模式（可一键微信演示登录）'}`,
    `  邮件         ${config.smtp.host ? `SMTP ${config.smtp.host}` : '演示模式（写入 data/outbox.log）'}`,
    `  存储         ${path.relative(process.cwd(), config.publicBaseUrl ? '' : '')}${''}data/ (JSON 集合)`,
    '',
    '  外网访问：把路由器 8787 端口映射到本机，或执行',
    '    cloudflared tunnel --url http://127.0.0.1:' + port,
    '    ngrok http ' + port,
    '  然后把生成的公网地址写入 .env 的 PUBLIC_BASE_URL，分享二维码即可被外网访问。',
    '',
    '  按 Ctrl+C 停止服务',
    '',
  );
  console.log(lines.join('\n'));
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */
async function main() {
  db.installShutdownHook();

  if (!NO_SEED) {
    try {
      const seeded = await seedIfEmpty();
      if (seeded.created) {
        console.log(`[seed] 已写入演示数据：${seeded.users} 位用户 / ${seeded.listings} 条信息 / ${seeded.cases} 个项目案例`);
      }
    } catch (err) {
      console.warn('[seed] 演示数据写入失败（不影响启动）:', err.message);
    }
  }

  const server = await app.listen(PORT, HOST);
  startJobs();
  banner(server.address().port, HOST);

  const shutdown = async () => {
    console.log('\n正在关闭…');
    for (const t of timers) clearInterval(t);
    db.flush();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
