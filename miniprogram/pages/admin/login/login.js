const app = getApp()
const api = require('../../../utils/api')

Page({
  data: {
    username: '',
    password: '',
    loading: false,
  },

  onUsernameInput(e) { this.setData({ username: e.detail.value }) },
  onPasswordInput(e) { this.setData({ password: e.detail.value }) },

  async onLogin() {
    const { username, password } = this.data
    if (!username.trim() || !password.trim()) {
      wx.showToast({ title: '请填写用户名和密码', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    try {
      const res = await api.post('/admin/login', { username, password })
      if (res.code !== 0) {
        wx.showToast({ title: res.msg || '登录失败', icon: 'none' })
        return
      }

      const { token, role, branch_id: branchId, branch_name: branchName, username: uname } = res.data
      app.globalData.token = token
      app.globalData.role = role
      app.globalData.branchId = branchId
      app.globalData.branchName = branchName || ''
      app.globalData.username = uname

      wx.setStorageSync('token', token)
      wx.setStorageSync('role', role)
      wx.setStorageSync('branchId', branchId)
      wx.setStorageSync('branchName', branchName || '')
      wx.setStorageSync('username', uname)

      wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' })
    } catch (_) {
      // 错误已在 api.js 中 showToast
    } finally {
      this.setData({ loading: false })
    }
  },
})
