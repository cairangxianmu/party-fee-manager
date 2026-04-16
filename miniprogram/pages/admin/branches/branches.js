const api = require('../../../utils/api')

Page({
  data: {
    branches: [],
    loading: false,
    showModal: false,
    isNew: true,
    form: { name: '', leader: '' },
  },

  onShow() { this.loadBranches() },

  async loadBranches() {
    this.setData({ loading: true })
    try {
      const res = await api.get('/super/branches')
      this.setData({ branches: res.code === 0 ? res.data : [] })
    } finally { this.setData({ loading: false }) }
  },

  onAdd() {
    this.setData({ showModal: true, isNew: true, form: { name: '', leader: '' } })
  },
  onEdit(e) {
    this.setData({ showModal: true, isNew: false, form: { ...e.currentTarget.dataset.branch } })
  },
  onCloseModal() { this.setData({ showModal: false }) },
  onNameInput(e) { this.setData({ 'form.name': e.detail.value }) },
  onLeaderInput(e) { this.setData({ 'form.leader': e.detail.value }) },

  async onSave() {
    const { form, isNew } = this.data
    if (!form.name.trim()) { wx.showToast({ title: '支部名称不能为空', icon: 'none' }); return }

    try {
      const res = isNew
        ? await api.post('/super/branches', form)
        : await api.put(`/super/branches/${form.id}`, form)

      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({ showModal: false })
        this.loadBranches()
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
      }
    } catch (_) {
      // 网络错误已在 api.js 中 showToast
    }
  },

  noop() {},

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '确认删除',
      content: `确认删除支部「${name}」？该操作不可恢复。`,
      confirmColor: '#c0292b',
      success: async (res) => {
        if (!res.confirm) return
        const r = await api.del(`/super/branches/${id}`)
        wx.showToast({ title: r.code === 0 ? '已删除' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        if (r.code === 0) this.loadBranches()
      },
    })
  },
})
