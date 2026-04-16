const app = getApp()
const api = require('../../../utils/api')

const fmt2 = (n) => Number(n || 0).toFixed(2)

Page({
  data: {
    memberName: '',
    items: [],
    loading: false,
    paying: false,
    payingId: null,
  },

  onLoad() {
    this.setData({ memberName: app.globalData.memberName || '' })
  },

  onShow() { this.loadUnpaid() },

  async loadUnpaid() {
    if (!app.globalData.userToken) {
      wx.redirectTo({ url: '/pages/user/bind/bind' }); return
    }
    this.setData({ loading: true })
    try {
      const res = await api.get('/user/unpaid', {}, true)
      if (res.code === 403) {
        app.globalData.userToken = ''
        app.globalData.openid = ''
        app.globalData.memberBound = false
        app.globalData.memberName = ''
        wx.removeStorageSync('userToken')
        wx.removeStorageSync('openid')
        wx.removeStorageSync('memberBound')
        wx.removeStorageSync('memberName')
        wx.redirectTo({ url: '/pages/user/bind/bind' }); return
      }
      if (res.code === 0) {
        const items = (res.data.items || []).map(x => ({ ...x, amount_fmt: fmt2(x.amount) }))
        this.setData({
          items,
          memberName: res.data.member_name || app.globalData.memberName,
        })
      }
    } finally { this.setData({ loading: false }) }
  },

  async onPay(e) {
    const { paymentId, amount, periodName } = e.currentTarget.dataset
    if (this.data.paying) return

    wx.showModal({
      title: '确认缴费',
      content: `${periodName}\n应缴金额：¥${fmt2(amount)}\n\n确认发起支付？`,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ paying: true, payingId: paymentId })
        try {
          await this._doPay(paymentId, amount, periodName)
        } finally {
          this.setData({ paying: false, payingId: null })
        }
      },
    })
  },

  async _doPay(paymentId, amount, periodName) {
    wx.showLoading({ title: '请求中…' })

    const res = await api.post('/pay/create_order', { payment_id: paymentId }, true)
    wx.hideLoading()

    if (res.code !== 0) {
      wx.showToast({ title: res.msg || '下单失败', icon: 'none' }); return
    }

    // Mock 模式：直接成功
    if (res.mock) {
      wx.showToast({ title: '缴费成功！', icon: 'success' })
      this.loadUnpaid()  // 先刷新当前页，移除已缴项
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 真实微信支付
    const { timeStamp, nonceStr, package: pkg, signType, paySign } = res.data
    try {
      await new Promise((resolve, reject) =>
        wx.requestPayment({
          timeStamp, nonceStr, package: pkg, signType, paySign,
          success: resolve,
          fail: reject,
        })
      )
      wx.showToast({ title: '缴费成功！', icon: 'success' })
      this.loadUnpaid()  // 刷新当前页
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请重试', icon: 'none' })
      }
    }
  },
})
