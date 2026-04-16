const app = getApp()
const api = require('../../../utils/api')

const fmt2 = (n) => Number(n || 0).toFixed(2)

const IDENTITY_LIST = ['正式党员', '预备党员']

Page({
  data: {
    memberName: '',
    records: [],
    loading: false,
    unpaidCount: 0,
    // 修改信息
    showInfoModal: false,
    infoChanging: false,
    infoRequest: null,
    // 当前信息（预填）
    profile: null,
    branches: [],
    // 修改表单
    formPhone: '',
    formIdentityIndex: 0,
    formBranchIndex: 0,
    formAmount: '',
    formNote: '',
    identityList: IDENTITY_LIST,
  },

  onLoad() {
    this.setData({ memberName: app.globalData.memberName || '' })
  },

  onShow() {
    this.loadRecords()
    this.loadInfoRequest()
  },

  async loadInfoRequest() {
    if (!app.globalData.userToken) return
    try {
      const res = await api.get('/user/info_request', {}, true)
      if (res.code === 0) {
        this.setData({ infoRequest: res.data || null })
      }
    } catch (_) {}
  },

  async loadProfile() {
    try {
      const res = await api.get('/user/profile', {}, true)
      if (res.code === 0) {
        const d = res.data
        const branches = d.branches || []
        const identityIndex = Math.max(0, IDENTITY_LIST.indexOf(d.identity))
        const branchIndex = Math.max(0, branches.findIndex(b => b.id === d.branch_id))
        this.setData({
          profile: d,
          branches,
          formPhone: d.phone || '',
          formIdentityIndex: identityIndex,
          formBranchIndex: branchIndex,
          formAmount: fmt2(d.amount),
          formNote: '',
        })
        return true
      }
    } catch (_) {}
    return false
  },

  async loadRecords() {
    if (!app.globalData.userToken) {
      wx.redirectTo({ url: '/pages/user/bind/bind' }); return
    }
    this.setData({ loading: true })
    try {
      const res = await api.get('/user/records', {}, true)
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
        const records = (res.data.records || []).map(r => ({ ...r, amount_fmt: fmt2(r.amount) }))
        this.setData({
          records,
          unpaidCount: records.filter(r => !r.paid).length,
          memberName: res.data.member_name || app.globalData.memberName,
        })
      }
    } finally { this.setData({ loading: false }) }
  },

  goPay() { wx.navigateTo({ url: '/pages/user/pay/pay' }) },
  goBack() { wx.reLaunch({ url: '/pages/index/index' }) },

  async onChangeInfo() {
    const req = this.data.infoRequest
    if (req && req.status === 'pending') {
      wx.showToast({ title: '已有待审核申请，请等待管理员处理', icon: 'none' })
      return
    }
    wx.showLoading({ title: '加载中…' })
    const ok = await this.loadProfile()
    wx.hideLoading()
    if (!ok) {
      wx.showToast({ title: '加载信息失败，请重试', icon: 'none' }); return
    }
    this.setData({ showInfoModal: true })
  },

  onCloseInfoModal() { this.setData({ showInfoModal: false }) },

  onPhoneInput(e) { this.setData({ formPhone: e.detail.value }) },
  onAmountInput(e) { this.setData({ formAmount: e.detail.value }) },
  onNoteInput(e) { this.setData({ formNote: e.detail.value }) },

  onIdentityChange(e) {
    this.setData({ formIdentityIndex: Number(e.detail.value) })
  },

  onBranchChange(e) {
    this.setData({ formBranchIndex: Number(e.detail.value) })
  },

  noop() {},

  async onConfirmChangeInfo() {
    const {
      formPhone, formIdentityIndex, formBranchIndex,
      formAmount, formNote, profile, branches, identityList,
    } = this.data

    if (!formNote.trim()) {
      wx.showToast({ title: '请填写修改说明', icon: 'none' }); return
    }

    const payload = { note: formNote.trim() }

    // 手机号
    if (formPhone.trim() !== (profile.phone || '')) {
      payload.phone = formPhone.trim()
    }

    // 党员身份
    const selectedIdentity = identityList[formIdentityIndex]
    if (selectedIdentity !== profile.identity) {
      payload.identity = selectedIdentity
    }

    // 所在支部
    const selectedBranch = branches[formBranchIndex]
    if (selectedBranch && selectedBranch.id !== profile.branch_id) {
      payload.branch_id = selectedBranch.id
    }

    // 应缴金额
    if (formAmount.trim() && Math.abs(parseFloat(formAmount) - profile.amount) > 0.001) {
      payload.amount = formAmount.trim()
    }

    if (Object.keys(payload).length <= 1) {
      wx.showToast({ title: '未修改任何信息，请至少更改一项', icon: 'none' }); return
    }

    this.setData({ infoChanging: true })
    try {
      const res = await api.post('/user/change_info', payload, true)
      if (res.code === 0) {
        wx.showToast({ title: '申请已提交，等待管理员审核', icon: 'success' })
        this.setData({ showInfoModal: false })
        this.loadInfoRequest()
      } else {
        wx.showToast({ title: res.msg || '提交失败', icon: 'none' })
      }
    } finally {
      this.setData({ infoChanging: false })
    }
  },
})
