"""错题本后端 - FastAPI 静态服务 + DashScope API 代理 + REST API"""
import os
import time
import threading
import requests as requests_lib
from collections import defaultdict
from fastapi import FastAPI, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from backend.db_sqlite import (
    add_question,
    get_question,
    update_question,
    delete_question,
    get_all_questions,
    toggle_mastered,
    mark_correct,
    mark_wrong,
    get_random_questions,
    save_game_result,
    get_game_history,
    get_game_stats,
)

app = FastAPI(title="错题本")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

# ==================== INPUT VALIDATION ====================

MAX_QUESTION_LEN = 5000
MAX_TEXT_LEN = 500
VALID_SUBJECTS = {"math", "chinese", "english", "other"}
VALID_ERROR_TYPES = {"calculation", "concept", "careless", "understand", "knowledge", "other"}


def _validate_question_body(body: dict) -> None:
    """验证 POST/PUT 请求体"""
    if not isinstance(body, dict):
        raise ValueError("请求体必须是 JSON 对象")
    if not body.get("question") or not isinstance(body["question"], str):
        raise ValueError("题目内容不能为空")
    if len(body["question"]) > MAX_QUESTION_LEN:
        raise ValueError(f"题目内容过长（最大 {MAX_QUESTION_LEN} 字符）")
    subject = body.get("subject", "other")
    if subject not in VALID_SUBJECTS:
        raise ValueError(f"无效的科目: {subject}")
    error_type = body.get("errorType")
    if error_type and error_type not in VALID_ERROR_TYPES:
        raise ValueError(f"无效的错误类型: {error_type}")
    # Sanitize string fields
    for field in ["knowledgePoint", "wrongAnswer", "correctAnswer", "note"]:
        val = body.get(field)
        if val is not None and not isinstance(val, str):
            body[field] = str(val)
        if val and isinstance(val, str) and len(val) > MAX_TEXT_LEN:
            body[field] = val[:MAX_TEXT_LEN]


# ==================== RATE LIMITING ====================

class RateLimiter:
    """简单内存速率限制：每分钟最多 N 次请求"""
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        # Clean old entries
        self._requests[client_ip] = [
            ts for ts in self._requests[client_ip] if ts > window_start
        ]
        if len(self._requests[client_ip]) >= self.max_requests:
            return False
        self._requests[client_ip].append(now)
        return True

proxy_limiter = RateLimiter(max_requests=30, window_seconds=60)


def _get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# ==================== QUESTIONS API ====================

@app.get("/api/questions")
async def api_list_questions(
    subject: str = Query("all"),
    search: str = Query(""),
    showMastered: bool = Query(False),
):
    return get_all_questions(subject=subject, search=search, show_mastered=showMastered)


@app.get("/api/questions/{question_id}")
async def api_get_question(question_id: int):
    item = get_question(question_id)
    if not item:
        return JSONResponse(status_code=404, content={"error": "题目不存在"})
    return item


@app.post("/api/questions")
async def api_create_question(request: Request):
    body = await request.json()
    try:
        _validate_question_body(body)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    qid = add_question(body)
    return {"id": qid}


@app.put("/api/questions/{question_id}")
async def api_update_question(question_id: int, request: Request):
    body = await request.json()
    try:
        _validate_question_body(body)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    try:
        updated = update_question(question_id, body)
        return updated
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.delete("/api/questions/{question_id}")
async def api_delete_question(question_id: int):
    if not delete_question(question_id):
        return JSONResponse(status_code=404, content={"error": "题目不存在"})
    return {"ok": True}


@app.patch("/api/questions/{question_id}/toggle-mastered")
async def api_toggle_mastered(question_id: int):
    try:
        return toggle_mastered(question_id)
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/api/questions/{question_id}/mark-correct")
async def api_mark_correct(question_id: int):
    try:
        return mark_correct(question_id)
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.patch("/api/questions/{question_id}/mark-wrong")
async def api_mark_wrong(question_id: int):
    try:
        return mark_wrong(question_id)
    except ValueError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})


@app.get("/api/questions/{question_id}/random")
async def api_random_questions(question_id: int, count: int = Query(10), subject: str = Query("all")):
    return get_random_questions(count, subject=subject)


# ==================== GAMES API ====================

@app.post("/api/games")
async def api_save_game(request: Request):
    body = await request.json()
    gid = save_game_result(body)
    return {"id": gid}


@app.get("/api/games/stats")
async def api_game_stats():
    return get_game_stats()


@app.get("/api/games/history")
async def api_game_history(limit: int = Query(20)):
    return get_game_history(limit)


@app.post("/api/chat/completions")
async def proxy_chat(request: Request):
    """代理请求到 DashScope API，使用同步 requests + 线程池避免 httpx 超时问题"""
    # Rate limiting
    client_ip = _get_client_ip(request)
    if not proxy_limiter.is_allowed(client_ip):
        return JSONResponse(
            status_code=429,
            content={"error": {"message": "请求过于频繁，请稍后重试"}},
        )

    body = await request.body()
    # Body size limit: 10MB
    if len(body) > 10 * 1024 * 1024:
        return JSONResponse(
            status_code=413,
            content={"error": {"message": "请求体过大（最大 10MB）"}},
        )

    auth_header = request.headers.get("authorization", "")

    def _call_dashscope():
        resp = requests_lib.post(
            DASHSCOPE_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": auth_header,
            },
            timeout=180,
            proxies={"http": None, "https": None},  # 绕过系统代理（macOS 自动配置）
        )
        return resp

    try:
        loop = request.scope.get("loop")
        if loop:
            resp = await loop.run_in_executor(None, _call_dashscope)
        else:
            resp = _call_dashscope()
    except requests_lib.exceptions.ReadTimeout:
        return JSONResponse(
            status_code=504,
            content={"error": {"message": "识别超时，请检查网络后重试或尝试选择更小的图片"}},
        )
    except Exception as e:
        return JSONResponse(
            status_code=502,
            content={"error": {"message": f"请求异常：{str(e)}"}},
        )

    if resp.status_code != 200:
        try:
            return JSONResponse(status_code=resp.status_code, content=resp.json())
        except Exception:
            return JSONResponse(
                status_code=resp.status_code,
                content={"error": {"message": f"DashScope 返回异常: {resp.status_code}"}},
            )

    return JSONResponse(content=resp.json())


# Static files - 挂载在 API 路由之后
app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")
app.mount("/icons", StaticFiles(directory=os.path.join(BASE_DIR, "icons")), name="icons")
app.mount("/docs", StaticFiles(directory=os.path.join(BASE_DIR, "docs")), name="docs")
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="root")
