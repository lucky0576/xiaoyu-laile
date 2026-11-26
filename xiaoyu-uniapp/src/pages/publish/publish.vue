<template>
  <view class="page">
    <view v-if="!loggedIn" class="need">
      <view class="need-t">发布需要先登录</view>
      <button class="btn primary" @tap="goLogin">去登录</button>
    </view>

    <block v-else>
      <view class="card">
        <view class="field">
          <view class="label">发布到</view>
          <view class="chips">
            <view
              v-for="c in cats"
              :key="c.id"
              class="chip"
              :class="{ active: c.id === category }"
              @tap="category = c.id"
            >
              {{ c.name }}
            </view>
          </view>
        </view>

        <view class="field">
          <view class="label">标题</view>
          <input v-model="title" class="input" maxlength="60" placeholder="一句话说清楚这是什么" />
        </view>

        <view class="field">
          <view class="label">正文</view>
          <textarea
            v-model="text"
            class="textarea"
            maxlength="5000"
            placeholder="项目背景、规模、投资额、合作方式…写得越具体，对接越准"
          />
        </view>

        <view class="field">
          <view class="label">城市 / 行业</view>
          <view class="row">
            <input v-model="city" class="input grow" placeholder="城市" />
            <input v-model="industry" class="input grow" placeholder="行业" />
          </view>
        </view>

        <button class="btn primary" :loading="busy" @tap="submit">发布</button>
        <view class="hint">发布后会进入 AI 解析，自动生成标题与摘要</view>
      </view>
    </block>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../../api/index.js';
import { userStore } from '../../store/user.js';

const cats = ref([
  { id: 'project', name: '项目' },
  { id: 'event', name: '活动' },
  { id: 'trade', name: '贸易' },
  { id: 'bounty', name: '悬赏' },
]);
const category = ref('project');
const title = ref('');
const text = ref('');
const city = ref('');
const industry = ref('');
const busy = ref(false);

const loggedIn = computed(() => userStore.loggedIn);

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

async function submit() {
  if (!text.value.trim()) {
    uni.showToast({ title: '请填写正文', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    const res = await api.createListing(null, {
      category: category.value,
      title: title.value,
      text: text.value,
      city: city.value,
      industry: industry.value,
      publish: '1',
      durationDays: '30',
    });
    const id = res && (res.id || (res.listing && res.listing.id));
    uni.showToast({ title: '发布成功', icon: 'success' });
    title.value = '';
    text.value = '';
    if (id) {
      setTimeout(() => uni.navigateTo({ url: `/pages/detail/detail?id=${id}` }), 700);
    }
  } catch (e) {
    uni.showToast({ title: e.message || '发布失败', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.card {
  padding: 30rpx;
  background: #fff;
  border-radius: 18rpx;
}
.field {
  margin-bottom: 26rpx;
}
.label {
  font-size: 26rpx;
  color: #607089;
  margin-bottom: 14rpx;
}
.input {
  height: 84rpx;
  padding: 0 22rpx;
  border: 1px solid #dce3ef;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.textarea {
  width: 100%;
  height: 260rpx;
  padding: 22rpx;
  box-sizing: border-box;
  border: 1px solid #dce3ef;
  border-radius: 12rpx;
  font-size: 28rpx;
  line-height: 1.7;
}
.row {
  display: flex;
  gap: 16rpx;
}
.grow {
  flex: 1;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.chip {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: #eef3fb;
  color: #607089;
  font-size: 26rpx;
}
.chip.active {
  background: #1a6dff;
  color: #fff;
}
.btn {
  height: 90rpx;
  line-height: 90rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.hint {
  margin-top: 18rpx;
  font-size: 22rpx;
  color: #8a97ab;
  text-align: center;
}
.need {
  padding: 80rpx 30rpx;
  text-align: center;
}
.need-t {
  font-size: 30rpx;
  color: #607089;
  margin-bottom: 30rpx;
}
</style>
