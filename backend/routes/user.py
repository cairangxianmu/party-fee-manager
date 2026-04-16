import json as _json
import requests as http_req
from flask import Blueprint, request, jsonify, g
from config import APPID, APP_SECRET, DEBUG_ALLOW_OPENID
from database import get_db
from auth import generate_user_token, require_user

user_bp = Blueprint("user", __name__)


def get_openid_from_code(code):
    """通过 wx.login 的 code 向微信换取 openid。"""
    resp = http_req.get(
        "https://api.weixin.qq.com/sns/jscode2session",
        params={
            "appid": APPID,
            "secret": APP_SECRET,
            "js_code": code,
            "grant_type": "authorization_code",
        },
        timeout=5,
    )
    data = resp.json()
    return data.get("openid"), data.get("errcode"), data.get("errmsg")


@user_bp.route("/user/login", methods=["POST"])
def user_login():
    """
    前端通过 wx.login 得到 code 后调用此接口换取 openid。
    开发测试阶段可直接传 openid 字段跳过微信换取。
    """
    data = request.get_json() or {}
    code = data.get("code", "").strip()
    supplied_openid = data.get("openid", "").strip()

    openid = None
    if code:
        openid, errcode, errmsg = get_openid_from_code(code)
        if not openid:
            # code 换取失败：仅在 DEBUG 模式下允许前端直接传 openid 作为兜底
            if DEBUG_ALLOW_OPENID and supplied_openid:
                openid = supplied_openid
            else:
                return jsonify({"code": 500, "msg": f"获取openid失败：{errmsg}（errcode={errcode}）"})
    elif DEBUG_ALLOW_OPENID and supplied_openid:
        openid = supplied_openid

    if not openid:
        return jsonify({"code": 400, "msg": "缺少 code 参数"})

    db = get_db()
    member = db.execute(
        "SELECT id, name, status FROM members WHERE openid=?", (openid,)
    ).fetchone()
    db.close()

    bound = member is not None
    resp = {
        "code": 0,
        "data": {
            "openid": openid,
            "bound": bound,
            "member_name": member["name"] if member else None,
            "member_status": member["status"] if member else None,
        },
    }
    if bound:
        resp["data"]["user_token"] = generate_user_token(member["id"], openid)
    return jsonify(resp)


@user_bp.route("/user/bind", methods=["POST"])
def bind():
    """党员首次绑定身份：openid + 工号/学号 + 手机号。"""
    data = request.get_json() or {}
    openid = data.get("openid", "").strip()
    member_no = data.get("member_no", "").strip()
    phone = data.get("phone", "").strip()

    if not openid:
        return jsonify({"code": 400, "msg": "缺少 openid"})
    if not member_no:
        return jsonify({"code": 400, "msg": "请提供工号/学号"})
    if not phone:
        return jsonify({"code": 400, "msg": "请提供手机号"})

    db = get_db()

    # 检查该 openid 是否已绑定
    if db.execute("SELECT id FROM members WHERE openid=?", (openid,)).fetchone():
        db.close()
        return jsonify({"code": 400, "msg": "该微信已绑定成员，如需换绑请联系管理员"})

    # 用工号/学号精确匹配成员
    member = db.execute(
        "SELECT * FROM members WHERE member_no=?", (member_no,)
    ).fetchone()

    if not member:
        db.close()
        return jsonify({"code": 404, "msg": "未找到匹配成员，请检查工号/学号"})

    # 手机号二次验证
    if member["phone"] and phone != member["phone"]:
        db.close()
        return jsonify({"code": 403, "msg": "手机号与记录不匹配，请联系支部管理员"})

    if member["openid"]:
        db.close()
        return jsonify({"code": 400, "msg": "该成员已绑定其他微信，如需换绑请联系管理员"})

    if member["status"] != "active":
        db.close()
        return jsonify({"code": 403, "msg": "该成员状态异常，请联系管理员"})

    db.execute("UPDATE members SET openid=? WHERE id=?", (openid, member["id"]))
    db.commit()
    db.close()

    user_token = generate_user_token(member["id"], openid)
    return jsonify({"code": 0, "msg": "绑定成功", "data": {"name": member["name"], "user_token": user_token}})


@user_bp.route("/user/unbind", methods=["POST"])
def unbind():
    """解绑（由管理员后台调用，传入 member_id）。"""
    # 此接口通过管理员 Token 鉴权，在 super_admin 路由中实现了 /super/members/<id>/unbind
    return jsonify({"code": 400, "msg": "请通过管理后台解绑"})


@user_bp.route("/user/records", methods=["GET"])
@require_user
def records():
    """我的缴费记录（所有期数）。"""
    db = get_db()
    member = db.execute(
        "SELECT id, name FROM members WHERE id=?", (g.member_id,)
    ).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    rows = db.execute(
        """SELECT p.id, pe.name AS period_name, p.amount, p.paid, p.pay_type, p.paid_at
           FROM payments p
           JOIN periods pe ON p.period_id = pe.id
           WHERE p.member_id=?
           ORDER BY pe.id DESC""",
        (member["id"],),
    ).fetchall()
    db.close()

    return jsonify({
        "code": 0,
        "data": {
            "member_name": member["name"],
            "records": [dict(r) for r in rows],
        },
    })


@user_bp.route("/user/change_phone", methods=["POST"])
@require_user
def change_phone():
    """党员提交换绑手机号申请，需管理员审核后才真正生效。"""
    data = request.get_json() or {}
    new_phone = data.get("phone", "").strip()
    if not new_phone or len(new_phone) != 11 or not new_phone.isdigit():
        return jsonify({"code": 400, "msg": "请输入正确的11位手机号"})

    db = get_db()
    member = db.execute(
        "SELECT id, phone FROM members WHERE id=?", (g.member_id,)
    ).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    if new_phone == member["phone"]:
        db.close()
        return jsonify({"code": 400, "msg": "新手机号与当前手机号相同"})

    # 已被其他成员占用则直接拒绝（审核时会再查一次以防并发）
    occupied = db.execute(
        "SELECT id FROM members WHERE phone=? AND id!=?", (new_phone, member["id"])
    ).fetchone()
    if occupied:
        db.close()
        return jsonify({"code": 400, "msg": "该手机号已被其他成员使用"})

    # 禁止存在 pending 申请时重复提交
    pending = db.execute(
        "SELECT id FROM phone_change_requests WHERE member_id=? AND status='pending'",
        (member["id"],),
    ).fetchone()
    if pending:
        db.close()
        return jsonify({"code": 400, "msg": "已有待审核的换绑申请，请等待管理员处理"})

    db.execute(
        """INSERT INTO phone_change_requests (member_id, old_phone, new_phone)
           VALUES (?, ?, ?)""",
        (member["id"], member["phone"] or "", new_phone),
    )
    db.commit()
    db.close()
    return jsonify({"code": 0, "msg": "换绑申请已提交，请等待支部管理员审核"})


@user_bp.route("/user/phone_request", methods=["GET"])
@require_user
def phone_request_status():
    """党员查询自己最近一次换绑申请的状态。"""
    db = get_db()
    member = db.execute("SELECT id FROM members WHERE id=?", (g.member_id,)).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    row = db.execute(
        """SELECT id, old_phone, new_phone, status, reject_reason, created_at, reviewed_at
           FROM phone_change_requests
           WHERE member_id=?
           ORDER BY id DESC LIMIT 1""",
        (member["id"],),
    ).fetchone()
    db.close()

    return jsonify({"code": 0, "data": dict(row) if row else None})


@user_bp.route("/user/profile", methods=["GET"])
@require_user
def profile():
    """获取党员当前个人信息及可选支部列表（用于修改信息表单预填）。"""
    db = get_db()
    member = db.execute(
        """SELECT m.id, m.name, m.phone, m.identity, m.branch_id, m.amount,
                  b.name AS branch_name
           FROM members m LEFT JOIN branches b ON m.branch_id = b.id
           WHERE m.id=?""",
        (g.member_id,),
    ).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    branches = db.execute("SELECT id, name FROM branches ORDER BY id").fetchall()
    db.close()

    return jsonify({
        "code": 0,
        "data": {
            "name": member["name"],
            "phone": member["phone"],
            "identity": member["identity"],
            "branch_id": member["branch_id"],
            "branch_name": member["branch_name"],
            "amount": member["amount"],
            "branches": [dict(b) for b in branches],
        },
    })


@user_bp.route("/user/change_info", methods=["POST"])
@require_user
def change_info():
    """党员提交个人信息修改申请（手机号、党员身份、所在支部、应缴金额），需附修改说明。"""
    data = request.get_json() or {}
    note = data.get("note", "").strip()
    if not note:
        return jsonify({"code": 400, "msg": "请填写修改说明"})

    db = get_db()
    member = db.execute("SELECT * FROM members WHERE id=?", (g.member_id,)).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    if member["status"] != "active":
        db.close()
        return jsonify({"code": 403, "msg": "该成员状态异常，请联系管理员"})

    # 禁止重复提交
    pending = db.execute(
        "SELECT id FROM member_change_requests WHERE member_id=? AND status='pending'",
        (member["id"],),
    ).fetchone()
    if pending:
        db.close()
        return jsonify({"code": 400, "msg": "已有待审核的修改申请，请等待管理员处理"})

    changes = {}

    # 手机号
    new_phone = data.get("phone", "").strip()
    if new_phone:
        if not new_phone.isdigit() or len(new_phone) != 11:
            db.close()
            return jsonify({"code": 400, "msg": "手机号必须为11位数字"})
        if new_phone != member["phone"]:
            conflict = db.execute(
                "SELECT id FROM members WHERE phone=? AND id!=?", (new_phone, member["id"])
            ).fetchone()
            if conflict:
                db.close()
                return jsonify({"code": 400, "msg": "该手机号已被其他成员使用"})
            changes["phone"] = {"old": member["phone"], "new": new_phone}

    # 党员身份
    new_identity = data.get("identity", "").strip()
    if new_identity and new_identity != member["identity"]:
        changes["identity"] = {"old": member["identity"], "new": new_identity}

    # 所在支部
    new_branch_id = data.get("branch_id")
    if new_branch_id is not None:
        try:
            new_branch_id = int(new_branch_id)
        except (TypeError, ValueError):
            db.close()
            return jsonify({"code": 400, "msg": "支部参数格式错误"})
        if new_branch_id != member["branch_id"]:
            old_branch = db.execute(
                "SELECT name FROM branches WHERE id=?", (member["branch_id"],)
            ).fetchone()
            new_branch = db.execute(
                "SELECT name FROM branches WHERE id=?", (new_branch_id,)
            ).fetchone()
            if not new_branch:
                db.close()
                return jsonify({"code": 400, "msg": "所选支部不存在"})
            changes["branch_id"] = {
                "old": member["branch_id"],
                "new": new_branch_id,
                "old_name": old_branch["name"] if old_branch else str(member["branch_id"]),
                "new_name": new_branch["name"],
            }

    # 应缴金额
    new_amount = data.get("amount")
    if new_amount is not None and str(new_amount).strip() != "":
        try:
            new_amount = round(float(new_amount), 2)
        except (TypeError, ValueError):
            db.close()
            return jsonify({"code": 400, "msg": "应缴金额格式错误"})
        if new_amount <= 0:
            db.close()
            return jsonify({"code": 400, "msg": "应缴金额须为正数"})
        if abs(new_amount - member["amount"]) > 0.001:
            changes["amount"] = {"old": member["amount"], "new": new_amount}

    if not changes:
        db.close()
        return jsonify({"code": 400, "msg": "未检测到任何信息变更，请至少修改一项"})

    db.execute(
        "INSERT INTO member_change_requests (member_id, changes, note) VALUES (?, ?, ?)",
        (member["id"], _json.dumps(changes, ensure_ascii=False), note),
    )
    db.commit()
    db.close()
    return jsonify({"code": 0, "msg": "修改申请已提交，请等待管理员审核"})


@user_bp.route("/user/info_request", methods=["GET"])
@require_user
def info_request_status():
    """党员查询最近一次信息修改申请的状态。"""
    db = get_db()
    member = db.execute("SELECT id FROM members WHERE id=?", (g.member_id,)).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    row = db.execute(
        """SELECT id, changes, note, status, reject_reason, created_at, reviewed_at
           FROM member_change_requests
           WHERE member_id=?
           ORDER BY id DESC LIMIT 1""",
        (member["id"],),
    ).fetchone()
    db.close()

    if row:
        r = dict(row)
        try:
            r["changes"] = _json.loads(r["changes"])
        except Exception:
            r["changes"] = {}
        return jsonify({"code": 0, "data": r})
    return jsonify({"code": 0, "data": None})


@user_bp.route("/user/unpaid", methods=["GET"])
@require_user
def unpaid():
    """当前未缴期数列表。"""
    db = get_db()
    member = db.execute(
        "SELECT * FROM members WHERE id=?", (g.member_id,)
    ).fetchone()
    if not member:
        db.close()
        return jsonify({"code": 403, "msg": "成员信息不存在，请联系管理员"})

    rows = db.execute(
        """SELECT p.id AS payment_id, pe.name AS period_name, p.amount
           FROM payments p
           JOIN periods pe ON p.period_id = pe.id
           WHERE p.member_id=? AND p.paid=0
           ORDER BY pe.id DESC""",
        (member["id"],),
    ).fetchall()
    db.close()

    return jsonify({
        "code": 0,
        "data": {
            "member_name": member["name"],
            "items": [dict(r) for r in rows],
        },
    })
