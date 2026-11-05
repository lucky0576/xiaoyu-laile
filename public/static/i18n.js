/**
 * 小鱼来了 — 中英文界面切换（第 1 阶段：界面层）
 *
 * 做法：不侵入每个视图文件，而是在渲染完成后，对 DOM 里的中文文案做
 *       「精确短语替换」。好处是：
 *         · 40 多个前端模块不用一个个改
 *         · 新增页面只要往 PHRASES 里补词条
 *         · 切回中文时直接重新渲染，DOM 天然是中文，不需要反向映射
 *
 * 边界（必须说清楚）：
 *   · 只翻译「界面文案」，不翻译用户发布的信息内容（标题/正文仍是中文）
 *   · 第 2 阶段做内容双语：后端存 titleEn/summaryEn，按 lang 返回
 *
 * 词条维护约定：
 *   · key 必须与界面上的中文完全一致（含标点、空格）
 *   · 长词条优先匹配（内部按长度倒序，避免「发布」把「发布信息」拆掉）
 */

const STORAGE_KEY = 'xyl_lang';

export const LANG_ZH = 'zh';
export const LANG_EN = 'en';

/* ------------------------------------------------------------------ */
/* 状态                                                                */
/* ------------------------------------------------------------------ */
function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === LANG_EN || v === LANG_ZH) return v;
  } catch {
    /* 隐私模式 */
  }
  return LANG_ZH;
}

let current = readStored();

export function getLang() {
  return current;
}

export function isEn() {
  return current === LANG_EN;
}

/** 设置语言：写本地 + 尝试同步到账号（失败忽略） */
export function setLang(lang, { sync } = {}) {
  current = lang === LANG_EN ? LANG_EN : LANG_ZH;
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* ignore */
  }
  try {
    document.documentElement.setAttribute('lang', current === LANG_EN ? 'en' : 'zh-CN');
  } catch {
    /* ignore */
  }
  // 同步到用户资料：换设备后语言偏好也能带走
  if (sync && typeof sync === 'function') {
    Promise.resolve()
      .then(() => sync(current))
      .catch(() => {});
  }
  return current;
}

/* ------------------------------------------------------------------ */
/* 词条：界面中文 → 英文                                                */
/* ------------------------------------------------------------------ */
const PHRASES = {
  /* —— 底部导航 —— */
  首页: 'Home',
  项目: 'Projects',
  发布: 'Publish',
  通讯录: 'Contacts',
  我的: 'Me',

  /* —— 顶栏 —— */
  返回: 'Back',
  '💰 融资': '💰 Funding',
  '📮 联系我': '📮 Contact',
  '📣 群发': '📣 Broadcast',
  分享给朋友: 'Share',

  /* —— 通用按钮 —— */
  查看全部: 'View all',
  '查看全部 ›': 'View all ›',
  去发布: 'Publish now',
  '去发布 ›': 'Publish now ›',
  立即发布: 'Publish',
  保存: 'Save',
  取消: 'Cancel',
  删除: 'Delete',
  编辑: 'Edit',
  下架: 'Unpublish',
  续期: 'Renew',
  分享: 'Share',
  复制: 'Copy',
  已复制: 'Copied',
  下载: 'Download',
  详情: 'Details',
  更多: 'More',
  '加载中…': 'Loading…',
  加载中: 'Loading',
  '没有更多了': 'No more items',
  搜索: 'Search',
  筛选: 'Filter',
  全部: 'All',
  '请选择': 'Select',
  确定: 'OK',
  关闭: 'Close',
  提交: 'Submit',
  发送: 'Send',
  确认: 'Confirm',
  返回上一页: 'Go back',

  /* —— 首页 —— */
  发布信息: 'Publish listing',
  '项目 · 活动 · 贸易 · 成果转化，AI 自动生成标题与解析':
    'Projects · Events · Trade · Tech transfer. AI generates titles and analysis.',
  'AI 帮我找': 'Find with AI',
  'AI 帮我选': 'Pick with AI',
  'AI 搜索': 'AI search',
  最新项目: 'Latest projects',
  最新活动: 'Latest events',
  最新贸易: 'Latest trade',
  最新资讯: 'Latest news',
  热门项目: 'Popular projects',
  活动与赛事: 'Events & contests',
  '查看全部 › ': 'View all › ',
  快捷入口: 'Quick links',
  我的提问: 'My questions',
  企业服务: 'Enterprise services',
  热门行业: 'Industries',
  热门城市: 'Cities',
  '让每一条好项目，都被对的人看见': 'Every good project should reach the right people',
  '上小鱼来了，免费发布需求': 'Post your needs for free on Xiaoyu Laile',
  '小鱼来了，专业产业信息对接平台': 'Xiaoyu Laile — industrial project information platform',

  /* —— 列表页 —— */
  信息: 'Listings',
  '全部信息': 'All listings',
  项目信息: 'Project listings',
  活动信息: 'Event listings',
  贸易信息: 'Trade listings',
  成果信息: 'Tech listings',
  招投标信息: 'Tender listings',
  最新发布: 'Newest',
  热门优先: 'Popular',
  暂无信息: 'No listings yet',
  '暂无数据': 'No data',
  加载失败: 'Failed to load',
  点击重试: 'Tap to retry',

  /* —— 详情页 —— */
  项目概况: 'Overview',
  项目详情: 'Project details',
  联系方式: 'Contact',
  发布方: 'Publisher',
  发布时间: 'Published',
  有效期至: 'Expires',
  所在地: 'Location',
  所属行业: 'Industry',
  项目类型: 'Type',
  预算金额: 'Budget',
  项目对接: 'Connect',
  群聊: 'Group chat',
  会议: 'Meeting',
  附件: 'Attachments',
  资料: 'Files',
  资质要求: 'Qualification requirements',
  相近案例: 'Similar cases',
  举报与投诉: 'Report',
  已下架: 'Unpublished',
  已结束: 'Closed',
  已发布: 'Published',
  草稿: 'Draft',

  /* —— 短视频 —— */
  短视频: 'Shorts',
  播放: 'Play',
  点赞: 'Like',
  评论: 'Comment',
  收藏: 'Save',
  生成短视频: 'Generate short video',
  '把这条信息做成 15 秒竖版短视频（图文也能生成）':
    'Turn this listing into a 15s vertical short video (image + text works too)',
  '🎬 生成短视频': '🎬 Generate short video',

  /* —— 发布页常用 —— */
  标题: 'Title',
  副标题: 'Subtitle',
  正文: 'Content',
  内容: 'Content',
  上传文件: 'Upload files',
  已导入: 'Imported',
  联系人: 'Contact name',
  联系电话: 'Phone',
  微信号: 'WeChat',
  企业名称: 'Company',
  城市: 'City',
  行业: 'Industry',
  类型: 'Type',
  上传封面: 'Upload cover',
  封面主图: 'Cover image',
  活动开始时间: 'Start time',
  活动结束时间: 'End time',
  活动地点: 'Venue',
  名额: 'Capacity',
  报名费: 'Fee',
  活动说明: 'Description',

  /* —— 我的 / 账号 —— */
  登录: 'Sign in',
  注册: 'Sign up',
  退出登录: 'Sign out',
  我的发布: 'My listings',
  我的收藏: 'My saved',
  我的关注: 'Following',
  我的申请: 'My applications',
  设置: 'Settings',
  账号与安全: 'Account & security',
  个人资料: 'Profile',
  会员: 'Membership',
  余额: 'Balance',
  通知: 'Notifications',
  语言: 'Language',
  中文: '中文',
  英文: 'EN',

  /* —— 状态/提示 —— */
  审核中: 'Under review',
  已通过: 'Approved',
  未通过: 'Rejected',
  已认证: 'Verified',
  未认证: 'Unverified',
  请先登录: 'Please sign in first',
  操作成功: 'Done',
  操作失败: 'Something went wrong',
  网络错误: 'Network error',
  暂无权限: 'No permission',

  /* —— 页脚 —— */
  关于我们: 'About',
  隐私政策: 'Privacy',
  用户协议: 'Terms',
  免责声明: 'Disclaimer',
  开放接口: 'API',
  '运营主体：小鱼来了科技有限公司': 'Operated by Xiaoyu Laile Technology Co., Ltd.',
};

/* 数字/动态文案：正则替换（英文侧用 $1 引用数字） */
const PATTERNS = [
  [/^共\s*(\d+)\s*条$/, '$1 items'],
  [/^(\d+)\s*条$/, '$1 items'],
  [/^已导入\s*(\d+)\s*个文件$/, '$1 files imported'],
  [/^选中\s*(\d+)\s*条$/, '$1 selected'],
  [/^(\d+)\s*秒$/, '$1s'],
  [/^第\s*(\d+)\s*页$/, 'Page $1'],
  [/^(\d+)\s*人报名$/, '$1 registered'],
  [/^(\d+)\s*次浏览$/, '$1 views'],
  [/^(\d+)\s*天$/, '$1 days'],
  [/^已选\s*(\d+)\s*条$/, '$1 selected'],
];

/* 长词条优先，避免短词把长词拆开 */
const SORTED_KEYS = Object.keys(PHRASES).sort((a, b) => b.length - a.length);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);

/** 翻译一个字符串；没有词条返回 null */
export function translateText(raw) {
  const s = String(raw == null ? '' : raw);
  const t = s.trim();
  if (!t) return null;
  if (PHRASES[t] !== undefined) return PHRASES[t];
  for (const [re, rep] of PATTERNS) {
    if (re.test(t)) return t.replace(re, rep);
  }
  return null;
}

function translateTextNode(node) {
  const original = node.__zhText !== undefined ? node.__zhText : node.nodeValue;
  if (original == null) return;
  const en = translateText(original);
  if (en == null) return;
  // 保留首尾空白，避免把排版空格吃掉
  const lead = /^\s*/.exec(original)[0];
  const tail = /\s*$/.exec(original)[0];
  node.__zhText = original;
  node.nodeValue = `${lead}${en}${tail}`;
}

const ATTRS = ['placeholder', 'title', 'aria-label'];

function translateAttrs(el) {
  for (const attr of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
    const cur = el.getAttribute(attr);
    const en = translateText(cur);
    if (en == null) continue;
    el.setAttribute(`data-zh-${attr}`, cur);
    el.setAttribute(attr, en);
  }
}

/**
 * 翻译整棵 DOM（只在英文模式调用）。
 * @param {HTMLElement} root
 */
export function translateDom(root) {
  if (!root || current !== LANG_EN) return;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) translateTextNode(n);

    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) translateAttrs(el);
    }
  } catch {
    /* 翻译失败绝不影响页面 */
  }
}

/** 英文模式下在页面顶部插一条说明（内容仍是中文） */
export function noticeHtml() {
  if (current !== LANG_EN) return '';
  return `<div class="lang-notice" data-no-i18n>
    English interface is in beta. Listing content is still in Chinese while we translate the database.
    <a href="javascript:;" id="lang-switch-zh">Switch to Chinese</a>
  </div>`;
}

export default {
  LANG_ZH,
  LANG_EN,
  getLang,
  isEn,
  setLang,
  translateText,
  translateDom,
  noticeHtml,
};
