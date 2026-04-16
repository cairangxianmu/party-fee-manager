const app = getApp()
const api = require('../../../utils/api')

const fmt2 = (n) => Number(n || 0).toFixed(2)

Page({
  data: {
    role: '',
    username: '',
    branchName: '',
    periods: [],
    branches: [],
    selectedPeriodId: '',
    selectedPeriodName: '',
    stat: { total: 0, paid: 0, unpaid: 0, amount: 0 },
    displayStat: { total: 0, paid: 0, unpaid: 0, amount: 0 },
    details: [],
    filteredDetails: [],
    branchStats: [],
    loading: false,
    confirming: false,
    isSuper: false,
    pendingPhoneReq: 0,
    // list filters
    statusFilter: 'all',
    // period multi-select
    showPeriodSheet: false,
    periodCheckboxes: [],
    checkedPeriodCount: 0,
    // branch multi-select
    showBranchSheet: false,
    branchCheckboxes: [],
    checkedBranchCount: 0,
  },

  onLoad() {
    const role = app.globalData.role
    this.setData({
      role,
      username: app.globalData.username,
      isSuper: role === 'super',
      branchName: app.globalData.branchName || '',
    })
  },

  onShow() {
    this.loadDashboard()
    this.loadPendingPhoneReq()
  },

  async loadPendingPhoneReq() {
    try {
      const res = await api.get('/admin/info_requests/count')
      if (res.code === 0) {
        this.setData({ pendingPhoneReq: (res.data && res.data.pending) || 0 })
      }
    } catch (_) {}
  },

  async loadDashboard() {
    this.setData({ loading: true })
    const { isSuper, periodCheckboxes } = this.data
    const url = isSuper ? '/super/dashboard' : '/branch/dashboard'
    const params = {}

    // Pass checked period IDs to backend
    const checkedPeriodIds = (periodCheckboxes || []).filter(p => p.checked).map(p => p.id)
    if (checkedPeriodIds.length > 0) params.period_ids = checkedPeriodIds.join(',')

    try {
      const res = await api.get(url, params)
      if (res.code !== 0) { wx.showToast({ title: res.msg, icon: 'none' }); return }
      const d = res.data
      const details = (d.details || []).map(x => ({ ...x, amount_fmt: fmt2(x.amount) }))
      const periods = d.periods || []
      const branches = d.branches || []

      if (!isSuper && d.branch_name) {
        app.globalData.branchName = d.branch_name
        this.setData({ branchName: d.branch_name })
      }

      // Initialize periodCheckboxes: preserve user's selection; default to latest if nothing checked
      const prevPeriodChecked = new Set(
        (this.data.periodCheckboxes || []).filter(p => p.checked).map(p => String(p.id))
      )
      const nothingChecked = prevPeriodChecked.size === 0
      const newPeriodCheckboxes = periods.map((p, idx) => ({
        ...p,
        checked: nothingChecked ? idx === 0 : prevPeriodChecked.has(String(p.id)),
      }))
      const checkedPeriodCount = newPeriodCheckboxes.filter(p => p.checked).length
      const checkedPeriods = newPeriodCheckboxes.filter(p => p.checked)
      const selectedPeriodId = checkedPeriods.length === 1 ? String(checkedPeriods[0].id) : ''
      const selectedPeriodName = checkedPeriods.length === 1
        ? checkedPeriods[0].name
        : checkedPeriods.length > 1 ? `已选${checkedPeriods.length}期` : ''

      // Preserve checked state of branch checkboxes
      const prevBranchChecked = new Set(
        (this.data.branchCheckboxes || []).filter(b => b.checked).map(b => String(b.id))
      )
      const branchCheckboxes = branches.map(b => ({
        ...b, checked: prevBranchChecked.has(String(b.id)),
      }))
      const checkedBranchCount = branchCheckboxes.filter(b => b.checked).length

      // Branch stats: if returned by backend (super), use it; otherwise compute client-side
      const branchStats = d.branch_stats || this._computeBranchStats(details)

      this.setData({
        stat: { total: d.total, paid: d.paid, unpaid: d.unpaid, amount: fmt2(d.amount) },
        displayStat: { total: d.total, paid: d.paid, unpaid: d.unpaid, amount: fmt2(d.amount) },
        details,
        periods,
        branches,
        branchStats,
        branchCheckboxes,
        checkedBranchCount,
        periodCheckboxes: newPeriodCheckboxes,
        checkedPeriodCount,
        selectedPeriodId,
        selectedPeriodName,
      }, () => {
        this._computeFiltered()
      })
    } catch (_) {}
    finally { this.setData({ loading: false }) }
  },

  _drawPieChart() {
    const { branchStats } = this.data
    if (!branchStats.length) return

    const totalMembers = branchStats.reduce((s, b) => s + b.total, 0)
    if (totalMembers === 0) return

    wx.createSelectorQuery().in(this)
      .select('#branchPieChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const W = res[0].width
        const H = res[0].height
        if (!W || !H) return

        const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2
        canvas.width  = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)

        const cx = W / 2
        const cy = H / 2
        const outerR = Math.min(cx, cy) - 6
        const innerR = outerR * 0.54
        // Small gap between branch sections; no gap if only one branch
        const GAP = branchStats.length > 1 ? 0.05 : 0

        let angle = -Math.PI / 2

        branchStats.forEach(branch => {
          const sectionAngle = (branch.total / totalMembers) * 2 * Math.PI - GAP
          if (sectionAngle <= 0) { angle += GAP; return }

          const paidAngle   = branch.total > 0 ? (branch.paid   / branch.total) * sectionAngle : 0
          const unpaidAngle = sectionAngle - paidAngle

          // Green: paid portion
          if (paidAngle > 0.001) {
            ctx.beginPath()
            ctx.arc(cx, cy, outerR, angle, angle + paidAngle)
            ctx.arc(cx, cy, innerR, angle + paidAngle, angle, true)
            ctx.closePath()
            ctx.fillStyle = '#27ae60'
            ctx.fill()
          }

          // Red: unpaid portion
          if (unpaidAngle > 0.001) {
            const uStart = angle + paidAngle
            ctx.beginPath()
            ctx.arc(cx, cy, outerR, uStart, uStart + unpaidAngle)
            ctx.arc(cx, cy, innerR, uStart + unpaidAngle, uStart, true)
            ctx.closePath()
            ctx.fillStyle = '#e74c3c'
            ctx.fill()
          }

          angle += sectionAngle + GAP
        })

        // Center text: overall paid %
        const totalPaid = branchStats.reduce((s, b) => s + b.paid, 0)
        const pct = Math.round(totalPaid / totalMembers * 100)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#222'
        ctx.font = `bold ${Math.round(innerR * 0.72)}px sans-serif`
        ctx.fillText(`${pct}%`, cx, cy - innerR * 0.12)
        ctx.font = `${Math.round(innerR * 0.30)}px sans-serif`
        ctx.fillStyle = '#999'
        ctx.fillText('整体已缴', cx, cy + innerR * 0.46)
      })
  },

  _computeBranchStats(details) {
    const map = {}
    details.forEach(d => {
      const key = String(d.branch_id || 'unknown')
      if (!map[key]) map[key] = { id: key, name: d.branch_name || '未知', total: 0, paid: 0 }
      map[key].total++
      if (d.paid) map[key].paid++
    })
    return Object.values(map).map(b => ({
      ...b,
      unpaid: b.total - b.paid,
      rate: b.total > 0 ? Math.round(b.paid / b.total * 100) : 0,
    }))
  },

  _computeFiltered() {
    const { details, statusFilter, branchCheckboxes, isSuper } = this.data

    // Branch filter (super admin only)
    const checkedIds = isSuper
      ? branchCheckboxes.filter(b => b.checked).map(b => String(b.id))
      : []
    const branchFiltered = checkedIds.length > 0
      ? details.filter(d => checkedIds.includes(String(d.branch_id)))
      : details

    // Recompute displayStat and chart stats from branch-filtered set (before status tab)
    const displayStat = {
      total: branchFiltered.length,
      paid: branchFiltered.filter(d => d.paid).length,
      unpaid: branchFiltered.filter(d => !d.paid).length,
      amount: fmt2(branchFiltered.filter(d => d.paid).reduce((s, d) => s + d.amount, 0)),
    }
    const branchStats = this._computeBranchStats(branchFiltered)

    // Apply status filter on top for the list
    let filtered = branchFiltered
    if (statusFilter === 'paid')        filtered = filtered.filter(d => d.paid)
    else if (statusFilter === 'unpaid') filtered = filtered.filter(d => !d.paid)

    this.setData({ filteredDetails: filtered, displayStat, branchStats }, () => {
      wx.nextTick(() => this._drawPieChart())
    })
  },

  onStatusFilter(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.val }, () => this._computeFiltered())
  },

  onShowPeriodSheet() { this.setData({ showPeriodSheet: true }) },

  onClosePeriodSheet() {
    const checkedPeriods = this.data.periodCheckboxes.filter(p => p.checked)
    const checkedPeriodCount = checkedPeriods.length
    const selectedPeriodId = checkedPeriods.length === 1 ? String(checkedPeriods[0].id) : ''
    const selectedPeriodName = checkedPeriods.length === 1
      ? checkedPeriods[0].name
      : checkedPeriods.length > 1 ? `已选${checkedPeriods.length}期` : ''
    this.setData({ showPeriodSheet: false, checkedPeriodCount, selectedPeriodId, selectedPeriodName }, () => {
      this.loadDashboard()
    })
  },

  onClearPeriodFilter() {
    const periodCheckboxes = this.data.periodCheckboxes.map(p => ({ ...p, checked: false }))
    this.setData({
      showPeriodSheet: false, periodCheckboxes,
      checkedPeriodCount: 0, selectedPeriodId: '', selectedPeriodName: '',
    }, () => { this.loadDashboard() })
  },

  onTogglePeriodCheck(e) {
    const id = String(e.currentTarget.dataset.id)
    const periodCheckboxes = this.data.periodCheckboxes.map(p =>
      String(p.id) === id ? { ...p, checked: !p.checked } : p
    )
    this.setData({ periodCheckboxes })
  },

  onShowBranchSheet() { this.setData({ showBranchSheet: true }) },

  onCloseBranchSheet() {
    const checkedBranchCount = this.data.branchCheckboxes.filter(b => b.checked).length
    this.setData({ showBranchSheet: false, checkedBranchCount }, () => this._computeFiltered())
  },

  onClearBranchFilter() {
    const branchCheckboxes = this.data.branchCheckboxes.map(b => ({ ...b, checked: false }))
    this.setData({ showBranchSheet: false, branchCheckboxes, checkedBranchCount: 0 }, () => {
      this._computeFiltered()
    })
  },

  onToggleBranchCheck(e) {
    const id = String(e.currentTarget.dataset.id)
    const branchCheckboxes = this.data.branchCheckboxes.map(b =>
      String(b.id) === id ? { ...b, checked: !b.checked } : b
    )
    this.setData({ branchCheckboxes })
  },

  async onConfirm(e) {
    if (this.data.confirming) return
    const { id, paid } = e.currentTarget.dataset
    const nextPaid = paid ? 0 : 1
    const tip = nextPaid ? '确认将此笔记录标记为已缴到账？' : '确认撤销此笔已缴记录？'
    const ok = await new Promise(resolve =>
      wx.showModal({ title: '确认操作', content: tip, success: r => resolve(r.confirm) })
    )
    if (!ok) return

    this.setData({ confirming: true })
    try {
      const url = this.data.isSuper ? `/super/confirm/${id}` : `/branch/confirm/${id}`
      const res = await api.post(url, { paid: nextPaid })
      if (res.code === 0) this.loadDashboard()
      else wx.showToast({ title: res.msg, icon: 'none' })
    } finally {
      this.setData({ confirming: false })
    }
  },

  async onConfirmAll() {
    const { selectedPeriodId, checkedPeriodCount, isSuper } = this.data
    if (!selectedPeriodId) {
      wx.showToast({ title: checkedPeriodCount > 1 ? '一键确认仅支持单期操作' : '请先选择期数', icon: 'none' })
      return
    }
    wx.showModal({
      title: '确认操作',
      content: isSuper ? '确认全院所有未缴党费为已到账？' : '确认本支部所有未缴党费为已到账？',
      success: async (res) => {
        if (!res.confirm) return
        const url = isSuper
          ? `/super/confirm_all/${selectedPeriodId}`
          : `/branch/confirm_all/${selectedPeriodId}`
        const r = await api.post(url, {})
        wx.showToast({ title: r.code === 0 ? '操作成功' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        this.loadDashboard()
      },
    })
  },

  noop() {},

  goMembers() { wx.navigateTo({ url: '/pages/admin/members/members' }) },
  goPeriods()  { wx.navigateTo({ url: '/pages/admin/periods/periods' }) },
  goBranches() { wx.navigateTo({ url: '/pages/admin/branches/branches' }) },
  goAdmins()   { wx.navigateTo({ url: '/pages/admin/admins/admins' }) },
  goPhoneRequests() { wx.navigateTo({ url: '/pages/admin/phone_requests/phone_requests' }) },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出管理后台？',
      success: (res) => { if (res.confirm) app.adminLogout() },
    })
  },

  exportExcel() {
    const { periodCheckboxes, branchCheckboxes, isSuper } = this.data
    const checkedPeriodIds = (periodCheckboxes || []).filter(p => p.checked).map(p => p.id)
    if (checkedPeriodIds.length === 0) { wx.showToast({ title: '请先选择期数', icon: 'none' }); return }

    const app = getApp()
    const token = app.globalData.token || ''
    const queryParams = [`period_ids=${checkedPeriodIds.join(',')}`]
    if (isSuper) {
      const checkedBranchIds = (branchCheckboxes || []).filter(b => b.checked).map(b => b.id)
      if (checkedBranchIds.length > 0) queryParams.push(`branch_ids=${checkedBranchIds.join(',')}`)
    }
    const base = isSuper ? `${app.globalData.baseUrl}/super/export` : `${app.globalData.baseUrl}/branch/export`
    let url = `${base}?${queryParams.join('&')}`

    wx.showLoading({ title: '导出中…' })
    wx.downloadFile({
      url,
      header: {
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      success: (res) => {
        wx.hideLoading()
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'xlsx',
            showMenu: true,
            fail: () => wx.showToast({ title: '无法打开文件，请在电脑端操作', icon: 'none' }),
          })
        } else {
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败，请检查网络', icon: 'none' })
      },
    })
  },
})
