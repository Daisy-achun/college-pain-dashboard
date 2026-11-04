"""通用礼貌爬取工具：UA 轮换、随机延迟、失败重试、反爬熔断。

核心原则：
1. 只读不写：本模块只封装 GET 请求，绝不发 POST/发帖/点赞/关注。
2. 遇到 403/412/429 或验证码特征 -> 立刻抛 AntiCrawlStop，不重试、不硬绕。
3. 网络抖动 / 5xx -> 按 global.retries 重试（指数退避），仍失败则抛。
"""

import random
import time

import requests

# 桌面端真实浏览器 UA 池，每次请求前轮换
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
]

# 触发立即停手的 HTTP 状态码：封禁/风控/限流
BLOCK_STATUSES = (403, 412, 429)

# 验证码/风控页面特征（出现在响应正文里就停手）
CAPTCHA_MARKERS = [
    "验证码", "安全验证", "滑动验证", "点击验证", "人机验证",
    "captcha", "recaptcha", "geetest", "滑动拼图",
    "异常登录", "访问过于频繁", "too many requests",
    "risk", "风控", "账号存在风险",
]


class AntiCrawlStop(Exception):
    """反爬熔断：站点返回 403/412/429 或出现验证码/风控特征。

    捕获到此异常后，调用方必须立即停止该平台的抓取并打印报告，
    不得重试、换 IP/UA 绕行。
    """

    def __init__(self, message, status=None, url=None):
        super().__init__(message)
        self.status = status
        self.url = url


def make_session():
    """建一个带浏览器常用头的 Session。"""
    s = requests.Session()
    s.headers.update({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Connection": "keep-alive",
    })
    return s


def _check_block(resp, url):
    """检查响应是否触发熔断。是则抛 AntiCrawlStop。"""
    if resp.status_code in BLOCK_STATUSES:
        raise AntiCrawlStop(
            f"[熔断] HTTP {resp.status_code}（风控/封禁/限流），立即停手，不重试",
            status=resp.status_code, url=url,
        )
    ctype = resp.headers.get("Content-Type", "")
    if "text" in ctype or "html" in ctype:
        body = resp.text
        for marker in CAPTCHA_MARKERS:
            if marker in body:
                raise AntiCrawlStop(
                    f"[熔断] 检测到风控特征「{marker}」，立即停手",
                    status=resp.status_code, url=url,
                )


def polite_get(session, url, *, params=None, headers=None,
               delay_min=1, delay_max=3, retries=3, timeout=20):
    """礼貌 GET：随机 UA + 随机延迟 + 有限重试 + 反爬熔断。

    返回 requests.Response。熔断时抛 AntiCrawlStop；重试耗尽抛原异常。
    """
    # 每次请求换一个 UA（轮换），先延迟再请求
    session.headers["User-Agent"] = random.choice(USER_AGENTS)
    extra = dict(headers or {})
    time.sleep(random.uniform(delay_min, delay_max))

    last_exc = None
    for attempt in range(retries + 1):
        try:
            resp = session.get(url, params=params, headers=extra, timeout=timeout)
        except requests.RequestException as e:
            last_exc = e
            if attempt < retries:
                time.sleep(random.uniform(1, 2) * (2 ** attempt))
                continue
            raise
        # 先做熔断检查：403/412/429/验证码 -> 直接停手，不进重试
        _check_block(resp, url)
        # 5xx 服务端错误 -> 指数退避重试
        if resp.status_code >= 500:
            last_exc = requests.HTTPError(f"HTTP {resp.status_code} for {url}")
            if attempt < retries:
                time.sleep(random.uniform(1, 2) * (2 ** attempt))
                continue
            resp.raise_for_status()
        resp.raise_for_status()
        return resp
    # 理论上到不了这里
    raise last_exc


def check_api_code(payload, url, strict=True):
    """B站类 JSON API 的业务码检查：code=-412 等风控码 -> 熔断。

    payload 为响应的 JSON dict。strict=True 时其他非 0 业务码抛 RuntimeError
    （调用方可捕获后跳过，如视频不存在）；strict=False 时非风控错误只返回 False。
    """
    if not isinstance(payload, dict):
        return True
    code = payload.get("code", 0)
    if code == 0:
        return True
    if code in (-412, -403, -429):
        raise AntiCrawlStop(
            f"[熔断] API 返回风控码 code={code}（{payload.get('message', '')}），立即停手，不重试",
            status=code, url=url,
        )
    if strict:
        # 其他业务错误（如 -404 视频不存在）：不熔断，抛普通异常让调用方跳过
        raise RuntimeError(f"API 业务错误 code={code}: {payload.get('message', '')} url={url}")
    return False
