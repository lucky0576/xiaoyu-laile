import * as tts from '../src/services/tts.js';
const text = '各位好，欢迎收看小鱼来了产业资讯。今天我们来聊一个两百兆瓦的光伏项目。';
for (const g of ['female', 'male']) {
  const r = await tts.synthesize(text, { gender: g, seed: 'verify-engine' });
  console.log('  ', g, 'engine=', r && r.engine, 'voice=', r && r.voice);
}
