/**
 * 项目视频 → 自动生成短视频
 *
 * 用户诉求：发布项目时随手传了一段视频，希望它自动变成平台的「短视频」，
 *          并且带上项目标题 —— 不用再单独去短视频页发一遍。
 *
 * 做法：
 *   1. 发布信息成功后，只要有视频文件，立刻建一条 type=short 的短视频，
 *      标题用信息标题，并挂上 listingId（短视频里能跳回项目详情）；
 *   2. 同时后台异步用 ffmpeg 把标题烧进画面（前 8 秒），
 *      生成「标题版」视频再替换掉 feed 的视频文件；
 *   3. 烧字失败也不影响短视频存在 —— 原视频照样能看。
 *
 * 为什么不在这里同步烧字：
 *   转码一段几十秒的视频要几秒到几十秒，发布会变慢，
 *   用户会以为卡住了。先建 feed（立刻可见），再后台补标题。
 */

import db from '../store/db.js';
import { looksLikeDocImage, burnVideoTitle } from './files.js';

const feeds = () => db.collection('feeds');

/** 这个信息是不是已经生成过短视频了（避免重复） */
function hasShortForListing(listingId) {
  if (!listingId) return false;
  return Boolean(feeds().findOne((f) => f.listingId === listingId && f.type === 'short'));
}

/**
 * 发布信息后调用（fire-and-forget）。
 * @returns {Promise<object|null>} 创建的 feed
 */
export async function createShortFromListing({ user, listing, fileRecords = [] }) {
  try {
    if (!user || !listing) return null;
    const videos = (fileRecords || []).filter((f) => f && f.kind === 'video');
    if (!videos.length) return null;
    if (hasShortForListing(listing.id)) return null;

    const video = videos[0];
    const cover = (fileRecords || []).find((f) => f && f.kind === 'image' && !looksLikeDocImage(f));

    // 动态 import 避免和 feeds.js 形成循环依赖
    const feedsSvc = await import('./feeds.js');

    const title = String(listing.title || '').trim().slice(0, 80) || '项目视频';
    const subtitle = String(listing.subtitle || '').trim().slice(0, 120);
    const desc = String(listing.text || '').trim().slice(0, 300);

    const feed = await feedsSvc.createFeed({
      user,
      body: {
        type: 'short',
        title,
        subtitle,
        description: desc,
        listingId: listing.id,
        coverFileId: cover?.id || '',
        tags: ['项目视频'],
        featured: true,
      },
      files: [video],
    });

    // 后台补标题版视频，不阻塞发布
    burnAndSwap(feed, video, title).catch((err) => {
      console.warn('[auto-short] 标题版生成失败:', err.message);
    });

    return feed;
  } catch (err) {
    // 自动生成失败绝不能影响发布本身
    console.warn('[auto-short] 生成短视频失败:', err.message);
    return null;
  }
}

async function burnAndSwap(feed, videoRecord, title) {
  try {
    const titled = await burnVideoTitle(videoRecord, title);
    if (!titled) return;
    feeds().update(feed.id, {
      fileId: titled.id,
      titleBurned: true,
      titleBurnedAt: new Date().toISOString(),
      originalFileId: videoRecord.id,
    });
    console.log(`[auto-short] 已生成标题版短视频：${feed.id}`);
  } catch (err) {
    console.warn('[auto-short] 替换视频失败:', err.message);
  }
}

export default { createShortFromListing };
