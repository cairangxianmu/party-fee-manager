const app = getApp()
const api = require('../../../utils/api')

Page({
  data: {
    memberNo: '',
    phone: '',
    loading: false,
    loginLoading: false,
    openid: '',
  },

  onLoad() {
    app.waitReady().then(() => this.initOpenid())
  },

  async initOpenid() {
    // 如已有 openid 则直接使用
    if (app.globalData.openid) {
      this.setData({ openid: app.globalData.openid })

      // 检查是否已绑定
      if (app.globalData.memberBound) {
        wx.redirectTo({ url: '/pages/user/records/records' })
      }
      return
    }

    this.setData({ loginLoading: true })
    try {
      const { code } = await new Promise((resolve, reject) =>
        wx.login({ success: resolve, fail: reject })
      )

      const res = await api.post('/user/login', { code })
      if (res.code !== 0) {
        wx.showToast({ title: res.msg, icon: 'none' }); return
      }

      const { openid, bound, member_name: memberName, user_token: userToken } = res.data
      app.globalData.openid = openid
      app.globalData.memberBound = bound
      app.globalData.memberName = memberName || ''
      wx.setStorageSync('openid', openid)
      wx.setStorageSync('memberBound', bound)
      wx.setStorageSync('memberName', memberName || '')

      if (bound && userToken) {
        app.globalData.userToken = userToken
        wx.setStorageSync('userToken', userToken)
      }

      this.setData({ openid })

      if (bound) {
        wx.redirectTo({ url: '/pages/user/records/records' })
      }
    } catch (e) {
      // 开发环境：允许手动输入 openid 进行测试
      wx.showModal({
        title: '开发提示',
        content: '无法获取微信登录凭证，是否使用测试openid？',
        success: (r) => {
          if (r.confirm) {
            const testId = `test_openid_${Date.now()}`
            app.globalData.openid = testId
            wx.setStorageSync('openid', testId)
            this.setData({ openid: testId })
          }
        },
      })
    } finally {
      this.setData({ loginLoading: false })
    }
  },

  onMemberNoInput(e) { this.setData({ memberNo: e.detail.value }) },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },

  async onBind() {
    const { memberNo, phone, openid } = this.data
    if (!memberNo.trim()) {
      wx.showToast({ title: '请输入工号/学号', icon: 'none' }); return
    }
    if (!phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' }); return
    }
    if (!openid) {
      wx.showToast({ title: '请先获取微信登录凭证', icon: 'none' }); return
    }

    this.setData({ loading: true })
    try {
      const res = await api.post('/user/bind', {
        openid,
        member_no: memberNo.trim(),
        phone: phone.trim(),
      }, false)

      if (res.code === 0) {
        app.globalData.memberBound = true
        app.globalData.memberName = res.data.name
        app.globalData.userToken = res.data.user_token || ''
        wx.setStorageSync('memberBound', true)
        wx.setStorageSync('memberName', res.data.name)
        wx.setStorageSync('userToken', res.data.user_token || '')
        wx.showToast({ title: `绑定成功，欢迎 ${res.data.name}`, icon: 'success' })
        setTimeout(() => wx.redirectTo({ url: '/pages/user/records/records' }), 1500)
      } else {
        wx.showToast({ title: res.msg, icon: 'none' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },
})
