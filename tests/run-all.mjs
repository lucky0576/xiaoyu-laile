/**
 * 一键跑全部测试
 * 运行：node tests/run-all.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  ['lib-extract  零依赖 ZIP 与文档解析', 'lib-extract.test.mjs'],
  ['lib-qr       二维码与 PNG 编码', 'lib-qr.test.mjs'],
  ['verify-qr    二维码独立逆向验证', 'verify-qr.mjs'],
  ['check-front  前端模块一致性', 'check-frontend.mjs'],
  ['api-smoke    端到端接口冒烟', 'api-smoke.mjs'],
  ['meeting      群聊邀请与会议（仿腾讯会议）', 'meeting-smoke.mjs'],
  ['home-render  首页服务端渲染', 'home-render.mjs'],
  ['feeds        短视频与直播', 'feeds-smoke.mjs'],
  ['pipeline     资质审核与 7 步流程', 'pipeline-smoke.mjs'],
  ['import-dnd   拖拽与文件夹导入', 'import-dnd.test.mjs'],
  ['contact-mask 联系方式自动隐藏', 'contact-mask.test.mjs'],
  ['ai-chunk     长文档分块汇总', 'ai-chunk.test.mjs'],
  ['upload-limits 上传健壮性', 'upload-limits.test.mjs'],
  ['chunk-upload  分片上传', 'chunk-upload.test.mjs'],
];

let failedSuites = 0;
for (const [name, file] of SUITES) {
  console.log(`\n${'='.repeat(70)}\n▶ ${name}  (${file})\n${'='.repeat(70)}`);
  const r = spawnSync(process.execPath, [path.join(DIR, file)], { stdio: 'inherit', cwd: path.resolve(DIR, '..') });
  if (r.status !== 0) {
    failedSuites++;
    console.log(`\n✗ ${name} 未通过（exit ${r.status}）`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(failedSuites === 0 ? '✅ 全部测试通过' : `❌ ${failedSuites} 个套件未通过`);
console.log('='.repeat(70));
process.exit(failedSuites ? 1 : 0);
