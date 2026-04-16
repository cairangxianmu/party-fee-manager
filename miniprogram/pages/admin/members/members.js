const app = getApp()
const api = require('../../../utils/api')

const fmt2 = (n) => Number(n || 0).toFixed(2)

const IDENTITY_OPTIONS = ['正式党员', '预备党员']
const PERSON_TYPE_OPTIONS = ['教师', '学生']
const STATUS_OPTIONS = ['active', 'suspended', 'transferred']
const STATUS_LABEL_LIST = ['正常', '停缴', '已转出']
const STATUS_LABELS = { active: '正常', suspended: '停缴', transferred: '已转出' }

Page({
  data: {
    isSuper: false,
    members: [],
    branches: [],
    loading: false,
    saving: false,
    // 筛选
    filterBranchId: '',
    filterStatus: '',
    // 编辑弹窗
    showModal: false,
    isNew: false,
    form: {},
    identityOptions: IDENTITY_OPTIONS,
    personTypeOptions: PERSON_TYPE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    statusLabels: STATUS_LABEL_LIST,
  },

  onLoad() {
    this.setData({ isSuper: app.globalData.role === 'super' })
  },

  onShow() { this.loadData() },

  async loadData() {
    this.setData({ loading: true })
    try {
      const { isSuper, filterBranchId, filterStatus } = this.data
      const url = isSuper ? '/super/members' : '/branch/members'
      const params = {}
      if (isSuper && filterBranchId) params.branch_id = filterBranchId
      if (filterStatus) params.status = filterStatus

      const [mRes, bRes] = await Promise.all([
        api.get(url, params),
        isSuper ? api.get('/super/branches') : Promise.resolve({ code: 0, data: [] }),
      ])
      const members = mRes.code === 0
        ? mRes.data.map(m => ({ ...m, amount_fmt: fmt2(m.amount) }))
        : []
      this.setData({
        members,
        branches: bRes.code === 0 ? bRes.data : [],
      })
    } finally { this.setData({ loading: false }) }
  },

  onAddMember() {
    this.setData({
      showModal: true,
      isNew: true,
      form: { name: '', member_no: '', phone: '', identity: '正式党员', person_type: '', branch_id: '', amount: '', status: 'active', notes: '' },
    })
  },

  onEdit(e) {
    const member = e.currentTarget.dataset.member
    const branch = this.data.branches.find(b => b.id === member.branch_id) || {}
    this.setData({ showModal: true, isNew: false, form: { ...member, branchName: branch.name || '' } })
  },

  onCloseModal() { this.setData({ showModal: false }) },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: e.detail.value })
  },
  onIdentityChange(e) {
    this.setData({ 'form.identity': IDENTITY_OPTIONS[e.detail.value] })
  },
  onPersonTypeChange(e) {
    this.setData({ 'form.person_type': PERSON_TYPE_OPTIONS[e.detail.value] })
  },
  onStatusChange(e) {
    this.setData({ 'form.status': STATUS_OPTIONS[e.detail.value] })
  },
  onBranchChange(e) {
    const branch = this.data.branches[e.detail.value] || {}
    this.setData({ 'form.branch_id': branch.id || '', 'form.branchName': branch.name || '' })
  },

  async onSave() {
    if (this.data.saving) return
    const { form, isNew, isSuper } = this.data
    if (!form.name || !form.member_no || !form.phone || !form.identity) {
      wx.showToast({ title: '请填写必填项', icon: 'none' }); return
    }
    if (!/^\d{11}$/.test(String(form.phone).trim())) {
      wx.showToast({ title: '手机号必须为11位数字', icon: 'none' }); return
    }
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '应缴金额须为正数', icon: 'none' }); return
    }
    if (amount > 100000) {
      wx.showToast({ title: '应缴金额异常（>100000）', icon: 'none' }); return
    }
    // 统一保留2位小数
    form.amount = amount.toFixed(2)
    if (!isSuper) {
      form.branch_id = app.globalData.branchId
    }
    if (!form.branch_id) { wx.showToast({ title: '请选择支部', icon: 'none' }); return }

    const url = isNew
      ? (isSuper ? '/super/members' : '/branch/members')
      : (isSuper ? `/super/members/${form.id}` : `/branch/members/${form.id}`)
    const method = isNew ? api.post : api.put

    this.setData({ saving: true })
    try {
      const res = await method(url, form)
      if (res.code === 0) {
        wx.showToast({ title: isNew ? '新增成功' : '保存成功', icon: 'success' })
        this.setData({ showModal: false })
        this.loadData()
      } else {
        wx.showToast({ title: res.msg, icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    const { isSuper } = this.data
    wx.showModal({
      title: '确认删除',
      content: `确认删除成员「${name}」及其所有缴费记录？`,
      success: async (res) => {
        if (!res.confirm) return
        const url = isSuper ? `/super/members/${id}` : `/branch/members/${id}`
        const r = await api.del(url)
        wx.showToast({ title: r.code === 0 ? '已删除' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        if (r.code === 0) this.loadData()
      },
    })
  },

  onUnbind(e) {
    const { id, name } = e.currentTarget.dataset
    const { isSuper } = this.data
    wx.showModal({
      title: '解除微信绑定',
      content: `确认解绑「${name}」的微信账号？`,
      success: async (res) => {
        if (!res.confirm) return
        const url = isSuper ? `/super/members/${id}/unbind` : `/branch/members/${id}/unbind`
        const r = await api.post(url)
        wx.showToast({ title: r.code === 0 ? '解绑成功' : r.msg, icon: r.code === 0 ? 'success' : 'none' })
        if (r.code === 0) this.loadData()
      },
    })
  },

  statusLabel(s) { return STATUS_LABELS[s] || s },

  noop() {},

  onImport() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx'],
      success: (res) => {
        const file = res.tempFiles[0]
        const role = getApp().globalData.role
        const importPath = role === 'super' ? '/super/members/import' : '/branch/members/import'
        wx.showLoading({ title: '导入中…' })
        wx.uploadFile({
          url: `${getApp().globalData.baseUrl}${importPath}`,
          filePath: file.path,
          name: 'file',
          header: {
            Authorization: `Bearer ${getApp().globalData.token || ''}`,
            'ngrok-skip-browser-warning': 'true',
          },
          success: (uploadRes) => {
            wx.hideLoading()
            try {
              const data = JSON.parse(uploadRes.data)
              if (data.code === 0) {
                const errTip = data.errors && data.errors.length > 0
                  ? `，${data.errors.length} 条失败` : ''
                wx.showToast({ title: data.msg + errTip, icon: 'success' })
                this.loadData()
              } else {
                wx.showToast({ title: data.msg || '导入失败', icon: 'none' })
              }
            } catch (_) {
              wx.showToast({ title: '响应解析失败', icon: 'none' })
            }
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '上传失败', icon: 'none' })
          },
        })
      },
      fail: (err) => {
        if (!err.errMsg.includes('cancel')) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      },
    })
  },

  onDownloadTemplate() {
    const url = `${getApp().globalData.baseUrl}/super/members/template`
    wx.showLoading({ title: '下载中…' })
    wx.downloadFile({
      url,
      header: {
        Authorization: `Bearer ${getApp().globalData.token || ''}`,
        'ngrok-skip-browser-warning': 'true',
      },
      success: (res) => {
        wx.hideLoading()
        if (res.statusCode === 200) {
          wx.openDocument({ filePath: res.tempFilePath, fileType: 'xlsx', showMenu: true })
        } else {
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败，请检查网络', icon: 'none' })
      },
    })
  },
})
