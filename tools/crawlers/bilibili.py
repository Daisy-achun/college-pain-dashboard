"""B站（哔哩哔哩）爬虫：免登录纯 HTTP 三步走。

流程：站内搜索（wbi 签名，游客 mixin key）按关键词搜视频取 BV 号
    -> x/web-interface/view?bvid= 拿 aid
    -> x/v2/reply/main 翻页拉评论

反爬：第一个请求（取 wbi key）即探针；遇到 412/403/429/验证码特征
      common.polite_get 会直接抛 AntiCrawlStop，不重试、不硬绕。
"""

import hashlib
import re
import time
import urllib.parse
from datetime import datetime

from .common import make_session, polite_get, check_api_code, AntiCrawlStop

PLATFORM = "bilibili"
PLATFORM_CN = "B站"

SEARCH_URL = "https://api.bilibili.com/x/web-interface/search/type"
VIEW_URL = "https://api.bilibili.com/x/web-interface/view"
NAV_URL = "https://api.bilibili.com/x/web-interface/nav"
REPLY_URL = "https://api.bilibili.com/x/v2/reply/main"

# WBI 签名混淆表（B站公开算法）
_MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
              27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
              37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
              22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 12]


def _get_mixin_key(orig: str) -> str:
    return "".join(orig[i] for i in _MIXIN_TAB)[:32]


def _enc_wbi(params: dict, img_key: str, sub_key: str) -> dict:
    """给请求参数加 wbi 签名（wts + w_rid）。"""
    mixin_key = _get_mixin_key(img_key + sub_key)
    params = dict(params)
    params["wts"] = round(time.time())
    params = dict(sorted(params.items()))
    params = {k: "".join(c for c in str(v) if c not in "!'()*")
              for k, v in params.items()}
    query = urllib.parse.urlencode(params)
    params["w_rid"] = hashlib.md5((query + mixin_key).encode()).hexdigest()
    return params


def _clean_title(raw: str) -> str:
    """去掉搜索标题里的 <em class="keyword"> 高亮标签。"""
    return re.sub(r"</?em[^>]*>", "", raw or "").strip()


def get_wbi_keys(session, g) -> tuple:
    """探针请求：取游客 mixin key。若被 412，直接熔断。

    注意：游客访问 nav 会返回 code=-101（未登录），但 wbi_img 照常下发，
    所以这里只做风控码熔断，不校验登录态。
    """
    resp = polite_get(session, NAV_URL, delay_min=g["delay_min"],
                      delay_max=g["delay_max"], retries=g["retries"])
    payload = resp.json()
    check_api_code(payload, NAV_URL, strict=False)
    wbi_img = (payload.get("data") or {}).get("wbi_img") or {}
    img_url, sub_url = wbi_img.get("img_url", ""), wbi_img.get("sub_url", "")
    if not img_url or not sub_url:
        raise RuntimeError("wbi_img 下发失败，无法签名搜索请求")
    img_key = img_url.rsplit("/", 1)[1].split(".")[0]
    sub_key = sub_url.rsplit("/", 1)[1].split(".")[0]
    return img_key, sub_key


def search_videos(session, keyword, page, wbi_keys, g):
    params = _enc_wbi(
        {"search_type": "video", "keyword": keyword, "page": page,
         "order": "totalrank"},
        *wbi_keys)
    resp = polite_get(session, SEARCH_URL, params=params,
                      delay_min=g["delay_min"], delay_max=g["delay_max"],
                      retries=g["retries"])
    payload = resp.json()
    check_api_code(payload, SEARCH_URL)
    videos = []
    for item in (payload.get("data") or {}).get("result") or []:
        if item.get("bvid"):
            videos.append({
                "bvid": item["bvid"],
                "title": _clean_title(item.get("title", "")),
            })
    return videos


def get_video_info(session, bvid, g):
    resp = polite_get(session, VIEW_URL, params={"bvid": bvid},
                      delay_min=g["delay_min"], delay_max=g["delay_max"],
                      retries=g["retries"])
    payload = resp.json()
    check_api_code(payload, VIEW_URL)
    data = payload["data"]
    return {
        "aid": data["aid"],
        "reply_count": (data.get("stat") or {}).get("reply", 0),
        "title": data.get("title", ""),
    }


def get_comments(session, aid, mode, max_pages, g):
    """拉评论（next 游标翻页）。评论区关闭/视频异常时返回空列表。"""
    comments = []
    nxt = 0
    pages = 0
    try:
        while pages < max_pages:
            params = {"type": 1, "oid": aid, "mode": mode, "next": nxt}
            resp = polite_get(session, REPLY_URL, params=params,
                              delay_min=g["delay_min"], delay_max=g["delay_max"],
                              retries=g["retries"])
            payload = resp.json()
            check_api_code(payload, REPLY_URL)
            data = payload.get("data") or {}
            pool = list(data.get("replies") or [])
            if pages == 0:
                pool = list(data.get("hots") or []) + pool
            seen = set()
            for rp in pool:
                rpid = rp.get("rpid")
                if not rpid or rpid in seen:
                    continue
                seen.add(rpid)
                comments.append({
                    "rpid": rpid,
                    "text": (rp.get("content") or {}).get("message", "").strip(),
                    "ctime": rp.get("ctime", 0),
                    "like": rp.get("like", 0),
                    "author": (rp.get("member") or {}).get("uname", ""),
                })
            pages += 1
            cursor = data.get("cursor") or {}
            nxt = cursor.get("next", 0)
            if cursor.get("is_end") or not nxt:
                break
    except RuntimeError:
        # 业务错误（如 12002 评论区关闭、-404 视频不存在）：跳过该视频
        return []
    return comments


def _row(keyword, video, comment, now_str):
    ctime = comment["ctime"]
    pub = (datetime.fromtimestamp(ctime).strftime("%Y-%m-%d %H:%M:%S")
           if ctime else "")
    return {
        "平台": PLATFORM_CN,
        "来源": keyword,
        "标题": video["title"],
        "正文": comment["text"],
        "发布时间": pub,
        "点赞数": comment["like"],
        "评论数": video["reply_count"],
        "原链接": f"https://www.bilibili.com/video/{video['bvid']}/#reply{comment['rpid']}",
        "抓取时间": now_str,
        "_id": f"bilibili:{comment['rpid']}",
    }


def crawl(cfg: dict) -> list:
    """cfg: 该平台配置 + 全局配置 + checkpoint（已抓ID集合）。返回 rows。"""
    g = cfg["global"]
    keywords = cfg.get("keywords", [])
    target = int(cfg.get("target_count", 800))
    search_pages = int(cfg.get("search_pages_per_keyword", 5))
    comment_pages = int(cfg.get("comment_pages_per_video", 3))
    mode = int(cfg.get("mode", 3))
    done = set(cfg.get("checkpoint", []))

    session = make_session()
    rows = []
    try:
        # 探针：取 wbi key（第 1 个请求）。412 则直接熔断停手。
        wbi_keys = get_wbi_keys(session, g)
        print(f"[{PLATFORM_CN}] 探针通过（wbi key 就绪），开始按关键词采集…")

        for keyword in keywords:
            if len(rows) >= target:
                break
            print(f"[{PLATFORM_CN}] 关键词「{keyword}」…")
            for page in range(1, search_pages + 1):
                if len(rows) >= target:
                    break
                videos = search_videos(session, keyword, page, wbi_keys, g)
                if not videos:
                    break
                for video in videos:
                    if len(rows) >= target:
                        break
                    try:
                        info = get_video_info(session, video["bvid"], g)
                    except RuntimeError:
                        continue
                    if not info["reply_count"]:
                        continue
                    video["reply_count"] = info["reply_count"]
                    if info.get("title"):
                        video["title"] = info["title"]
                    comments = get_comments(session, info["aid"], mode,
                                            comment_pages, g)
                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    new = 0
                    for c in comments:
                        rid = f"bilibili:{c['rpid']}"
                        if rid in done or not c["text"]:
                            continue
                        rows.append(_row(keyword, video, c, now_str))
                        done.add(rid)
                        new += 1
                        if len(rows) >= target:
                            break
                    print(f"[{PLATFORM_CN}]   {video['bvid']}《{video['title'][:24]}》"
                          f"+{new} 条（累计 {len(rows)}/{target}）")
    except AntiCrawlStop as e:
        print(f"\n[{PLATFORM_CN}] 反爬熔断报告：{e}")
        print(f"[{PLATFORM_CN}] 本次已采集 {len(rows)} 条，保留已抓数据并停手。")
        print(f"[{PLATFORM_CN}] 建议：更换网络出口 IP 后再跑（checkpoint 会自动跳过已抓）。\n")
    except RuntimeError as e:
        # API 业务错误（如搜索接口返回 -403 JSON）：视为软风控，停本平台
        print(f"\n[{PLATFORM_CN}] API 业务错误，停止本平台：{e}")
        print(f"[{PLATFORM_CN}] 本次已采集 {len(rows)} 条，保留已抓数据。\n")
    return rows
