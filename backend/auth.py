import functools
import time
import jwt
from flask import request, jsonify, g
from config import JWT_SECRET
from database import get_db


def generate_user_token(member_id, openid):
    """为已绑定党员签发 JWT，有效期 24 小时。"""
    payload = {
        "member_id": member_id,
        "openid": openid,
        "exp": int(time.time()) + 86400,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def require_user(f):
    """要求党员端 JWT 鉴权，成功后将 member_id / openid 写入 g。"""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
        if not token:
            return jsonify({"code": 401, "msg": "未授权，请重新登录"}), 401
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            if "member_id" not in payload:
                raise jwt.InvalidTokenError
            g.member_id = payload["member_id"]
            g.openid = payload["openid"]
        except jwt.ExpiredSignatureError:
            return jsonify({"code": 401, "msg": "登录已过期，请重新登录"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"code": 401, "msg": "Token无效，请重新登录"}), 401
        return f(*args, **kwargs)
    return decorated


def generate_token(admin_id, role, branch_id=None):
    payload = {
        "admin_id": admin_id,
        "role": role,
        "branch_id": branch_id,
        "exp": int(time.time()) + 28800,  # 8小时有效期
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _decode_token():
    """解析请求头中的 Bearer token，失败返回错误响应，成功返回 None。"""
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    if not token:
        return jsonify({"code": 401, "msg": "未授权，请先登录"}), 401
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        g.admin_id = payload["admin_id"]
        g.role = payload["role"]
        g.branch_id = payload.get("branch_id")
        return None
    except jwt.ExpiredSignatureError:
        return jsonify({"code": 401, "msg": "登录已过期，请重新登录"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"code": 401, "msg": "Token无效"}), 401


def require_admin(f):
    """要求登录（super 或 branch 均可）。"""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        err = _decode_token()
        if err:
            return err
        return f(*args, **kwargs)
    return decorated


def require_super(f):
    """仅超级管理员可访问。"""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        err = _decode_token()
        if err:
            return err
        if g.role != "super":
            return jsonify({"code": 403, "msg": "权限不足，需超级管理员"}), 403
        return f(*args, **kwargs)
    return decorated


def log_action(admin_id, action, detail=None, db=None):
    """记录管理员操作日志。
    若传入 db 则复用该连接（不 commit/close），由调用方管理；
    否则自己开连接、commit、close，避免与调用方连接产生写锁冲突。
    """
    _own = db is None
    if _own:
        db = get_db()
    try:
        db.execute(
            "INSERT INTO admin_logs (admin_id, action, detail) VALUES (?, ?, ?)",
            (admin_id, action, detail),
        )
        if _own:
            db.commit()
    finally:
        if _own:
            db.close()
