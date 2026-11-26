<template>
  <view class="page">
    <view class="hero">
      <view class="hero-t">反馈</view>
      <view class="hero-s">使用中遇到问题或有建议，直接告诉我们</view>
    </view>

    <view class="card">
      <view class="label">问题类型</view>
      <view class="chips">
        <view
          v-for="t in topics"
          :key="t.id || t"
          class="chip"
          :class="{ active: topic === (t.id || t) }"
          @tap="topic = t.id || t"
        >
          {{ t.name || t }}
        </view>
      </view>

      <view class="label mt">详细描述</view>
      <textarea v-model="text" class="textarea" maxlength="1000" placeholder="尽量写清楚复现步骤，方便定位" />

      <view class="label mt">联系方式（选填）</view>
      <input v-model="contact" class="input" placeholder="手机号或邮箱" />

      <button class="btn primary" :loading="busy" @tap="submit">提交反馈</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const topics = ref([{ id: 'bug', name: '功能异常' }, { id: 'suggest', name: '建议' }, { id: 'content', name: '内容问题' }]);
const topic = ref('bug');
const text = ref('');
const contact = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    const r = await api.feedbackTopics();
    const list = (r && (r.items || r.topics)) || [];
    if (list.length) topics.value = list;
    topic.value = topics.value[0] && (topics.value[0].id || topics.value[0]);
  } catch {
    /* 用默认话题 */
  }
});

async function submit() {
  if (!text.value.trim()) {
    uni.showToast({ title: '请填写详细描述', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    await api.feedbackSubmit({ topic: topic.value, text: text.value, contact: contact.value });
    uni.showToast({ title: '已提交，感谢反馈', icon: 'success' });
    text.value = '';
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.page { min-height: 100vh; padding-bottom: 60rpx; }
.hero { padding: 40rpx 32rpx 30rpx; background: linear-gradient(135deg, #0b1f3a, #1a4fa8); color: #fff; }
.hero-t { font-size: 38rpx; font-weight: 700; }
.hero-s { margin-top: 10rpx; font-size: 25rpx; opacity: 0.85; }
.card { margin: 22rpx 24rpx 0; padding: 28rpx; background: #fff; border-radius: 16rpx; }
.label { font-size: 25rpx; color: #607089; margin-bottom: 14rpx; }
.mt { margin-top: 28rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 14rpx; }
.chip { padding: 12rpx 26rpx; border-radius: 999rpx; background: #eef3fb; color: #607089; font-size: 25rpx; }
.chip.active { background: #1a6dff; color: #fff; }
.textarea { width: 100%; height: 240rpx; padding: 20rpx; box-sizing: border-box; border: 1px solid #dce3ef; border-radius: 12rpx; font-size: 26rpx; line-height: 1.7; }
.input { height: 82rpx; padding: 0 22rpx; border: 1px solid #dce3ef; border-radius: 12rpx; font-size: 26rpx; }
.btn { height: 86rpx; line-height: 86rpx; margin-top: 30rpx; border-radius: 12rpx; font-size: 29rpx; }
.btn.primary { background: #1a6dff; color: #fff; }
</style>
