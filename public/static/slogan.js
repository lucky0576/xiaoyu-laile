/**
 * 统一分享宣传语。
 * 所有分享文案、系统原生分享、复制出去的链接，末尾都带这一句。
 */

export const SLOGAN = '小鱼来了 · AI 驱动的产业互联网 B2B 电商平台｜让每一条好项目，都被对的人看见';

export function withSlogan(text) {
  const t = String(text || '').trim();
  if (!t) return SLOGAN;
  return t.includes(SLOGAN) ? t : `${t}\n\n${SLOGAN}`;
}
