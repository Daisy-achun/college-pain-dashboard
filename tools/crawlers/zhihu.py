# -*- coding: utf-8 -*-
"""
知乎爬虫模块（PLATFORM = "zhihu"）—— wowland 项目 drop-in 模块。

【运行前置条件】
1. 必须提供登录态 cookie（至少包含 z_c0）：游客态请求全部 403，无法抓取。
   cookie 来源二选一：
     a) cfg["cookies"] 传入 dict，如 {"z_c0": "xxxx", ...}
     b) 环境变量 ZHIHU_COOKIE，格式 "z_c0=xxxx; _xsrf=yyyy; ..."（分号分隔的 k=v 串）
   ※ 绝不硬编码 cookie，绝不写入代码/文档/日志。
2. 首次在新环境使用前，需人工在浏览器登录知乎一次并通过易盾验证码；
   之后从浏览器 DevTools 复制 cookie 即可复用。
3. 仅依赖标准库 + requests。BeautifulSoup 若已安装则用于正文转纯文本，未安装自动降级为正则。
4. 本模块只读不写：不写文件、不维护 checkpoint 文件，checkpoint 由框架注入/回收。
5. 稳健方案是 Playwright 常驻浏览器；本模块为 requests 版本（更轻量，适合定时批量任务）。

【config 示例片段】
    zhihu:
      enabled: true
      question_ids: [12345678, 87654321]   # 目标问题 ID（站内问题页 URL 中的数字）
      # search_keywords: ["选专业后悔", "考研崩溃"]  # 实验性：用站内搜索自动找问题（需登录态）
      target_count: 100                    # 本平台抓取上限（条回答）
      per_question: 20                     # 每个问题最多抓多少条回答
      sort_by: default                     # default / updated / vote（回答排序）
      delay_min: 1
      delay_max: 3
      retries: 3
      checkpoint: []                       # 框架注入：已抓 ID 集合（形如 "zhihu:987654"）
      cookies: {}                          # 或走环境变量 ZHIHU_COOKIE

无可用 cookie 时：打印缺 cookie 指引并返回空列表（不伪造请求、不抛异常中断框架）。
"""

import os
import random
import re
import time
from datetime import datetime
from http.cookies import SimpleCookie

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:  # 未安装 bs4 时走正则 fallback
    BeautifulSoup = None
    _HAS_BS4 = False

import requests

PLATFORM = "zhihu"

UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
]

API = "https://www.zhihu.com/api/v4"
# 命中任一即视为被反爬拦截，立即停手（不重试、不绕过）
BLOCK_SIGNS = ("人机验证", "安全验证", "captcha", "请输入验证码")
BLOCK_STATUS = (401, 403, 412, 429)

ANSWER_INCLUDE = ("data[*].is_normal,content,voteup_count,comment_count,"
                  "created_time,updated_time,url,author[name,url_token],question[title,id]")

DEFAULT_KEYWORDS = ["大学生吐槽", "大学牲", "选专业后悔", "转专业", "考研崩溃", "保研",
                    "实习论文兼顾", "导师关系", "室友矛盾", "考试挂科", "四六级", "秋招"]


class ZhihuBlocked(Exception):
    """被知乎反爬拦截（403/412/429/人机验证）：调用方应立即停手。"""


# ---------------- 基础工具 ----------------

def _rotate_ua(session: requests.Session) -> None:
    session.headers["User-Agent"] = random.choice(UA_LIST)


def _sleep(delay_min: float, delay_max: float) -> None:
    time.sleep(random.uniform(delay_min, delay_max))


def _looks_blocked(resp: requests.Response) -> bool:
    if resp.status_code in BLOCK_STATUS:
        return True
    ctype = resp.headers.get("Content-Type", "")
    text = resp.text or ""
    if "application/json" in ctype:
        try:
            err = resp.json().get("error", {})
            if isinstance(err, dict) and err.get("code") in (401, 403):
                return True
        except Exception:
            pass
    return any(s in text for s in BLOCK_SIGNS)


def _get(session: requests.Session, url: str, params: dict, retries: int) -> requests.Response:
    """带重试的 GET。拦截类响应立即抛 ZhihuBlocked（不重试）；网络错误/5xx 按 retries 重试。"""
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = session.get(url, params=params, timeout=15)
        except requests.RequestException as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        if _looks_blocked(resp):
            raise ZhihuBlocked("HTTP %s / 命中人机验证：%s" % (resp.status_code, url))
        if resp.status_code >= 500 and attempt < retries:
            time.sleep(2 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp
    raise last_err  # pragma: no cover


def _html_to_text(html: str) -> str:
    if _HAS_BS4:
        soup = BeautifulSoup(html or "", "html.parser")
        return soup.get_text("\n", strip=True)
    frag = re.sub(r"(?i)<br\s*/?>", "\n", html or "")
    frag = re.sub(r"(?i)</p\s*>|</div\s*>|</li\s*>", "\n", frag)
    text = re.sub(r"<[^>]+>", "", frag)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


# ---------------- cookie ----------------

def _parse_cookie_string(raw: str) -> dict:
    """解析 "k1=v1; k2=v2" 形式的 cookie 串。"""
    jar = SimpleCookie()
    try:
        jar.load(raw)
        out = {k: m.value for k, m in jar.items() if m.value}
        if out:
            return out
    except Exception:
        pass
    out = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            k, v = k.strip(), v.strip().strip('"')
            if k and v:
                out[k] = v
    return out


def _load_cookies(cfg: dict):
    """优先级：cfg['cookies']（dict）> 环境变量 ZHIHU_COOKIE。返回 dict 或 None。"""
    cookies = cfg.get("cookies")
    if isinstance(cookies, dict) and cookies:
        return dict(cookies)
    raw = os.environ.get("ZHIHU_COOKIE", "").strip()
    if raw:
        return _parse_cookie_string(raw)
    return None


# ---------------- 知乎 API ----------------

def _question_info(session: requests.Session, qid, retries: int):
    try:
        r = _get(session, "%s/questions/%s" % (API, qid),
                 {"include": "title,answer_count,comment_count"}, retries)
        q = r.json()
        return q.get("title", ""), q.get("answer_count", 0)
    except ZhihuBlocked:
        raise
    except Exception as e:
        print("[zhihu] 问题 %s 信息获取失败，跳过：%s" % (qid, e))
        return None, 0


def _search_questions(session: requests.Session, keyword: str, retries: int):
    """实验性：站内搜索找相关问题。失败只警告、不中断。"""
    try:
        r = _get(session, "%s/search_v3" % API,
                 {"t": "general", "q": keyword, "correction": 1, "limit": 20, "offset": 0},
                 retries)
        out = []
        for item in r.json().get("data", []):
            if item.get("type") == "search_result":
                obj = item.get("object", {})
                if obj.get("type") == "question" and obj.get("id"):
                    out.append((obj["id"], obj.get("title", "")))
        return out
    except ZhihuBlocked:
        raise
    except Exception as e:
        print("[zhihu] 关键词「%s」搜索失败（实验性功能），跳过：%s" % (keyword, e))
        return []


def _fetch_answers(session: requests.Session, qid, qtitle: str, limit: int,
                   sort_by: str, retries: int):
    """分页拉取一个问题的回答，返回原始 answer dict 列表。"""
    answers = []
    offset = 0
    while len(answers) < limit:
        r = _get(session, "%s/questions/%s/answers" % (API, qid), {
            "include": ANSWER_INCLUDE,
            "limit": min(20, limit - len(answers)),
            "offset": offset,
            "sort_by": sort_by,
        }, retries)
        data = r.json()
        batch = [a for a in data.get("data", []) if a.get("is_normal", True)]
        if not batch:
            break
        answers.extend(batch)
        paging = data.get("paging", {})
        if paging.get("is_end", True):
            break
        offset += len(batch)
    return answers


def _to_record(answer: dict, qid, qtitle: str) -> dict:
    aid = answer.get("id")
    ts = answer.get("created_time")
    pub = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S") if ts else ""
    url = answer.get("url") or "https://www.zhihu.com/question/%s/answer/%s" % (qid, aid)
    return {
        "平台": "知乎",
        "来源": qtitle or ("问题%s" % qid),          # 问题标题
        "标题": qtitle or ("问题%s" % qid),          # 回答无独立标题，沿用问题标题
        "正文": _html_to_text(answer.get("content", "")),
        "发布时间": pub,
        "点赞数": int(answer.get("voteup_count", 0) or 0),
        "评论数": int(answer.get("comment_count", 0) or 0),
        "原链接": url,
        "抓取时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


# ---------------- 主入口 ----------------

def crawl(cfg: dict) -> list[dict]:
    """抓取知乎回答。cfg 见模块头部 config 示例。只读不写；无 cookie 时返回空列表。"""
    cfg = dict(cfg or {})
    cookies = _load_cookies(cfg)
    if not cookies or "z_c0" not in cookies:
        print("[zhihu] 缺少登录 cookie（需要 z_c0），无法抓取，返回空列表。")
        print("        请按以下方式提供其一：")
        print("        1) config 中 zhihu.cookies = {\"z_c0\": \"...\", ...}")
        print("        2) 环境变量 ZHIHU_COOKIE=\"z_c0=...; _xsrf=...\"")
        print("        首次使用请先在浏览器登录知乎并通过一次易盾验证码，再复制 cookie。")
        return []

    question_ids = list(cfg.get("question_ids") or [])
    target = int(cfg.get("target_count", 100))
    per_question = int(cfg.get("per_question", 20))
    sort_by = cfg.get("sort_by", "default")
    delay_min = float(cfg.get("delay_min", 1))
    delay_max = float(cfg.get("delay_max", 3))
    retries = int(cfg.get("retries", 3))
    checkpoint = set(cfg.get("checkpoint") or [])

    session = requests.Session()
    session.headers.update({
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://www.zhihu.com/",
        "Origin": "https://www.zhihu.com",
        "x-api-version": "3.0.93",
        "x-requested-with": "fetch",
    })
    session.cookies.update(cookies)

    # 可选：用关键词搜索补充问题 ID（实验性）
    if cfg.get("search_keywords"):
        try:
            for kw in cfg["search_keywords"]:
                _rotate_ua(session)
                for qid, qtitle in _search_questions(session, kw, retries):
                    if qid not in question_ids:
                        question_ids.append(qid)
                _sleep(delay_min, delay_max)
        except ZhihuBlocked as e:
            print("[zhihu] 停手：%s（搜索阶段被拦截）" % e)
            return []

    items: list[dict] = []
    for qid in question_ids:
        if len(items) >= target:
            break
        try:
            _rotate_ua(session)
            qtitle, _ = _question_info(session, qid, retries)
            if qtitle is None:
                continue
            _sleep(delay_min, delay_max)
            _rotate_ua(session)
            answers = _fetch_answers(session, qid, qtitle,
                                     min(per_question, target - len(items)),
                                     sort_by, retries)
        except ZhihuBlocked as e:
            print("[zhihu] 停手：%s（已抓 %d 条；可能 cookie 失效或触发人机验证）" % (e, len(items)))
            return items
        except Exception as e:
            print("[zhihu] 问题 %s 抓取异常，跳过：%s" % (qid, e))
            continue
        for a in answers:
            if len(items) >= target:
                break
            aid = a.get("id")
            pid = "zhihu:" + str(aid)
            if not aid or pid in checkpoint:
                continue
            items.append(_to_record(a, qid, qtitle))
            checkpoint.add(pid)
        _sleep(delay_min, delay_max)
    return items


if __name__ == "__main__":
    cookies = _load_cookies({})
    if cookies and "z_c0" in cookies:
        print("[zhihu] 检测到可用 cookie（z_c0 已就绪），可运行抓取")
    else:
        print("[zhihu] 未检测到可用 cookie：请配置 cfg['cookies'] 或环境变量 ZHIHU_COOKIE（含 z_c0）")
