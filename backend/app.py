import os
from flask import Flask
from flask_cors import CORS
from database import init_db
from extensions import limiter
from routes.admin_login import login_bp
from routes.super_admin import super_bp
from routes.branch_admin import branch_bp
from routes.user import user_bp
from routes.payment import pay_bp

app = Flask(__name__)
CORS(app)
limiter.init_app(app)

app.register_blueprint(login_bp)
app.register_blueprint(super_bp)
app.register_blueprint(branch_bp)
app.register_blueprint(user_bp)
app.register_blueprint(pay_bp)


init_db()

if __name__ == "__main__":
    _debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=_debug)
