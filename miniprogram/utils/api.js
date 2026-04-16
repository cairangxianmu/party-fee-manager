const app = getApp()

/**
 * 封装 wx.request，自动附加 Token（管理员）或 X-OpenID（党员）。
 * @param {string} method  HTTP 方法
 * @param {string} url     相对路径，如 '/admin/login'
 * @param {object} data    请求体 / 查询参数
 * @param {boolean} isUser 是否为党员端请求（用 X-OpenID 鉴权）
 */
function request(method, url, data = {}, isUser = false) {
  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',  // 绕过 ngrok 免费版对 GET 请求的拦截页
    }

    if (isUser) {
      let userToken = app.globalData.userToken || ''
      if (!userToken) {
        try { userToken = wx.getStorageSync('userToken') || '' } catch (_) {}
      }
      if (userToken) header['Authorization'] = `Bearer ${userToken}`
    } else {
      let token = app.globalData.token || ''
      if (!token) {
        try { token = wx.getStorageSync('token') || '' } catch (_) {}
      }
      if (token) header['Authorization'] = `Bearer ${token}`
    }

    // GET 请求将 data 拼入 URL
    let fullUrl = app.globalData.baseUrl + url
    if (method === 'GET' && data && Object.keys(data).length > 0) {
      const query = Object.entries(data)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      if (query) fullUrl += '?' + query
    }

    wx.request({
      url: fullUrl,
      method,
      data: method !== 'GET' ? data : undefined,
      header,
      success(res) {
        if (res.statusCode === 401) {
          if (isUser) {
            // 党员 token 过期：清除用户端数据，跳转到绑定页
            app.globalData.userToken = ''
            app.globalData.openid = ''
            app.globalData.memberBound = false
            app.globalData.memberName = ''
            wx.removeStorageSync('userToken')
            wx.removeStorageSync('openid')
            wx.removeStorageSync('memberBound')
            wx.removeStorageSync('memberName')
            wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
            setTimeout(() => wx.redirectTo({ url: '/pages/user/bind/bind' }), 1500)
          } else {
            // 管理员 token 过期：清除管理端数据，跳转首页
            app.globalData.token = ''
            app.globalData.role = ''
            app.globalData.branchId = null
            app.globalData.branchName = ''
            app.globalData.username = ''
            wx.removeStorageSync('token')
            wx.removeStorageSync('role')
            wx.removeStorageSync('branchId')
            wx.removeStorageSync('branchName')
            wx.removeStorageSync('username')
            wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
            setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1500)
          }
          reject(new Error('登录已过期'))
          return
        }
        resolve(res.data)
      },
      fail(err) {
        wx.showToast({ title: '网络连接失败', icon: 'none' })
        reject(err)
      },
    })
  })
}

module.exports = {
  get:  (url, data, isUser) => request('GET',    url, data, isUser),
  post: (url, data, isUser) => request('POST',   url, data, isUser),
  put:  (url, data, isUser) => request('PUT',    url, data, isUser),
  del:  (url, data, isUser) => request('DELETE', url, data, isUser),
}
