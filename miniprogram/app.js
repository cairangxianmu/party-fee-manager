App({
	globalData: {
		// 开发者工具本地测试用 localhost；真机演示时换成 ngrok HTTPS 地址
		baseUrl: 'http://localhost:5000',
		// baseUrl: "https://napkin-spoken-flock.ngrok-free.dev",
		token: "",
		role: "", // 'super' | 'branch'
		branchId: null,
		branchName: "",
		username: "",
		openid: "",
		userToken: "", // 党员端 JWT
		memberBound: false,
		memberName: "",
		_autoRedirect: true, // 仅冷启动时自动跳转一次，用户主动返回首页后不再触发
	},

	onLaunch() {
		const keys = [
			"token",
			"role",
			"branchId",
			"branchName",
			"username",
			"openid",
			"userToken",
			"memberBound",
			"memberName",
		];
		this._ready = new Promise((resolve) => {
			let remaining = keys.length;
			const done = () => {
				if (--remaining === 0) resolve();
			};
			keys.forEach((key) => {
				wx.getStorage({
					key,
					success: (res) => {
						this.globalData[key] = res.data;
						done();
					},
					fail: () => done(),
				});
			});
		});
	},

	waitReady() {
		return this._ready || Promise.resolve();
	},

	// 管理员退出登录
	adminLogout() {
		this.globalData.token = "";
		this.globalData.role = "";
		this.globalData.branchId = null;
		this.globalData.branchName = "";
		this.globalData.username = "";
		wx.removeStorageSync("token");
		wx.removeStorageSync("role");
		wx.removeStorageSync("branchId");
		wx.removeStorageSync("branchName");
		wx.removeStorageSync("username");
		wx.reLaunch({ url: "/pages/index/index" });
	},
});
