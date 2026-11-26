<template>
  <view class="page">
    <view class="brand">
      <view class="brand-name">小鱼来了</view>
      <view class="brand-sub">登录后即可发布与对接</view>
    </view>

    <view class="card">
      <view class="chips">
        <view class="chip" :class="{ active: tab === 'phone' }" @tap="tab = 'phone'">手机登录</view>
        <view class="chip" :class="{ active: tab === 'douyin' }" @tap="tab = 'douyin'">抖音登录</view>
      </view>

      <!-- 手机号 -->
      <view v-if="tab === 'phone'">
        <input
          v-model="phone"
          class="input"
          type="number"
          maxlength="11"
          placeholder="手机号"
        />
        <view class="row">
          <input v-model="code" class="input grow" type="number" maxlength="6" placeholder="验证码" />
          <button class="btn ghost" :disabled="counting > 0" @tap="sendCode">
            {{ counting > 0 ? `${counting}s` : '获取验证码' }}
          </button>
        </view>
        <button class="btn primary" :loading="busy" @tap="doSmsLogin">登录 / 注册</button>
        <view class="hint">未注册的手机号会自动创建账号</view>
      </view>

      <!-- 抖音 -->
      <view v-else>
        <button class="btn primary" :loading="busy" @tap="doDouyinLogin">抖音授权登录</button>
        <view class="hint">
          已配置抖音开放平台时跳转授权页；未配置时用演示账号登录。<text
            >\n抖音登录后自动建号，昵称头像取自抖音授权信息。</text
          >
        </view>
      </view>
    </view>

    <view class="demo card">
      <view class="demo-t">演示账号</view>
      <view class="demo-line">管理员：18800000000 / admin123456</view>
      <view class="demo-line">普通用户：13800001234 / demo123456</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../api/index.js';
import { applyLogin } from '../../store/user.js';

const tab = ref('phone');
const phone = ref('');
const code = ref('');
const busy = ref(false);
const counting = ref(0);

let timer = null;

async function sendCode() {
  if (!/^1\d{10}$/.test(phone.value)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
    return;
  }
  try {
    const r = await api.smsSend({ phone: phone.value, purpose: 'login' });
    // 演示环境后端会把验证码回传，方便直接体验
    if (r && r.demoCode) {
      code.value = r.demoCode;
      uni.showToast({ title: `演示验证码 ${r.demoCode}`, icon: 'none', duration: 3000 });
    } else {
      uni.showToast({ title: '验证码已发送', icon: 'none' });
    }
    counting.value = 60;
    timer = setInterval(() => {
      counting.value -= 1;
      if (counting.value <= 0) clearInterval(timer);
    }, 1000);
  } catch (e) {
    uni.showToast({ title: e.message || '发送失败', icon: 'none' });
  }
}

async function doSmsLogin() {
  if (!phone.value || !code.value) {
    uni.showToast({ title: '请填写手机号和验证码', icon: 'none' });
    return;
  }
  busy.value = true;
  try {
    const res = await api.smsLogin({ phone: phone.value, code: code.value, purpose: 'login' });
    applyLogin(res);
    uni.showToast({ title: res.created ? '注册并登录成功' : '登录成功', icon: 'none' });
    setTimeout(() => uni.switchTab({ url: '/pages/home/home' }), 600);
  } catch (e) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' });
  } finally {
    busy.value = false;
  }
}

async function doDouyinLogin() {
  busy.value = true;
  try {
    const info = await api.douyinUrl();
    if (info && info.ready && info.url) {
      // 小程序端不能整页跳外部 OAuth，用 webview 打开更稳
      // #ifdef H5
      window.location.href = info.url;
      return;
      // #endif
      // #ifndef H5
      uni.navigateTo({ url: `/pages/login/oauth?url=${encodeURIComponent(info.url)}` });
      return;
      // #endif
    }
    if (!info || !info.demoAvailable) {
      throw new Error((info && info.hint) || '抖音登录未配置');
    }
    const res = await api.douyinDemo({});
    applyLogin(res);
    uni.showToast({ title: '抖音登录成功（演示）', icon: 'none' });
    setTimeout(() => uni.switchTab({ url: '/pages/home/home' }), 600);
  } catch (e) {
    uni.showToast({ title: e.message || '抖音登录失败', icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.page {
  padding: 40rpx 32rpx;
}
.brand {
  padding: 40rpx 0 30rpx;
  text-align: center;
}
.brand-name {
  font-size: 44rpx;
  font-weight: 700;
  color: #0b1f3a;
}
.brand-sub {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #607089;
}
.card {
  padding: 30rpx;
  background: #fff;
  border-radius: 18rpx;
}
.chips {
  display: flex;
  margin-bottom: 28rpx;
}
.chip {
  padding: 12rpx 30rpx;
  margin-right: 16rpx;
  border-radius: 999rpx;
  background: #eef3fb;
  color: #607089;
  font-size: 26rpx;
}
.chip.active {
  background: #1a6dff;
  color: #fff;
}
.input {
  height: 88rpx;
  padding: 0 24rpx;
  margin-bottom: 20rpx;
  border: 1px solid #dce3ef;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.grow {
  flex: 1;
}
.btn {
  height: 88rpx;
  line-height: 88rpx;
  margin-top: 20rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.btn.primary {
  background: #1a6dff;
  color: #fff;
}
.btn.ghost {
  margin-top: 0;
  margin-bottom: 20rpx;
  padding: 0 24rpx;
  background: #eef3fb;
  color: #1a6dff;
  font-size: 26rpx;
}
.hint {
  margin-top: 18rpx;
  font-size: 22rpx;
  color: #8a97ab;
  line-height: 1.6;
}
.demo {
  margin-top: 24rpx;
}
.demo-t {
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.demo-line {
  font-size: 24rpx;
  color: #607089;
  line-height: 1.8;
}
</style>
