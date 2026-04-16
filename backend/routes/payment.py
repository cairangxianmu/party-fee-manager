import json
import time
import hashlib
import re
from flask import Blueprint, request, jsonify, g
from config import PAY_MODE, APPID, MCHID, SERIAL_NO, APIV3_KEY, NOTIFY_URL, PRIVATE_KEY_PATH
from database import get_db
from auth import require_user

pay_bp = Blueprint("pay", __name__)


def _mark_paid(payment_id, pay_type="mock", transaction_id=None):
    db = get_db()
    db.execute(
        """UPDATE payments
           SET paid=1, pay_type=?, paid_at=datetime('now','localtime'), transaction_id=?
           WHERE id=? AND paid=0""",
        (pay_type, transaction_id, payment_id),
    )
    db.commit()
    db.close()


@pay_bp.route("/pay/create_order", methods=["POST"])
@require_user
def create_order():
    data = request.get_json() or {}
    openid = g.openid
    payment_id = data.get("payment_id")

    if not payment_id:
        return jsonify({"code": 400, "msg": "参数缺失"})

    db = get_db()
    payment = db.execute(
        "SELECT * FROM payments WHERE id=? AND member_id=?", (payment_id, g.member_id)
    ).fetchone()

    if not payment:
        db.close()
        return jsonify({"code": 404, "msg": "缴费记录不存在"})
    if payment["paid"]:
        db.close()
        return jsonify({"code": 400, "msg": "该期款项已缴纳"})

    # ---- Mock 支付模式 ----
    if PAY_MODE == "mock":
        _mark_paid(payment_id, pay_type="mock")
        db.close()
        return jsonify({"code": 0, "msg": "Mock支付成功", "mock": True})

    # ---- 真实微信支付 V3 ----
    try:
        from wechatpayv3 import WeChatPay, WeChatPayType

        with open(PRIVATE_KEY_PATH, "r") as f:
            private_key = f.read()

        wxpay = WeChatPay(
            wechatpay_type=WeChatPayType.MINIPROG,
            mchid=MCHID,
            private_key=private_key,
            cert_serial_no=SERIAL_NO,
            apiv3_key=APIV3_KEY,
            appid=APPID,
            notify_url=NOTIFY_URL,
        )

        period = db.execute(
            "SELECT name FROM periods WHERE id=?", (payment["period_id"],)
        ).fetchone()
        db.close()

        amount_fen = int(round(float(payment["amount"]) * 100))
        out_trade_no = f"DF{payment_id}T{int(time.time())}"

        code, message = wxpay.pay(
            description=f"党费缴纳-{period['name']}",
            out_trade_no=out_trade_no,
            amount={"total": amount_fen, "currency": "CNY"},
            pay_type=WeChatPayType.MINIPROG,
            openid=openid,
        )

        if code != 200:
            return jsonify({"code": 500, "msg": f"创建订单失败: {message}"})

        msg_dict = json.loads(message)
        prepay_id = msg_dict.get("prepay_id")
        timestamp = str(int(time.time()))
        nonce_str = hashlib.md5(f"{timestamp}{prepay_id}".encode()).hexdigest()

        # 构造签名字符串
        sign_str = f"{APPID}\n{timestamp}\n{nonce_str}\nprepay_id={prepay_id}\n"

        import base64
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        priv_key = serialization.load_pem_private_key(private_key.encode(), password=None)
        signature = base64.b64encode(
            priv_key.sign(sign_str.encode(), padding.PKCS1v15(), hashes.SHA256())
        ).decode()

        return jsonify({
            "code": 0,
            "data": {
                "timeStamp": timestamp,
                "nonceStr": nonce_str,
                "package": f"prepay_id={prepay_id}",
                "signType": "RSA",
                "paySign": signature,
                "payment_id": payment_id,
            },
        })

    except Exception:
        return jsonify({"code": 500, "msg": "支付服务异常，请稍后重试"})


@pay_bp.route("/pay/notify", methods=["POST"])
def pay_notify():
    """微信支付异步回调，验签后标记已缴。"""
    if PAY_MODE == "mock":
        return jsonify({"code": "SUCCESS"})

    try:
        from wechatpayv3 import WeChatPay, WeChatPayType

        with open(PRIVATE_KEY_PATH, "r") as f:
            private_key = f.read()

        wxpay = WeChatPay(
            wechatpay_type=WeChatPayType.MINIPROG,
            mchid=MCHID,
            private_key=private_key,
            cert_serial_no=SERIAL_NO,
            apiv3_key=APIV3_KEY,
            appid=APPID,
            notify_url=NOTIFY_URL,
        )

        headers = {
            "Wechatpay-Signature": request.headers.get("Wechatpay-Signature"),
            "Wechatpay-Timestamp": request.headers.get("Wechatpay-Timestamp"),
            "Wechatpay-Nonce": request.headers.get("Wechatpay-Nonce"),
            "Wechatpay-Serial": request.headers.get("Wechatpay-Serial"),
        }
        result = wxpay.callback(headers=headers, body=request.data.decode())

        if result and result.get("event_type") == "TRANSACTION.SUCCESS":
            resource = result.get("resource", {})
            out_trade_no = resource.get("out_trade_no", "")
            transaction_id = resource.get("transaction_id")

            match = re.match(r"DF(\d+)T\d+$", out_trade_no)
            if match:
                payment_id = int(match.group(1))
                db = get_db()
                expected = db.execute(
                    "SELECT amount FROM payments WHERE id=? AND paid=0",
                    (payment_id,),
                ).fetchone()
                paid_amount = resource.get("amount", {}).get("total", 0)
                if expected and int(round(float(expected["amount"]) * 100)) == paid_amount:
                    _mark_paid(payment_id, pay_type="wxpay", transaction_id=transaction_id)
                db.close()

        return jsonify({"code": "SUCCESS"})

    except Exception as e:
        return jsonify({"code": "FAIL", "message": str(e)}), 500
