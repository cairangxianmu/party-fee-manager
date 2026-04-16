const api = require('../../../utils/api')

const THIS_YEAR = new Date().getFullYear()
const YEAR_LIST = Array.from({ length: 6 }, (_, i) => THIS_YEAR - 1 + i)

Page({
  data: {
    periods: [],
    showModal: false,
    loading: false,
    yearList: YEAR_LIST,
    yearIndex: 1,
    selectedYear: THIS_YEAR,
    monthList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    selectedMonths: {},
    previewNames: [],
  },

  onShow() { this.loadPeriods() },

  async loadPeriods() {
    this.setData({ loading: true })
    try {
      const res = await api.get('/super/periods')
      this.setData({ periods: res.code === 0 ? res.data : [] })
    } finally { this.setData({ loading: false }) }
  },

  onAdd() {
    this.setData({
      showModal: true,
      selectedMonths: {},
      previewNames: [],
      selectedYear: THIS_YEAR,
      yearIndex: 1,
    })
  },

  onCloseModal() { this.setData({ showModal: false }) },

  onYearChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ yearIndex: idx, selectedYear: YEAR_LIST[idx] }, () => this._updatePreview())
  },

  onToggleMonth(e) {
    const month = e.currentTarget.dataset.month
    const selectedMonths = { ...this.data.selectedMonths }
    if (selectedMonths[month]) {
      delete selectedMonths[month]
    } else {
      selectedMonths[month] = true
    }
    this.setData({ selectedMonths }, () => this._updatePreview())
  },

  _updatePreview() {
    const { selectedYear, selectedMonths } = this.data
    const months = Object.keys(selectedMonths)
      .filter(k => selectedMonths[k])
      .map(Number)
      .sort((a, b) => a - b)
    this.setData({ previewNames: months.map(m => `${selectedYear}年${m}月党费`) })
  },

  async onCreate() {
    const { selectedYear, selectedMonths } = this.data
    const months = Object.keys(selectedMonths)
      .filter(k => selectedMonths[k])
      .map(Number)
      .sort((a, b) => a - b)

    if (months.length === 0) {
      wx.showToast({ title: '请至少选择一个月份', icon: 'none' })
      return
    }

    wx.showLoading({ title: '创建中…' })
    const results = await Promise.all(
      months.map(m => api.post('/super/periods', { name: `${selectedYear}年${m}月党费` }))
    )
    wx.hideLoading()
    const successCount = results.filter(r => r.code === 0).length
    const failCount = results.length - successCount

    const msg = failCount > 0
      ? `创建 ${successCount} 个，${failCount} 个已存在`
      : `成功创建 ${successCount} 个期数`
    wx.showToast({ title: msg, icon: successCount > 0 ? 'success' : 'none' })
    this.setData({ showModal: false })
    this.loadPeriods()
  },

  noop() {},

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '确认删除',
      content: `删除期数「${name}」将同时删除该期所有缴费记录，确认继续？`,
      confirmColor: '#c0292b',
      success: async (res) => {
        if (!res.confirm) return
        const r = await api.del(`/super/periods/${id}`)
        wx.showToast({ title: r.code === 0 ? '已删除' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        if (r.code === 0) this.loadPeriods()
      },
    })
  },
})
