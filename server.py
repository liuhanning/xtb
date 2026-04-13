"""错题本后端 - FastAPI 静态服务 + DashScope API 代理"""
import os
import threading
import requests as requests_lib
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

app = FastAPI(title="错题本")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


@app.post("/api/chat/completions")
async def proxy_chat(request: Request):
    """代理请求到 DashScope API，使用同步 requests + 线程池避免 httpx 超时问题"""
    body = await request.body()
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
