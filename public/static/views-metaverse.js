/**
 * 杭州上城区 · 产业元宇宙展厅（#/metaverse）
 *
 * 轻量 Web 3D（Three.js）：
 *   · 一个可漫游的展厅：20 条真实项目挂成展板，点开进项目详情
 *   · 尽头是「BrainCo 强脑科技」展位：Revo 灵巧手 / 双臂机器人海报
 *   · 手机拖动环顾、按钮前进后退、分享链接 + 二维码
 *
 * 技术：Three.js 本地 vendor（/static/vendor/three.module.js），无 CDN 依赖
 */

import * as ui from './ui.js';
import { service } from './api.js';

const HALL = { left: -7, right: 7, startZ: 4, gap: 2.35, count: 20 };
const SHARE_PATH = '#/metaverse';

function wrapText(ctx2d, text, maxWidth, maxLines) {
  const chars = Array.from(String(text || ''));
  const lines = [];
  let cur = '';
  for (const ch of chars) {
    const test = cur + ch;
    if (ctx2d.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
      if (lines.length >= maxLines - 1) break;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function cardTexture(THREE, item) {
  const W = 512;
  const H = 320;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0c1830');
  grad.addColorStop(1, '#123047');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 顶部细线
  g.fillStyle = 'rgba(90, 190, 255, 0.85)';
  g.fillRect(0, 0, W, 5);
  // 类别
  g.fillStyle = '#7fd7ff';
  g.font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText(String(item.categoryName || '产业信息').slice(0, 12), 28, 46);
  // 标题
  g.fillStyle = '#ffffff';
  g.font = '700 32px "PingFang SC", "Microsoft YaHei", sans-serif';
  const lines = wrapText(g, item.title || '', W - 56, 3);
  lines.forEach((line, i) => g.fillText(line, 28, 100 + i * 44));
  // 元信息
  const city = (item.cities || [])[0];
  const ind = (item.industries || [])[0];
  const meta = [city && (city.name || city), ind && (ind.name || ind), item.typeName].filter(Boolean).join(' · ');
  g.fillStyle = 'rgba(255, 255, 255, 0.65)';
  g.font = '400 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText(String(meta).slice(0, 30), 28, H - 58);
  // 按钮
  g.fillStyle = 'rgba(90, 190, 255, 0.16)';
  g.strokeStyle = 'rgba(127, 215, 255, 0.7)';
  g.lineWidth = 2;
  const bx = 28;
  const by = H - 42;
  const bw = 150;
  const bh = 30;
  g.beginPath();
  roundRectPath(g, bx, by, bw, bh, 15);
  g.fill();
  g.stroke();
  g.fillStyle = '#bfe9ff';
  g.font = '700 18px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText('点击查看项目 ›', bx + 14, by + 21);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* roundRect 路径（兼容老浏览器） */
function roundRectPath(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function brandTexture(THREE, { title, subtitle, foot }) {
  const W = 640;
  const H = 320;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#06101f');
  grad.addColorStop(1, '#0e2f4a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#7fd7ff';
  g.font = '700 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  g.fillText('小鱼来了 · 产业元宇宙', 32, 52);
  g.fillStyle = '#fff';
  g.font = '800 44px "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(g, title, W - 64, 2).forEach((line, i) => g.fillText(line, 32, 130 + i * 56));
  g.fillStyle = 'rgba(255,255,255,0.72)';
  g.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif';
  wrapText(g, subtitle, W - 64, 2).forEach((line, i) => g.fillText(line, 32, 240 + i * 32));
  if (foot) {
    g.fillStyle = 'rgba(127,215,255,0.85)';
    g.font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    g.fillText(foot, 32, H - 26);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export async function renderMetaverse(ctx) {
  const listings = [];
  try {
    const r = await service.listings({ status: 'published', pageSize: HALL.count, sort: 'latest' });
    (r.items || []).slice(0, HALL.count).forEach((x) => listings.push(x));
  } catch {
    /* 无数据也能进空展厅 */
  }

  const html = `<div class="mv-wrap">
    <canvas id="mv-canvas" class="mv-canvas"></canvas>
    <div class="mv-topbar">
      <a class="mv-back" href="#/home" aria-label="返回">←</a>
      <div class="mv-title">杭州上城区 · 产业元宇宙展厅</div>
      <button class="mv-share" id="mv-share" type="button">↗ 分享</button>
    </div>
    <div class="mv-hint" id="mv-hint">拖动画面环顾展厅 · 点展板看项目</div>
    <div class="mv-ctl">
      <button class="mv-btn" id="mv-up" type="button" aria-label="前进">▲</button>
      <button class="mv-btn" id="mv-down" type="button" aria-label="后退">▼</button>
    </div>
    <div class="mv-loading" id="mv-loading">正在搭建展厅…</div>
    <div class="mv-qr-mask hide" id="mv-qr-mask">
      <div class="mv-qr">
        <div class="mv-qr-t">扫码进入展厅</div>
        <img id="mv-qr-img" alt="展厅二维码">
        <div class="mv-qr-d">${location.origin}/#/metaverse</div>
        <button class="btn btn-sm btn-outline" id="mv-qr-close" type="button">关闭</button>
      </div>
    </div>
  </div>`;

  return {
    title: '产业元宇宙展厅',
    content: html,
    fullscreen: true,
    noTab: true,
    activeTab: 'home',
    mount(root) {
      const canvas = root.querySelector('#mv-canvas');
      const hint = root.querySelector('#mv-hint');
      const loading = root.querySelector('#mv-loading');
      const installBar = document.getElementById('install-bar');
      if (installBar) installBar.style.display = 'none';
      const wxTip = document.getElementById('wx-tip');
      if (wxTip) wxTip.style.display = 'none';

      // 分享
      const share = async () => {
        const url = `${location.origin}/${SHARE_PATH}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: '小鱼来了 · 产业元宇宙展厅', url });
            return;
          }
        } catch {
          /* 取消 */
        }
        try {
          await navigator.clipboard.writeText(`小鱼来了 · 产业元宇宙展厅\n${url}`);
          ui.toast('链接已复制，可粘贴到微信', 'ok');
        } catch {
          ui.toast(url, 'ok');
        }
      };
      // 二维码弹层
      const qrMask = root.querySelector('#mv-qr-mask');
      const openQr = () => {
        const img = root.querySelector('#mv-qr-img');
        if (img && !img.getAttribute('src')) {
          img.src = `/api/share/qrcode?size=340&text=${encodeURIComponent(`${location.origin}/${SHARE_PATH}`)}`;
        }
        qrMask.classList.remove('hide');
      };
      root.querySelector('#mv-share')?.addEventListener('click', async () => {
        // 手机优先系统分享；没有就复制链接 + 打开二维码
        const url = `${location.origin}/${SHARE_PATH}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: '小鱼来了 · 产业元宇宙展厅', url });
            return;
          }
        } catch {
          /* 取消 */
        }
        try {
          await navigator.clipboard.writeText(`小鱼来了 · 产业元宇宙展厅\n${url}`);
          ui.toast('链接已复制，可扫码或粘贴到微信', 'ok');
        } catch {
          /* ignore */
        }
        openQr();
      });
      root.querySelector('#mv-qr-close')?.addEventListener('click', () => qrMask.classList.add('hide'));
      qrMask?.addEventListener('click', (e) => {
        if (e.target === qrMask) qrMask.classList.add('hide');
      });

      let raf = 0;
      let renderer = null;
      (async () => {
        let THREE = null;
        try {
          THREE = await import('/static/vendor/three.module.js');
        } catch (err) {
          if (loading) loading.textContent = '3D 组件加载失败，请刷新重试';
          console.warn('[metaverse] three 加载失败', err);
          return;
        }
        try {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        } catch (err) {
          if (loading) {
            loading.innerHTML = '当前浏览器不支持 WebGL3D<br><a class="btn btn-sm mt8" href="#/brainco-coop">先看产教联合专题</a>';
          }
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x070d18);
        scene.fog = new THREE.Fog(0x070d18, 26, 62);

        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
        let yaw = 0;
        let pitch = -0.04;
        let camX = 0;
        let camZ = 13.5;

        scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x14202e, 1.05));
        const dir = new THREE.DirectionalLight(0xffffff, 1.25);
        dir.position.set(6, 12, 4);
        scene.add(dir);
        const warm = new THREE.PointLight(0xffc47a, 0.8, 26);
        warm.position.set(0, 4, -18);
        scene.add(warm);

        // 地面（程序化网格纹理）
        const floorCv = document.createElement('canvas');
        floorCv.width = 512;
        floorCv.height = 512;
        const fg = floorCv.getContext('2d');
        fg.fillStyle = '#0a1524';
        fg.fillRect(0, 0, 512, 512);
        fg.strokeStyle = 'rgba(80, 170, 230, 0.22)';
        fg.lineWidth = 2;
        for (let i = 0; i <= 512; i += 64) {
          fg.beginPath();
          fg.moveTo(i, 0);
          fg.lineTo(i, 512);
          fg.stroke();
          fg.beginPath();
          fg.moveTo(0, i);
          fg.lineTo(512, i);
          fg.stroke();
        }
        const floorTex = new THREE.CanvasTexture(floorCv);
        floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(10, 10);
        floorTex.colorSpace = THREE.SRGBColorSpace;
        const floor = new THREE.Mesh(
          new THREE.PlaneGeometry(90, 90),
          new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.15 }),
        );
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);

        // 侧墙
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2a, roughness: 0.9, metalness: 0.1 });
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 60), wallMat);
        leftWall.position.set(-11, 5, -14);
        scene.add(leftWall);
        const rightWall = leftWall.clone();
        rightWall.position.x = 11;
        scene.add(rightWall);
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 0.4), wallMat);
        backWall.position.set(0, 5, -24);
        scene.add(backWall);

        // 顶部灯条
        for (let z = 8; z >= -18; z -= 6) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(16, 0.12, 0.3),
            new THREE.MeshBasicMaterial({ color: 0x2a6f9e }),
          );
          strip.position.set(0, 8.6, z);
          scene.add(strip);
        }

        // 入口品牌牌
        const brand = new THREE.Mesh(
          new THREE.PlaneGeometry(9.6, 4.8),
          new THREE.MeshBasicMaterial({ map: brandTexture(THREE, {
            title: '杭州上城区 · 产业元宇宙展厅',
            subtitle: `${listings.length} 个真实项目 · 一个场景看全区产业`,
            foot: '拖动环顾 · 点展板进项目详情',
          }) }),
        );
        brand.position.set(0, 4.6, 9.2);
        scene.add(brand);

        // 项目展板
        const clickable = [];
        const cardGeo = new THREE.PlaneGeometry(5.4, 3.35);
        const frameGeo = new THREE.PlaneGeometry(5.75, 3.7);
        listings.forEach((item, idx) => {
          const side = idx % 2 === 0 ? -1 : 1;
          const row = Math.floor(idx / 2);
          const z = HALL.startZ - row * HALL.gap;
          const x = side === -1 ? HALL.left : HALL.right;
          const group = new THREE.Group();
          const frame = new THREE.Mesh(
            frameGeo,
            new THREE.MeshStandardMaterial({ color: 0x17324a, emissive: 0x0a1d2e, roughness: 0.6, metalness: 0.3 }),
          );
          group.add(frame);
          const card = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: cardTexture(THREE, item) }));
          card.position.z = 0.03;
          group.add(card);
          group.position.set(x, 3.6, z);
          group.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
          group.userData = { listingId: item.id, title: item.title };
          card.userData = group.userData;
          clickable.push(group);
          scene.add(group);
          // 展板底部射灯
          const lamp = new THREE.PointLight(0x6ec8ff, 0.35, 8);
          lamp.position.set(x + side * -1.2, 1.6, z);
          scene.add(lamp);
        });

        // BrainCo 展位（走廊尽头）
        const booth = new THREE.Group();
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 1.9, 0.6, 32),
          new THREE.MeshStandardMaterial({ color: 0x1a2c40, metalness: 0.5, roughness: 0.5 }),
        );
        pedestal.position.y = 0.3;
        booth.add(pedestal);

        const loadTex = (url) =>
          new Promise((resolve) => {
            new THREE.TextureLoader().load(
              url,
              (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                resolve(t);
              },
              undefined,
              () => resolve(null),
            );
          });

        const handTex = await loadTex('/static/brainco/revo2-poster.jpg');
        const robotTex = await loadTex('/static/brainco/robot.jpg');
        const posterMat = (tex) =>
          tex
            ? new THREE.MeshBasicMaterial({ map: tex })
            : new THREE.MeshStandardMaterial({ color: 0x18344f });
        const posterL = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.2), posterMat(handTex));
        posterL.position.set(-2.6, 3.4, 0.2);
        posterL.rotation.y = 0.28;
        booth.add(posterL);
        const posterR = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.2), posterMat(robotTex));
        posterR.position.set(2.6, 3.4, 0.2);
        posterR.rotation.y = -0.28;
        booth.add(posterR);
        const boothSign = new THREE.Mesh(
          new THREE.PlaneGeometry(6.4, 1.6),
          new THREE.MeshBasicMaterial({ map: brandTexture(THREE, {
            title: 'BrainCo 强脑科技 展位',
            subtitle: 'Revo 灵巧手 · RevoTron 双臂机器人 · 脑控机器人',
            foot: '点击展位 → 强脑科技专题',
          }) }),
        );
        boothSign.position.set(0, 6.4, 0.1);
        booth.add(boothSign);
        booth.position.set(0, 0, -22.6);
        booth.userData = { href: '#/brainco' };
        scene.add(booth);
        clickable.push(booth);

        // 交互
        let dragging = false;
        let moved = 0;
        let lastX = 0;
        let lastY = 0;
        const pointers = new Map();
        let pinchDist = 0;

        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const pick = (clientX, clientY) => {
          const rect = canvas.getBoundingClientRect();
          ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, camera);
          const hits = raycaster.intersectObjects(clickable, true);
          if (!hits.length) return;
          let obj = hits[0].object;
          let data = null;
          while (obj) {
            if (obj.userData && (obj.userData.listingId || obj.userData.href)) {
              data = obj.userData;
              break;
            }
            obj = obj.parent;
          }
          if (!data) return;
          if (data.listingId) ctx.nav(`#/detail/${data.listingId}`);
          else if (data.href) ctx.nav(data.href);
        };

        canvas.addEventListener('pointerdown', (e) => {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          dragging = true;
          moved = 0;
          lastX = e.clientX;
          lastY = e.clientY;
          hint?.classList.add('hide');
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!pointers.has(e.pointerId)) return;
          const pts = [...pointers.values()];
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDist) camZ = Math.min(20, Math.max(-18, camZ + (pinchDist - d) * 0.02));
            pinchDist = d;
            return;
          }
          if (!dragging) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          moved += Math.abs(dx) + Math.abs(dy);
          lastX = e.clientX;
          lastY = e.clientY;
          yaw -= dx * 0.0042;
          pitch = Math.max(-0.5, Math.min(0.5, pitch - dy * 0.0028));
        });
        const endPointer = (e) => {
          pointers.delete(e.pointerId);
          if (pointers.size === 0) {
            if (dragging && moved < 8) pick(e.clientX, e.clientY);
            dragging = false;
            pinchDist = 0;
          }
        };
        canvas.addEventListener('pointerup', endPointer);
        canvas.addEventListener('pointercancel', endPointer);
        canvas.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            camZ = Math.min(20, Math.max(-18, camZ + e.deltaY * 0.012));
          },
          { passive: false },
        );

        // 键盘 WASD
        const keys = { forward: false, back: false };
        window.addEventListener('keydown', (e) => {
          if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.forward = true;
          if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.back = true;
        });
        window.addEventListener('keyup', (e) => {
          if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.forward = false;
          if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.back = false;
        });

        // 前进 / 后退
        let moveDir = 0;
        root.querySelector('#mv-up')?.addEventListener('click', () => (moveDir = 1));
        root.querySelector('#mv-down')?.addEventListener('click', () => (moveDir = -1));
        root.querySelector('#mv-up')?.addEventListener('pointerup', () => (moveDir = 0));
        root.querySelector('#mv-down')?.addEventListener('pointerup', () => (moveDir = 0));

        const resize = () => {
          const w = root.clientWidth || window.innerWidth;
          const h = root.clientHeight || window.innerHeight;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener('resize', resize);

        let t = 0;
        let disposed = false;
        const clock = new THREE.Clock();
        const animate = () => {
          if (disposed) return;
          if (!document.body.contains(canvas)) {
            disposed = true;
            cancelAnimationFrame(raf);
            try {
              renderer.dispose();
            } catch {
              /* ignore */
            }
            return;
          }
          const dt = Math.min(clock.getDelta(), 0.05);
          t += dt;
          // 前进/后退
          if (moveDir !== 0 || keys.forward || keys.back) {
            const f = moveDir || (keys.forward ? 1 : 0) + (keys.back ? -1 : 0);
            const speed = 6.5 * dt;
            camX -= Math.sin(yaw) * f * speed;
            camZ -= Math.cos(yaw) * f * speed;
            camX = Math.max(-9.5, Math.min(9.5, camX));
            camZ = Math.max(-17.5, Math.min(17, camZ));
          }
          camera.position.set(camX, 2.9 + Math.sin(t * 0.6) * 0.03, camZ);
          camera.rotation.set(0, 0, 0);
          camera.rotateY(yaw);
          camera.rotateX(pitch);
          // 展板轻微浮动
          clickable.forEach((obj, i) => {
            if (obj.geometry) obj.position.y = 3.6 + Math.sin(t * 0.8 + i) * 0.05;
          });
          renderer.render(scene, camera);
          raf = requestAnimationFrame(animate);
        };
        loading?.classList.add('hide');
        animate();
        // 自动隐藏提示
        setTimeout(() => hint?.classList.add('hide'), 6000);
      })();
    },
  };
}

export default { renderMetaverse };
