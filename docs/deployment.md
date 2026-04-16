# 部署指南

## 目录

- [环境要求](#环境要求)
- [一、后端部署](#一后端部署)
- [二、微信小程序配置](#二微信小程序配置)
- [三、真机调试（内网穿透）](#三真机调试内网穿透)
- [四、演示数据](#四演示数据)
- [五、正式上线](#五正式上线)

---

## 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Python | 3.10+ | 后端运行环境 |
| pip | 任意 | 依赖安装 |
| 微信开发者工具 | 最新稳定版 | 小程序调试/预览 |
| ngrok | 任意 | 真机调试内网穿透（可选） |
| 微信公众平台账号 | — | 获取 AppID / AppSecret |

---

## 一、后端部署

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置凭证

打开 `backend/config.py`，填入你的微信小程序 AppID 和 AppSecret：

```python
APPID = os.environ.get("APPID", "你的AppID")
APP_SECRET = os.environ.get("APP_SECRET", "你的AppSecret")
```

> **推荐做法**：通过环境变量注入，避免凭证写入代码：
> ```bash
> export APPID=wxxxxxxxxxxx
> export APP_SECRET=xxxxxxxxxxxxxxxx
> python app.py
> ```

### 3. 初始化数据库

```bash
cd backend
python -c "from database import init_db; init_db()"
```

执行后会在 `backend/` 目录生成 `dangfei.db`（已在 `.gitignore` 中排除）。

### 4. 写入演示数据（可选）

```bash
python seed_demo.py
```

写入后可用以下账号登录：

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | 超级管理员（全院） |
| branch01 | branch123 | 支部管理员（第一支部） |

> **注意**：此脚本会清空现有数据，仅在全新环境或演示环境下运行。

### 5. 启动后端

```bash
cd backend
python app.py
```

默认监听 `0.0.0.0:5000`，本地访问地址为 `http://localhost:5000`。

---

## 二、微信小程序配置

### 1. 获取 AppID

登录 [微信公众平台](https://mp.weixin.qq.com) → 开发管理 → 开发设置，获取 **AppID** 和 **AppSecret**。

### 2. 填写 AppID

打开 `miniprogram/project.config.json`，将 `appid` 改为你的 AppID：

```json
{
  "appid": "你的AppID"
}
```

### 3. 配置后端地址

打开 `miniprogram/app.js`，根据调试方式选择：

```javascript
// 本地调试（开发者工具模拟器）
baseUrl: 'http://localhost:5000',

// 真机调试（需配合 ngrok，见下一节）
// baseUrl: 'https://你的ngrok地址',
```

### 4. 在微信开发者工具中打开

1. 打开微信开发者工具
2. 选择「小程序」→「导入项目」
3. 目录选择 `miniprogram/`，填入 AppID
4. 点击「编译」（Ctrl+B）

> **开发者工具设置**：详情 → 本地设置 → 勾选「不校验合法域名」，否则 localhost 请求会被拦截。

---

## 三、真机调试（内网穿透）

微信真机预览要求后端必须使用 **HTTPS 域名**，本地开发可用 ngrok 实现内网穿透。

### 1. 安装 ngrok

前往 [ngrok.com](https://ngrok.com) 注册并下载，按官网指引完成 authtoken 配置。

### 2. 启动隧道

确保后端已在 5000 端口运行，然后：

```bash
ngrok http 5000
```

ngrok 会输出类似以下地址：

```
Forwarding  https://xxxx-xxxx.ngrok-free.app -> http://localhost:5000
```

### 3. 更新小程序配置

将 `miniprogram/app.js` 的 `baseUrl` 改为 ngrok 提供的 HTTPS 地址：

```javascript
baseUrl: 'https://xxxx-xxxx.ngrok-free.app',
```

在微信开发者工具点击「编译」，然后点击「预览」扫码在真机上测试。

> **注意**：ngrok 免费版每次重启地址会变化，`api.js` 已添加 `ngrok-skip-browser-warning` 请求头以绕过 ngrok 的浏览器警告页。

---

## 四、演示数据

运行 `seed_demo.py` 后，数据库包含：

- **2 个支部**：第一党支部、第二党支部
- **5 名在册党员**（张三、李四、王五等匿名示例）
- **1 名已转出党员**
- **2 个缴费期次**（2024 年第一、二季度），部分已缴 / 部分未缴

党员端功能需要微信 OpenID，在**开发者工具模拟器**中无法自动获取真实 OpenID。如需测试党员端，有两种方式：

**方式 A（推荐，真机）**：使用 ngrok 内网穿透 + 微信真机扫码预览，正常走 `wx.login` 流程获取 OpenID，然后绑定任一演示党员的手机号。

**方式 B（仅开发调试）**：在 `backend/config.py` 开启调试模式：
```python
DEBUG_ALLOW_OPENID = os.environ.get("DEBUG_ALLOW_OPENID", "1") == "1"
```
然后前端可直接传 `openid` 字段跳过微信鉴权。**生产环境必须关闭（设为 "0"）。**

---

## 五、正式上线

> 以下为上线时需要额外处理的事项，日常演示/开发无需关注。

### 微信支付

`config.py` 中 `PAY_MODE` 默认为 `mock`（模拟支付）。若需真实微信支付：

1. 开通微信商户号，获取 `MCHID`、`APIV3_KEY`、商户 API 证书 `apiclient_key.pem` 和 `SERIAL_NO`
2. 在 `config.py` 或环境变量中填写上述信息，并将 `PAY_MODE` 改为 `real`
3. 配置支付回调地址 `NOTIFY_URL`（需为公网 HTTPS 地址）

### JWT 密钥

将 `JWT_SECRET` 替换为足够随机的字符串：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 部署方式建议

- 后端：使用 `gunicorn` + `nginx` 反向代理，或部署到云服务器 / 容器
- 数据库：SQLite 适合中小规模（数百党员），如需高并发可迁移到 PostgreSQL
- HTTPS：配置 SSL 证书（Let's Encrypt 免费），微信小程序正式版强制要求 HTTPS
