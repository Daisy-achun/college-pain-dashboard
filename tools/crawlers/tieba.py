# -*- coding: utf-8 -*-
"""
贴吧爬虫模块（PLATFORM = "tieba"）—— wowland 项目 drop-in 模块。

【运行前置条件】
1. 出口 IP 必须是住宅 / 校园网：机房 / 云服务器 IP 会被百度"安全验证"直接 403 拦截。
   本模块不对 403 做任何绕过：遇到 403/412/429/验证码特征立即停手，打印警告并返回已抓到的部分。
2. 仅依赖标准库 + requests。BeautifulSoup 若已安装则用于解析，未安装自动降级为正则解析。
3. 免登录即可抓取（吧列表页 + 帖子页公开可见），无需 cookie。
4. 本模块只读不写：不写文件、不维护 checkpoint 文件，checkpoint 由框架注入/回收。

【config 示例片段】
    tieba:
      enabled: true
      bars: ["大学吧", "考研吧", "大学专业吧"]   # 目标吧（抓取入口：f?kw=吧名）
      target_count: 200                            # 本平台抓取上限（条）
      wap: true                                    # 默认走 WAP 轻量端（mo/q/fl）；PC 需显式 false
      delay_min: 1                                 # 请求间隔下限（秒）
      delay_max: 3                                 # 请求间隔上限（秒）
      retries: 3                                   # 网络失败重试次数
      checkpoint: []                               # 框架注入：已抓 ID 集合（形如 "tieba:123456"）
      cookies: {}                                  # 可选；一般不需要

【注意】
- 默认入口走公开 WAP 列表页 `mo/q/fl?kw=吧名&pn=`；显式设置 `wap: false` 时才走
  PC 列表页 `f?kw=吧名&pn=`。两者都避开 `/f/search`（robots 禁止）。
- keywords（大学生吐槽/大学牲/…）在贴吧侧预留给框架做"来源"标注，当前版本抓取以吧名为准。

探针结论（2026-10-08 本机实测，真机验证）：
- PC 端 `f?kw=吧名`：间歇性 403「百度安全验证」；即使返回 HTTP 200 也常是无内容的空壳页面
  （软拦截）。本模块首页解析出 0 条即判为软拦截、打印警告并跳过该吧。
- WAP 端（本机可用！）：列表页 `mo/q/fl?kw=吧名&pn=` 返回真实帖子列表（touch 版结构，
  帖子链接形如 /p/<tid>）；帖子页 `mo/q/m?kz=<tid>` 返回真实正文（touch 版结构，
  fn="1" 为楼主楼层）。当前配置默认使用 WAP；如 PC 端被拦，不会自动切换或绕过。
- 若运行时频繁触发 403/空壳页，建议换住宅/校园网 IP 再跑。
"""

import random
import re
import time
import urllib.parse
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:  # 未安装 bs4 时走正则 fallback，保证 requests-only 环境也能跑
    BeautifulSoup = None
    _HAS_BS4 = False

import requests

PLATFORM = "tieba"

UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
]

WAP_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
          "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")

BASE = "https://tieba.baidu.com"
# 命中任一即视为被反爬拦截，立即停手（不重试、不绕过）
BLOCK_SIGNS = ("百度安全验证", "安全验证", "captcha", "人机验证")
BLOCK_STATUS = (401, 403, 412, 429)

DEFAULT_BARS = ["大学吧", "考研吧", "大学专业吧"]
# 关键词（预留给框架做来源标注 / 后续合规入口扩展）
DEFAULT_KEYWORDS = ["大学生吐槽", "大学牲", "选专业后悔", "转专业", "考研崩溃", "保研",
                    "实习论文兼顾", "导师关系", "室友矛盾", "考试挂科", "四六级", "秋招"]


class TiebaBlocked(Exception):
    """被百度反爬拦截（403/412/429/安全验证）：调用方应立即停手。"""


# ---------------- 基础工具 ----------------

def _rotate_ua(session: requests.Session, wap: bool = False) -> None:
    session.headers["User-Agent"] = WAP_UA if wap else random.choice(UA_LIST)


def _sleep(delay_min: float, delay_max: float) -> None:
    time.sleep(random.uniform(delay_min, delay_max))


def _is_blocked(resp: requests.Response) -> bool:
    if resp.status_code in BLOCK_STATUS:
        return True
    text = resp.text or ""
    return any(s in text for s in BLOCK_SIGNS)


def _get(session: requests.Session, url: str, retries: int) -> requests.Response:
    """带重试的 GET。拦截类响应立即抛 TiebaBlocked（不重试）；网络错误/5xx 按 retries 重试。"""
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = session.get(url, timeout=15)
        except requests.RequestException as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        if _is_blocked(resp):
            raise TiebaBlocked("HTTP %s / 命中安全验证：%s" % (resp.status_code, url))
        if resp.status_code >= 500 and attempt < retries:
            time.sleep(2 * (attempt + 1))
            continue
        resp.raise_for_status()
        return resp
    raise last_err  # pragma: no cover


def _strip_html(fragment: str) -> str:
    fragment = re.sub(r"(?i)<br\s*/?>", "\n", fragment)
    fragment = re.sub(r"(?i)</p\s*>", "\n", fragment)
    text = re.sub(r"<[^>]+>", "", fragment)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip().strip("\n")


# ---------------- 列表页解析 ----------------

def _list_url(bar: str, page: int, wap: bool) -> str:
    kw = urllib.parse.quote(bar)
    if wap:
        return "%s/mo/q/fl?kw=%s&pn=%d" % (BASE, kw, page)
    return "%s/f?kw=%s&pn=%d" % (BASE, kw, page * 50)


def _parse_list_pc(html: str):
    """PC 端吧列表页 -> [{"tid","title","url","reply_count"}]（跳过置顶/广告贴）。"""
    threads = []
    if _HAS_BS4:
        soup = BeautifulSoup(html, "html.parser")
        for block in soup.select("div.threadlist_lz"):
            if block.select_one(".thread_top"):
                continue  # 置顶帖跳过
            a = block.select_one("a.j_th_tit")
            if not a or not a.get("href"):
                continue
            m = re.search(r"/p/(\d+)", a["href"])
            if not m:
                continue
            title = (a.get("title") or a.get_text(strip=True) or "").strip()
            rep = block.select_one(".threadlist_rep_num")
            threads.append({
                "tid": m.group(1),
                "title": title,
                "url": BASE + "/p/" + m.group(1),
                "reply_count": int(rep.get_text(strip=True)) if rep and rep.get_text(strip=True).isdigit() else 0,
            })
        return threads
    # 正则 fallback：按帖子块切分
    for block in re.split(r'<div class="threadlist_lz', html)[1:]:
        if "thread_top" in block[:2000]:
            continue
        m = re.search(r'<a[^>]*href="/p/(\d+)"[^>]*>(.*?)</a>', block, re.S)
        tag = m.group(0).split(">", 1)[0] if m else ""
        if not m or "j_th_tit" not in tag:
            continue
        t = re.search(r'title="([^"]*)"', tag)
        title = (t.group(1) if t else _strip_html(m.group(2))).strip()
        r = re.search(r'threadlist_rep_num[^>]*>\s*(\d+)', block)
        threads.append({
            "tid": m.group(1),
            "title": title,
            "url": BASE + "/p/" + m.group(1),
            "reply_count": int(r.group(1)) if r else 0,
        })
    return threads


def _parse_list_wap(html: str):
    """WAP 端列表页（mo/q/fl，touch 版结构）-> [{"tid","title","url","reply_count"}]。
    实测结构：<a class="j_common ti_item" data-tid="123" href="/p/123?..."> 内含
    div.ti_title（标题）、.ti_zan_reply .btn_icon（回复数）。"""
    threads = []
    if _HAS_BS4:
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.select("a.ti_item"):
            tid = a.get("data-tid") or ""
            if not tid:
                m = re.search(r"/p/(\d+)", a.get("href", ""))
                tid = m.group(1) if m else ""
            if not tid:
                continue
            title_tag = a.select_one(".ti_title")
            rep_tag = a.select_one(".ti_zan_reply .btn_icon")
            threads.append({
                "tid": tid,
                "title": title_tag.get_text(strip=True) if title_tag else "",
                "url": BASE + "/mo/q/m?kz=" + tid,
                "reply_count": int(rep_tag.get_text(strip=True)) if rep_tag and rep_tag.get_text(strip=True).isdigit() else 0,
            })
        return threads
    # 正则 fallback
    for m in re.finditer(r'<a[^>]*class="[^"]*ti_item[^"]*"[^>]*>(.*?)</a>', html, re.S):
        tag, inner = m.group(0).split(">", 1)[0], m.group(1)
        tm = re.search(r'data-tid="(\d+)"', tag) or re.search(r"/p/(\d+)", tag)
        if not tm:
            continue
        tt = re.search(r'<div class="ti_title"[^>]*>(.*?)</div>', inner, re.S)
        rr = re.search(r'ti_zan_reply.*?btn_icon[^>]*>\s*(\d+)', inner, re.S)
        threads.append({
            "tid": tm.group(1),
            "title": _strip_html(tt.group(1)) if tt else "",
            "url": BASE + "/mo/q/m?kz=" + tm.group(1),
            "reply_count": int(rr.group(1)) if rr else 0,
        })
    return threads


# ---------------- 帖子页解析 ----------------

def _parse_thread_pc(html: str, meta: dict):
    if _HAS_BS4:
        soup = BeautifulSoup(html, "html.parser")
        h3 = soup.select_one("h3.core_title_txt")
        title = (h3.get("title") or h3.get_text(strip=True)) if h3 else meta["title"]
        post = soup.select_one("div.d_post_content")
        body = post.get_text("\n", strip=True) if post else ""
        tail = soup.select_one("span.tail-info")
        tm = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)", tail.get_text() if tail else "")
        rep = soup.select_one("li.l_reply_num span.red")
        reply_count = int(rep.get_text(strip=True)) if rep and rep.get_text(strip=True).isdigit() else meta.get("reply_count", 0)
    else:
        t = re.search(r"<title>(.*?)</title>", html, re.S)
        if t:
            # 真实格式为“{标题}_{吧名}吧_百度贴吧”，逐层剥掉后缀
            title = _strip_html(t.group(1)).strip()
            title = re.sub(r"_百度贴吧$", "", title)
            title = re.sub(r"_[^_]{1,20}吧$", "", title)
        else:
            title = meta["title"]
        p = re.search(r'<div[^>]*class="[^"]*d_post_content[^"]*"[^>]*>(.*?)</div>', html, re.S)
        body = _strip_html(p.group(1)) if p else ""
        tm = re.search(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)", html)
        r = re.search(r'l_reply_num.*?red[^>]*>\s*(\d+)', html, re.S)
        reply_count = int(r.group(1)) if r else meta.get("reply_count", 0)
    z = re.search(r'"agree":\{"agree_num":(\d+)', html)
    zan = int(z.group(1)) if z else 0
    return {
        "平台": "贴吧",
        "来源": meta["bar"],
        "标题": (title or "").strip(),
        "正文": body,
        "发布时间": tm.group(1) if tm else "",
        "点赞数": zan,
        "评论数": reply_count,
        "原链接": BASE + "/p/" + meta["tid"],
        "抓取时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _wap_time_to_full(raw: str) -> str:
    """WAP 时间只有“月-日 时:分”（如 9-27 11:19），补当年年份；若结果在未来则减一年。"""
    m = re.match(r"(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2})", (raw or "").strip())
    if not m:
        return ""
    now = datetime.now()
    dt = datetime(now.year, int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
    if dt > now:
        dt = dt.replace(year=dt.year - 1)
    return dt.strftime("%Y-%m-%d %H:%M")


def _parse_thread_wap(html: str, meta: dict):
    """WAP 帖子页（mo/q/m?kz=，touch 版结构）。
    实测结构：<li fn="1"> 为楼主楼层，div.post_title_embed 为标题，
    div.content 为正文，span.list_item_time 为时间，"reply_num":N 为总回复数。"""
    if _HAS_BS4:
        soup = BeautifulSoup(html, "html.parser")
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else meta["title"]
        li = soup.find("li", attrs={"fn": "1"})
        content = li.select_one("div.content") if li else None
        body = content.get_text("\n", strip=True) if content else ""
        time_tag = li.select_one(".list_item_time") if li else None
        raw_time = time_tag.get_text(strip=True) if time_tag else ""
    else:
        t = re.search(r"<title>(.*?)</title>", html, re.S)
        title = _strip_html(t.group(1)).strip() if t else meta["title"]
        c = re.search(r'fn="1".*?<div class="content"[^>]*>(.*?)</div>', html, re.S)
        body = _strip_html(c.group(1)) if c else ""
        tm_tag = re.search(r'fn="1".*?list_item_time[^>]*>([^<]+)<', html, re.S)
        raw_time = tm_tag.group(1).strip() if tm_tag else ""
    r = re.search(r'"reply_num":(\d+)', html)
    z = re.search(r'"agree_num":(\d+)', html)
    return {
        "平台": "贴吧",
        "来源": meta["bar"],
        "标题": (title or "").strip(),
        "正文": body,
        "发布时间": _wap_time_to_full(raw_time),
        "点赞数": int(z.group(1)) if z else 0,
        "评论数": int(r.group(1)) if r else meta.get("reply_count", 0),
        "原链接": BASE + "/p/" + meta["tid"],
        "抓取时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


# ---------------- 主入口 ----------------

def crawl(cfg: dict) -> list[dict]:
    """抓取贴吧内容。cfg 见模块头部 config 示例。

    WAP 是默认入口，因为 PC 列表页当前经常返回安全验证空壳。
    只读不写；遇拦截立即停手并返回已抓部分，不自动切换入口或绕过验证。
    """
    cfg = dict(cfg or {})
    bars = cfg.get("bars") or list(DEFAULT_BARS)
    target = int(cfg.get("target_count", 200))
    # WAP is the safer public endpoint. Keep PC available only as an explicit opt-in.
    wap = bool(cfg.get("wap", True))
    delay_min = float(cfg.get("delay_min", 1))
    delay_max = float(cfg.get("delay_max", 3))
    retries = int(cfg.get("retries", 3))
    checkpoint = set(cfg.get("checkpoint") or [])
    cookies = cfg.get("cookies") or {}

    session = requests.Session()
    session.headers.update({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    if cookies:
        session.cookies.update(cookies)

    parse_list = _parse_list_wap if wap else _parse_list_pc
    parse_thread = _parse_thread_wap if wap else _parse_thread_pc

    items: list[dict] = []
    for bar in bars:
        if len(items) >= target:
            break
        page = 0
        while len(items) < target and page < 100:  # 页数上限兜底
            try:
                _rotate_ua(session, wap)
                resp = _get(session, _list_url(bar, page, wap), retries)
                threads = parse_list(resp.text)
            except TiebaBlocked as e:
                print("[tieba] 停手：%s（已抓 %d 条，IP 可能被百度安全验证拦截）" % (e, len(items)))
                return items
            except Exception as e:  # 网络故障等：换下一个吧
                print("[tieba] 吧「%s」列表页异常，跳过：%s" % (bar, e))
                break
            if not threads:
                if page == 0:
                    # 首页即 0 条：大概率是反爬软拦截（HTTP 200 但返回空壳页面），打警告后换吧
                    print("[tieba] 吧「%s」首页解析出 0 条（HTTP %s）：疑似被反爬软拦截，跳过该吧" % (bar, resp.status_code))
                break
            _sleep(delay_min, delay_max)
            for t in threads:
                if len(items) >= target:
                    break
                pid = "tieba:" + t["tid"]
                if pid in checkpoint:
                    continue
                t["bar"] = bar
                try:
                    _rotate_ua(session, wap)
                    r = _get(session, t["url"], retries)
                    rec = parse_thread(r.text, t)
                except TiebaBlocked as e:
                    print("[tieba] 停手：%s（已抓 %d 条）" % (e, len(items)))
                    return items
                except Exception as e:  # 单帖异常（404/删帖等）：跳过该帖继续
                    print("[tieba] 帖子 %s 跳过：%s" % (t["url"], e))
                    continue
                items.append(rec)
                checkpoint.add(pid)
                _sleep(delay_min, delay_max)
            page += 1
    return items


def probe() -> bool:
    """单请求 WAP 探针：验证当前 IP 能否访问公开贴吧入口。"""
    try:
        s = requests.Session()
        s.headers.update({"User-Agent": WAP_UA})
        r = s.get(_list_url("大学吧", 0, True), timeout=15)
        if _is_blocked(r):
            print("[tieba探针] 被拦截（HTTP %s）：当前 IP 需更换为住宅/校园网后再运行" % r.status_code)
            return False
        r.raise_for_status()
        print("[tieba探针] OK（HTTP %s）：当前 IP 可抓取" % r.status_code)
        return True
    except Exception as e:
        print("[tieba探针] 异常：%s" % e)
        return False


if __name__ == "__main__":
    probe()
