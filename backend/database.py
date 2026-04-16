import sqlite3
from config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode=WAL")   # 允许并发读写，避免 database is locked
    conn.execute("PRAGMA busy_timeout=5000")  # 锁等待最多 5 秒再报错
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS branches (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            leader     TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS admins (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT NOT NULL UNIQUE,
            password   TEXT NOT NULL,
            role       TEXT NOT NULL CHECK(role IN ('super','branch')),
            branch_id  INTEGER,
            is_active  INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );

        CREATE TABLE IF NOT EXISTS members (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            member_no   TEXT NOT NULL UNIQUE,
            phone       TEXT NOT NULL UNIQUE,
            identity    TEXT NOT NULL,
            person_type TEXT NOT NULL DEFAULT '',
            branch_id   INTEGER NOT NULL,
            amount      REAL NOT NULL DEFAULT 0,
            status      TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','transferred')),
            openid      TEXT UNIQUE,
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );

        CREATE TABLE IF NOT EXISTS periods (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS payments (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id      INTEGER NOT NULL,
            period_id      INTEGER NOT NULL,
            amount         REAL NOT NULL,
            paid           INTEGER DEFAULT 0,
            pay_type       TEXT,
            paid_at        TEXT,
            transaction_id TEXT,
            UNIQUE(member_id, period_id),
            FOREIGN KEY(member_id) REFERENCES members(id),
            FOREIGN KEY(period_id) REFERENCES periods(id)
        );

        CREATE TABLE IF NOT EXISTS admin_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id   INTEGER NOT NULL,
            action     TEXT NOT NULL,
            detail     TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(admin_id) REFERENCES admins(id)
        );

        CREATE TABLE IF NOT EXISTS phone_change_requests (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id     INTEGER NOT NULL,
            old_phone     TEXT NOT NULL,
            new_phone     TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','approved','rejected')),
            reject_reason TEXT,
            reviewed_by   INTEGER,
            reviewed_at   TEXT,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(member_id)   REFERENCES members(id),
            FOREIGN KEY(reviewed_by) REFERENCES admins(id)
        );

        CREATE TABLE IF NOT EXISTS member_change_requests (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id     INTEGER NOT NULL,
            changes       TEXT NOT NULL,
            note          TEXT NOT NULL DEFAULT '',
            status        TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','approved','rejected')),
            reject_reason TEXT,
            reviewed_by   INTEGER,
            reviewed_at   TEXT,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY(member_id)   REFERENCES members(id),
            FOREIGN KEY(reviewed_by) REFERENCES admins(id)
        );
    """)

    # 若无超级管理员则插入默认账号
    import bcrypt
    count = conn.execute("SELECT COUNT(*) FROM admins WHERE role='super'").fetchone()[0]
    if count == 0:
        hashed = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
        conn.execute(
            "INSERT INTO admins (username, password, role) VALUES (?, ?, ?)",
            ("admin", hashed, "super"),
        )

    conn.commit()

    # 迁移：为旧数据库补充 person_type 字段
    try:
        conn.execute("ALTER TABLE members ADD COLUMN person_type TEXT NOT NULL DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # 字段已存在则忽略

    # 迁移：为 branches.name 添加 UNIQUE 约束（SQLite 不支持 ALTER ADD UNIQUE，用重建表方式）
    try:
        indexes = [r[1] for r in conn.execute("PRAGMA index_list(branches)").fetchall()]
        if "uq_branches_name" not in indexes:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS branches_new (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    name       TEXT NOT NULL UNIQUE,
                    leader     TEXT,
                    created_at TEXT DEFAULT (datetime('now','localtime'))
                );
                INSERT OR IGNORE INTO branches_new SELECT * FROM branches;
                DROP TABLE branches;
                ALTER TABLE branches_new RENAME TO branches;
            """)
            conn.commit()
    except Exception:
        pass

    # 性能索引（已存在时忽略）
    try:
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_payments_period  ON payments(period_id);
            CREATE INDEX IF NOT EXISTS idx_payments_member  ON payments(member_id);
            CREATE INDEX IF NOT EXISTS idx_members_branch   ON members(branch_id);
            CREATE INDEX IF NOT EXISTS idx_members_status   ON members(status);
        """)
        conn.commit()
    except Exception:
        pass

    conn.close()
