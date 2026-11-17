const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISSUE_URL = 'https://lifa-mosaic-license-issuer.weixin.sneezry.cn/api/issue-license';

Page({
  data: {
    clientId: '',
    mode: 'short',
    loading: false,
    error: '',
    result: null,
    validity: ''
  },

  onClientIdInput(event) {
    this.setData({
      clientId: event.detail.value,
      error: '',
      result: null
    });
  },

  onModeChange(event) {
    const mode = event.detail.value;
    if (mode === 'short' || mode === 'permanent') {
      this.setData({ mode, error: '', result: null });
    }
  },

  async onSubmit() {
    if (this.data.loading) {
      return;
    }

    const clientId = this.data.clientId.trim();
    if (!CLIENT_ID_PATTERN.test(clientId)) {
      this.setData({ error: '请输入正确的客户端 ID（UUID 格式）。', result: null });
      return;
    }
    const mode = this.data.mode;
    this.setData({ loading: true, error: '', result: null });
    try {
      const login = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!login.code) {
        throw new Error('微信登录失败，请重试。');
      }

      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: ISSUE_URL,
          method: 'POST',
          header: { 'content-type': 'application/json' },
          data: { clientId, mode, code: login.code },
          timeout: 30000,
          success: resolve,
          fail: reject
        });
      });
      if (response.statusCode !== 200) {
        const message = response.data && typeof response.data.error === 'string'
          ? response.data.error
          : `签发服务响应异常（${response.statusCode}）。`;
        throw new Error(message);
      }

      const result = response.data;
      const expectedDays = mode === 'short' ? 1 : 0;
      if (!result || typeof result.downloadUrl !== 'string' ||
          !/^https:\/\/\S+$/.test(result.downloadUrl) ||
          result.durationDays !== expectedDays) {
        throw new Error('云函数返回了无效的签发结果');
      }

      this.setData({
        result,
        validity: expectedDays === 1 ? '1 天' : '永久'
      });
    } catch (error) {
      console.error('签发许可失败', error);
      this.setData({ error: error.message || error.errMsg || '签发失败，请稍后重试。' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onCopyLink() {
    if (!this.data.result) {
      return;
    }
    try {
      await wx.setClipboardData({ data: this.data.result.downloadUrl });
    } catch (error) {
      console.error('复制许可链接失败', error);
      this.setData({ error: '复制失败，请稍后重试。' });
    }
  }
});
