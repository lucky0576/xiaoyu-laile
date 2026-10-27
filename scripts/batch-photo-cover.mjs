/**
 * 批量把「自动生成的渐变封面」换成「实景照片封面」。
 *
 * 规则：
 *   · 只处理已发布的信息
 *   · 用户自己上传过图片的（fileList 里有 kind==='image'）→ 跳过，绝不覆盖
 *   · 其余一律 force 重生成照片封面
 *
 * 用法：node batch-photo-cover.mjs
 */

const BASE = 'http://127.0.0.1:8787';
const ADMIN = { account: '13456693544', password: 'weilan0576' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text };
  }
}

const main = async () => {
  const login = await api('/api/auth/login', { method: 'POST', body: ADMIN });
  const token = login.json?.data?.token;
  if (!token) {
    console.log('登录失败:', JSON.stringify(login.json).slice(0, 200));
    return;
  }
  console.log('管理员登录 OK');

  const listRes = await api('/api/listings?status=published&pageSize=200', { token });
  const items = listRes.json?.data?.items || [];
  console.log(`已发布信息 ${items.length} 条`);

  let ok = 0;
  let skipUserPic = 0;
  let fail = 0;
  const t0 = Date.now();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tag = `[${i + 1}/${items.length}] ${String(it.title || '').slice(0, 22)}`;

    // 取详情，看有没有用户自己上传的图片
    const d = await api(`/api/listings/${it.id}`, { token });
    const files = d.json?.data?.listing?.fileList || [];
    const hasUserImage = files.some((f) => f.kind === 'image');
    if (hasUserImage) {
      skipUserPic += 1;
      console.log(`${tag}  → 跳过（用户有实拍图）`);
      continue;
    }

    const r = await api('/api/admin/covers/photo', {
      method: 'POST',
      token,
      body: { listingId: it.id, force: true },
    });
    const res = r.json?.data;
    if (res?.ok) {
      ok += 1;
      console.log(`${tag}  → ✅ 已换照片封面`);
    } else {
      fail += 1;
      console.log(`${tag}  → ⚠️ ${res?.note || '失败'}`);
    }
    await sleep(120);
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log('');
  console.log(`完成：成功 ${ok} / 跳过(用户实拍图) ${skipUserPic} / 失败 ${fail}，用时 ${mins} 分钟`);
};

main().catch((e) => console.log('脚本异常:', e.message));
