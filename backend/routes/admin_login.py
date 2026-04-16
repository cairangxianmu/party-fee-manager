import bcrypt
from flask import Blueprint, request, jsonify
from database import get_db
from auth import generate_token
from extensions import limiter

login_bp = Blueprint("login", __name__)


@login_bp.route("/admin/login", methods=["POST"])
@limiter.limit("5/minute;30/hour")
def admin_login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"code": 400, "msg": "用户名和密码不能为空"})

    db = get_db()
    admin = db.execute(
        """SELECT a.*, b.name AS branch_name
           FROM admins a LEFT JOIN branches b ON a.branch_id = b.id
           WHERE a.username=?""",
        (username,),
    ).fetchone()
    db.close()

    if not admin:
        return jsonify({"code": 401, "msg": "用户名或密码错误"})

    if not admin["is_active"]:
        return jsonify({"code": 403, "msg": "账号已被禁用，请联系超级管理员"})

    if not bcrypt.checkpw(password.encode(), admin["password"].encode()):
        return jsonify({"code": 401, "msg": "用户名或密码错误"})

    token = generate_token(admin["id"], admin["role"], admin["branch_id"])

    return jsonify({
        "code": 0,
        "msg": "登录成功",
        "data": {
            "token": token,
            "role": admin["role"],
            "branch_id": admin["branch_id"],
            "branch_name": admin["branch_name"] or "",
            "username": admin["username"],
        },
    })
