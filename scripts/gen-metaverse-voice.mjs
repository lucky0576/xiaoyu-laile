/**
 * 生成元宇宙展厅讲解音频（在服务器上运行）
 * 用法：node scripts/gen-metaverse-voice.mjs
 * 输出：/tmp/mv-voice-1.mp3 ... 3
 */

import fs from 'node:fs';
import * as tts from '../src/services/tts.js';

const scripts = [
  {
    out: '/tmp/mv-voice-1.mp3',
    gender: 'female',
    text:
      '欢迎来到小鱼来了产业元宇宙展厅。这里是杭州上城区产业展厅，两侧展板展示了二十个真实产业项目，点击任意展板就能查看项目详情。',
  },
  {
    out: '/tmp/mv-voice-2.mp3',
    gender: 'male',
    text:
      '小鱼来了把产业需求结构化，再用人工智能生成标题、摘要和短视频。现在您可以在这个三维展厅里浏览项目，也可以直接进入短视频和专题页面。',
  },
  {
    out: '/tmp/mv-voice-3.mp3',
    gender: 'female',
    text:
      '这是强脑科技展位。强脑科技是全球非侵入式脑机接口领军企业，这里展示仿生灵巧手与双臂机器人，以及产教联合合作方案。',
  },
];

for (const s of scripts) {
  const r = await tts.synthesize(s.text, { gender: s.gender, seed: 'metaverse-' + s.out });
  if (!r || !r.path) {
    console.log(' 失败:', s.out);
    continue;
  }
  fs.copyFileSync(r.path, s.out);
  console.log(' ', s.out, '| engine=', r.engine, '| voice=', r.voice, '|', Math.round(r.duration * 10) / 10 + 's', '|', fs.statSync(s.out).size, 'bytes');
}
