/**
 * 统一分享宣传语。
 * 所有分享文案、系统原生分享、复制出去的链接，末尾都带这一句。
 */

export const SLOGAN = '小鱼来了 · AI 驱动的产业互联网 B2B B2G平台｜让每一条好项目，都被对的人看见';

/*
 * ICP 备案进度提示。
 * 默认值会被 /api/site 返回的 icpNotice 覆盖（备案通过后服务端置空即可）。
 * 服务端一直没返回时才用这里的兜底文案。
 */
export const ICP_NOTICE_DEFAULT = '小鱼来了正在办理 ICP 备案，预计月底前完成';

let icpNotice = ICP_NOTICE_DEFAULT;

/** 由 app.js 在拿到 /api/site 后调用；传空字符串表示没有提示 */
export function setIcpNotice(v) {
  icpNotice = String(v == null ? ICP_NOTICE_DEFAULT : v).trim();
}

export function getIcpNotice() {
  return icpNotice;
}

export function withSlogan(text) {
  const t = String(text || '').trim();
  const tail = icpNotice ? `${SLOGAN}\n${icpNotice}` : SLOGAN;
  // 已经带了宣传语就不再重复追加
  if (t.includes(SLOGAN)) return t;
  return t ? `${t}\n\n${tail}` : tail;
}
