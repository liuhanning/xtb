"""错题本 SQLite 数据库管理"""
import os
import sqlite3
import time
from typing import Optional
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cuotiben.db")


def _ensure_db_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def get_connection():
    """获取数据库连接，自动提交和关闭"""
    _ensure_db_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """初始化数据库表结构"""
    _ensure_db_dir()
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL DEFAULT 'other',
                knowledgePoint TEXT,
                errorType TEXT,
                question TEXT NOT NULL,
                wrongAnswer TEXT,
                correctAnswer TEXT,
                note TEXT,
                questionImage TEXT,
                mastered INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                lastResult TEXT,
                lastResultAt INTEGER,
                createdAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL DEFAULT 'all',
                correctCount INTEGER NOT NULL DEFAULT 0,
                wrongCount INTEGER NOT NULL DEFAULT 0,
                totalQuestions INTEGER NOT NULL DEFAULT 0,
                coins INTEGER NOT NULL DEFAULT 0,
                turns INTEGER NOT NULL DEFAULT 0,
                accuracy REAL NOT NULL DEFAULT 0,
                playedAt INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
            CREATE INDEX IF NOT EXISTS idx_questions_mastered ON questions(mastered);
            CREATE INDEX IF NOT EXISTS idx_questions_createdAt ON questions(createdAt);
            CREATE INDEX IF NOT EXISTS idx_games_subject ON games(subject);
            CREATE INDEX IF NOT EXISTS idx_games_playedAt ON games(playedAt);
        """)


def _row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


# ==================== QUESTIONS CRUD ====================

def add_question(data: dict) -> int:
    """添加错题，返回新记录的 ID"""
    now = int(time.time() * 1000)
    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO questions
               (subject, knowledgePoint, errorType, question, wrongAnswer, correctAnswer,
                note, questionImage, mastered, attempts, lastResult, lastResultAt, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?, ?)""",
            (
                data.get("subject", "other"),
                data.get("knowledgePoint"),
                data.get("errorType"),
                data["question"],
                data.get("wrongAnswer"),
                data.get("correctAnswer"),
                data.get("note"),
                data.get("questionImage"),
                now,
                now,
            ),
        )
        return cursor.lastrowid


def get_question(question_id: int) -> Optional[dict]:
    """获取单条错题"""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
        return _row_to_dict(row) if row else None


def update_question(question_id: int, data: dict) -> dict:
    """更新错题"""
    existing = get_question(question_id)
    if not existing:
        raise ValueError(f"题目不存在: {question_id}")

    now = int(time.time() * 1000)
    fields = {**existing, **data, "updatedAt": now}

    with get_connection() as conn:
        conn.execute(
            """UPDATE questions SET
               subject=?, knowledgePoint=?, errorType=?, question=?, wrongAnswer=?,
               correctAnswer=?, note=?, questionImage=?, mastered=?, attempts=?,
               lastResult=?, lastResultAt=?, updatedAt=?
               WHERE id=?""",
            (
                fields["subject"],
                fields.get("knowledgePoint"),
                fields.get("errorType"),
                fields["question"],
                fields.get("wrongAnswer"),
                fields.get("correctAnswer"),
                fields.get("note"),
                fields.get("questionImage"),
                fields["mastered"],
                fields.get("attempts", 0),
                fields.get("lastResult"),
                fields.get("lastResultAt"),
                now,
                question_id,
            ),
        )
    return get_question(question_id)


def delete_question(question_id: int) -> bool:
    """删除错题"""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM questions WHERE id = ?", (question_id,))
        return cursor.rowcount > 0


def get_all_questions(subject: str = "all", search: str = "", show_mastered: bool = False) -> list[dict]:
    """查询所有错题（支持过滤）"""
    query = "SELECT * FROM questions WHERE 1=1"
    params: list = []

    if subject != "all":
        query += " AND subject = ?"
        params.append(subject)

    if not show_mastered:
        query += " AND mastered = 0"

    if search:
        query += " AND question LIKE ?"
        params.append(f"%{search}%")

    query += " ORDER BY createdAt DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(r) for r in rows]


def toggle_mastered(question_id: int) -> dict:
    """切换已掌握状态"""
    item = get_question(question_id)
    if not item:
        raise ValueError("题目不存在")
    return update_question(question_id, {"mastered": not item["mastered"]})


def mark_correct(question_id: int) -> dict:
    """标记答对"""
    item = get_question(question_id)
    if not item:
        raise ValueError("题目不存在")
    now = int(time.time() * 1000)
    new_attempts = (item.get("attempts") or 0) + 1
    mastered = item["mastered"] or False
    if item.get("lastResult") == "correct" or new_attempts >= 2:
        mastered = True
    return update_question(question_id, {
        "attempts": new_attempts,
        "lastResult": "correct",
        "lastResultAt": now,
        "mastered": mastered,
    })


def mark_wrong(question_id: int) -> dict:
    """标记答错"""
    item = get_question(question_id)
    if not item:
        raise ValueError("题目不存在")
    now = int(time.time() * 1000)
    new_attempts = (item.get("attempts") or 0) + 1
    return update_question(question_id, {
        "attempts": new_attempts,
        "lastResult": "wrong",
        "lastResultAt": now,
        "mastered": False,
    })


def get_random_questions(count: int, subject: str = "all", show_mastered: bool = False) -> list[dict]:
    """随机获取错题（使用 SQL ORDER BY RANDOM）"""
    query = "SELECT * FROM questions WHERE 1=1"
    params: list = []

    if subject != "all":
        query += " AND subject = ?"
        params.append(subject)

    if not show_mastered:
        query += " AND mastered = 0"

    query += " ORDER BY RANDOM() LIMIT ?"
    params.append(count)

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(r) for r in rows]


# ==================== GAMES CRUD ====================

def save_game_result(data: dict) -> int:
    """保存游戏记录"""
    now = int(time.time() * 1000)
    with get_connection() as conn:
        cursor = conn.execute(
            """INSERT INTO games
               (subject, correctCount, wrongCount, totalQuestions, coins, turns, accuracy, playedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("subject", "all"),
                data.get("correctCount", 0),
                data.get("wrongCount", 0),
                data.get("totalQuestions", 0),
                data.get("coins", 0),
                data.get("turns", 0),
                data.get("accuracy", 0),
                now,
            ),
        )
        return cursor.lastrowid


def get_game_history(limit: int = 20) -> list[dict]:
    """获取游戏历史"""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM games ORDER BY playedAt DESC LIMIT ?", (limit,)
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_game_stats() -> Optional[dict]:
    """获取游戏统计（使用 SQL 聚合函数）"""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT COUNT(*) as total_games,
                      COALESCE(SUM(correctCount), 0) as total_correct,
                      COALESCE(SUM(wrongCount), 0) as total_wrong,
                      COALESCE(SUM(coins), 0) as total_coins
               FROM games"""
        ).fetchone()
        if row["total_games"] == 0:
            return None

        total_games = row["total_games"]
        total_correct = row["total_correct"]
        total_wrong = row["total_wrong"]
        total_coins = row["total_coins"]
        total_answered = total_correct + total_wrong
        avg_accuracy = round((total_correct / total_answered) * 100) if total_answered > 0 else 0

        best_row = conn.execute(
            "SELECT * FROM games ORDER BY accuracy DESC LIMIT 1"
        ).fetchone()
        best_game = _row_to_dict(best_row) if best_row else None

        recent_rows = conn.execute(
            "SELECT * FROM games ORDER BY playedAt DESC LIMIT 10"
        ).fetchall()
        recent_games = [_row_to_dict(r) for r in recent_rows]

    return {
        "totalGames": total_games,
        "totalCorrect": total_correct,
        "totalWrong": total_wrong,
        "totalCoins": total_coins,
        "avgAccuracy": avg_accuracy,
        "bestGame": best_game,
        "recentGames": recent_games,
    }


# 初始化
init_db()
