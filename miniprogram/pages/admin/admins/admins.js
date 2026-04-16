const api = require('../../../utils/api')

const ROLE_VALUES = ['branch', 'super']
const ROLE_DISPLAY = ['普通管理员', '超级管理员']
const ROLE_LABELS = { super: '超级管理员', branch: '普通管理员' }

Page({
  data: {
    admins: [],
    branches: [],
    showModal: false,
    isNew: true,
    form: { username: '', password: '', role: 'branch', branch_id: '', is_active: 1 },
    roleOptions: ROLE_DISPLAY,
    roleLabels: ROLE_LABELS,
    showLogs: false,
    logs: [],
    logsAdmin: '',
  },

  onShow() { this.loadData() },

  async loadData() {
    const [aRes, bRes] = await Promise.all([
      api.get('/super/admins'),
      api.get('/super/branches'),
    ])
    this.setData({
      admins: aRes.code === 0 ? aRes.data : [],
      branches: bRes.code === 0 ? bRes.data : [],
    })
  },

  onAdd() {
    this.setData({ showModal: true, isNew: true,
      form: { username: '', password: '', role: 'branch', branch_id: '', is_active: 1 } })
  },
  onEdit(e) {
    const admin = e.currentTarget.dataset.admin
    this.setData({ showModal: true, isNew: false, form: { ...admin, password: '' } })
  },
  onCloseModal() { this.setData({ showModal: false }) },
  onCloseLogs() { this.setData({ showLogs: false }) },

  onFormInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  onRoleChange(e) { this.setData({ 'form.role': ROLE_VALUES[e.detail.value] }) },
  onBranchChange(e) {
    const branch = this.data.branches[e.detail.value] || {}
    this.setData({ 'form.branch_id': branch.id || '', 'form.branch_name': branch.name || '' })
  },
  onActiveChange(e) { this.setData({ 'form.is_active': e.detail.value ? 1 : 0 }) },

  async onSave() {
    const { form, isNew } = this.data
    if (!form.username.trim()) { wx.showToast({ title: '用户名不能为空', icon: 'none' }); return }
    if (isNew && !form.password) { wx.showToast({ title: '密码不能为空', icon: 'none' }); return }

    try {
      const res = isNew
        ? await api.post('/super/admins', form)
        : await api.put(`/super/admins/${form.id}`, form)

      if (res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({ showModal: false })
        this.loadData()
      } else {
        wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
      }
    } catch (_) {
      // 网络错误已在 api.js 中 showToast
    }
  },

  onDelete(e) {
    const { id, username } = e.currentTarget.dataset
    wx.showModal({
      title: '确认删除',
      content: `确认删除管理员「${username}」？`,
      confirmColor: '#c0292b',
      success: async (res) => {
        if (!res.confirm) return
        const r = await api.del(`/super/admins/${id}`)
        wx.showToast({ title: r.code === 0 ? '已删除' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        if (r.code === 0) this.loadData()
      },
    })
  },

  async onViewLogs(e) {
    const { id, username } = e.currentTarget.dataset
    const res = await api.get(`/super/admins/${id}/logs`)
    this.setData({
      showLogs: true,
      logs: res.code === 0 ? res.data : [],
      logsAdmin: username,
    })
  },

  roleLabel(role) { return ROLE_LABELS[role] || role },
  noop() {},
})
