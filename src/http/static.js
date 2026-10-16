/**
 * 静态资源与 SPA 回退的统一注册
 *
 * 单独抽出来是因为 server.js 和测试各写一份会导致：
 *   · 生产改了缓存策略，测试还在用旧值 → 测试测不到真实配置
 *   · 反过来测试里的写法跟生产不一致 → 测过了不代表线上没问题
 * 现在两边都调这个函数，测试校验的就是线上真正生效的策略。
 */
import path from 'node:path';

/**
 * 前端静态资源的缓存策略。
 *
 * 必须是 no-cache（每次回源校验），不能是 max-age。
 * app.js 用**静态导入**加载全部视图模块，浏览器一旦拿到新旧混合的模块，
 * 整个 SPA 会加载失败 —— 表现就是「点发布没反应」，且页面上毫无提示。
 * 配合 ETag，文件未改动时服务端返回 304，速度不受影响。
 */
export const STATIC_CACHE = 'no-cache';

export function registerStatic(app, publicDir) {
  app.static('/static', path.join(publicDir, 'static'), { cache: STATIC_CACHE });
  app.static('', publicDir, {
    spa: true,
    cache: 'no-cache',
    exclude: [/^\/api\//, /^\/files\//],
  });
}

export default { registerStatic, STATIC_CACHE };
