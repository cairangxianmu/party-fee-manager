from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# 使用内存存储，单实例部署无需 Redis
# 通过 limiter.init_app(app) 与 Flask 应用绑定，避免循环导入
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["500/day"],
    storage_uri="memory://",
)
