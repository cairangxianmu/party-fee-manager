import os

# 微信小程序配置（通过环境变量设置，或在此填写你自己的 AppID/AppSecret）
APPID = os.environ.get("APPID", "your_appid_here")
APP_SECRET = os.environ.get("APP_SECRET", "your_appsecret_here")  # 正式环境必须通过环境变量设置

# 微信支付配置
MCHID = os.environ.get("MCHID", "your_mchid_here")
PRIVATE_KEY_PATH = os.environ.get("PRIVATE_KEY_PATH", "apiclient_key.pem")
SERIAL_NO = os.environ.get("SERIAL_NO", "your_serial_no_here")
APIV3_KEY = os.environ.get("APIV3_KEY", "your_apiv3_key_here")
NOTIFY_URL = os.environ.get("NOTIFY_URL", "https://your-domain.com/pay/notify")

# 支付模式：mock（演示）| real（正式）
PAY_MODE = os.environ.get("PAY_MODE", "mock")

# 开发调试：是否允许前端直接传 openid 跳过 wx.login 换取（仅演示/自测用，生产必须关闭）
DEBUG_ALLOW_OPENID = os.environ.get("DEBUG_ALLOW_OPENID", "0") == "1"

# JWT 密钥（正式环境务必替换）
JWT_SECRET = os.environ.get("JWT_SECRET", "change_this_secret_key_in_production")

# 数据库路径：使用绝对路径，避免从不同目录运行时产生多个数据库文件
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(_BASE_DIR, "dangfei.db"))
