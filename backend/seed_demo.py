"""
演示数据初始化脚本
运行前请先确保数据库已通过 init_db() 创建好表结构。
用法：
    cd backend
    python seed_demo.py
注意：此脚本会清空现有数据后写入匿名示例数据，仅用于演示/开发。
"""

import sqlite3
import bcrypt
from config import DB_PATH


def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    # ── 清空现有数据（按外键依赖倒序） ──────────────────────────────
    conn.executescript("""
        DELETE FROM member_change_requests;
        DELETE FROM phone_change_requests;
        DELETE FROM admin_logs;
        DELETE FROM payments;
        DELETE FROM members;
        DELETE FROM periods;
        DELETE FROM admins;
        DELETE FROM branches;
    """)

    # ── 支部 ────────────────────────────────────────────────────────
    conn.executemany(
        "INSERT INTO branches (id, name, leader) VALUES (?, ?, ?)",
        [
            (1, "第一党支部", "张三"),
            (2, "第二党支部", "李四"),
        ],
    )

    # ── 管理员 ───────────────────────────────────────────────────────
    pw_admin = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
    pw_branch = bcrypt.hashpw(b"branch123", bcrypt.gensalt()).decode()
    conn.executemany(
        "INSERT INTO admins (id, username, password, role, branch_id) VALUES (?, ?, ?, ?, ?)",
        [
            (1, "admin",    pw_admin,  "super",  None),
            (2, "branch01", pw_branch, "branch", 1),
        ],
    )

    # ── 党员（姓名使用常见示例名，手机号为虚构号段 131xxxxxxxx） ───────
    members = [
        (1, "张三",   "D20240001", "13100000001", "正式党员", "教师", 1, 3.0,  "active"),
        (2, "李四",   "D20240002", "13100000002", "正式党员", "教师", 1, 3.0,  "active"),
        (3, "王五",   "D20240003", "13100000003", "正式党员", "教师", 1, 5.0,  "active"),
        (4, "赵六",   "D20240004", "13100000004", "正式党员", "教师", 2, 3.0,  "active"),
        (5, "孙七",   "D20240005", "13100000005", "预备党员", "学生", 2, 1.0,  "active"),
        (6, "周八",   "D20230006", "13100000006", "正式党员", "教师", 2, 3.0,  "transferred"),
    ]
    conn.executemany(
        "INSERT INTO members (id, name, member_no, phone, identity, person_type, branch_id, amount, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        members,
    )

    # ── 缴费期次 ─────────────────────────────────────────────────────
    conn.executemany(
        "INSERT INTO periods (id, name) VALUES (?, ?)",
        [
            (1, "2024年第一季度"),
            (2, "2024年第二季度"),
        ],
    )

    # ── 缴费记录（部分已缴，部分未缴） ──────────────────────────────
    payments = [
        # (member_id, period_id, amount, paid, pay_type, paid_at)
        (1, 1, 3.0, 1, "wechat", "2024-01-15 10:00:00"),
        (2, 1, 3.0, 1, "wechat", "2024-01-16 09:30:00"),
        (3, 1, 5.0, 1, "wechat", "2024-01-20 14:00:00"),
        (4, 1, 3.0, 1, "wechat", "2024-01-18 11:00:00"),
        (5, 1, 1.0, 0, None,     None),                   # 未缴
        (1, 2, 3.0, 1, "wechat", "2024-04-10 10:00:00"),
        (2, 2, 3.0, 0, None,     None),                   # 未缴
        (3, 2, 5.0, 0, None,     None),                   # 未缴
    ]
    conn.executemany(
        "INSERT INTO payments (member_id, period_id, amount, paid, pay_type, paid_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        payments,
    )

    conn.commit()
    conn.close()
    print("演示数据写入完成。")
    print("  超级管理员：admin / admin123")
    print("  支部管理员：branch01 / branch123")


if __name__ == "__main__":
    seed()
