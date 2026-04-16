const api = require('../../../utils/api')

const FIELD_LABELS = {
  phone: '手机号',
  identity: '党员身份',
  branch_id: '所在支部',
  amount: '应缴金额',
}

function parseChanges(changes) {
  if (!changes || typeof changes !== 'object') return []
  return Object.keys(changes).map(field => {
    const c = changes[field]
    const label = FIELD_LABELS[field] || field
    let oldVal = String(c.old ?? '')
    let newVal = String(c.new ?? '')
    if (field === 'branch_id') {
      oldVal = c.old_name || oldVal
      newVal = c.new_name || newVal
    }
    if (field === 'amount') {
      oldVal = Number(c.old).toFixed(2) + ' 元'
      newVal = Number(c.new).toFixed(2) + ' 元'
    }
    return { label, oldVal, newVal }
  })
}

Page({
  data: {
    list: [],
    loading: false,
    filter: 'pending',
    // 驳回弹窗
    showReject: false,
    rejectId: null,
    rejectReason: '',
    submitting: false,
  },

  onShow() { this.loadList() },

  async loadList() {
    this.setData({ loading: true })
    try {
      const res = await api.get('/admin/info_requests', { status: this.data.filter })
      if (res.code === 0) {
        const list = (res.data || []).map(item => ({
          ...item,
          changeItems: parseChanges(item.changes),
        }))
        this.setData({ list })
      } else {
        this.setData({ list: [] })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  onFilterChange(e) {
    this.setData({ filter: e.currentTarget.dataset.val }, () => this.loadList())
  },

  onApprove(e) {
    if (this.data.submitting) return
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '批准信息修改',
      content: `确认批准 ${name} 的信息修改申请？批准后将立即生效。`,
      confirmColor: '#27ae60',
      success: async (r) => {
        if (!r.confirm) return
        this.setData({ submitting: true })
        try {
          const res = await api.post(`/admin/info_requests/${id}/approve`)
          if (res.code === 0) {
            wx.showToast({ title: '已批准', icon: 'success' })
            this.loadList()
          } else {
            wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
          }
        } finally {
          this.setData({ submitting: false })
        }
      },
    })
  },

  onReject(e) {
    const { id } = e.currentTarget.dataset
    this.setData({ showReject: true, rejectId: id, rejectReason: '' })
  },
  onCloseReject() { this.setData({ showReject: false }) },
  onReasonInput(e) { this.setData({ rejectReason: e.detail.value }) },

  async onConfirmReject() {
    if (this.data.submitting) return
    const { rejectId, rejectReason } = this.data
    if (!rejectReason.trim()) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' }); return
    }
    this.setData({ submitting: true })
    try {
      const res = await api.post(`/admin/info_requests/${rejectId}/reject`, { reason: rejectReason.trim() })
      if (res.code === 0) {
        wx.showToast({ title: '已驳回', icon: 'success' })
        this.setData({ showReject: false })
        this.loadList()
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  noop() {},
})
