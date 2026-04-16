const app = getApp()

Page({
  onLoad() {
    app.waitReady().then(() => {
      // 冷启动且已有管理员 Token，自动跳到看板；用户主动返回首页时不再跳转
      if (app.globalData.token && app.globalData._autoRedirect) {
        app.globalData._autoRedirect = false
        wx.reLaunch({ url: '/pages/admin/dashboard/dashboard' })
      }
    })
  },

  goAdminLogin() {
    wx.navigateTo({ url: '/pages/admin/login/login' })
  },

  goUserEntry() {
    // 如已有 openid 且已绑定，直接到记录页；否则先绑定
    if (app.globalData.openid && app.globalData.memberBound) {
      wx.navigateTo({ url: '/pages/user/records/records' })
    } else {
      wx.navigateTo({ url: '/pages/user/bind/bind' })
    }
  },
})
