"""豆瓣小组爬虫：免登录 requests + 真实 UA + 随机 2-4 秒间隔。

流程：小组 discussion 列表（每页25帖）-> 逐帖 topic 页拿正文+热评。

小组用数字 ID（从小组主页 URL 复制）。config 里也可写小组名，
但豆瓣免登录搜索需要登录、无法按名称解析成 ID，
所以写小组名时会直接报错并指引去浏览器复制数字 ID。

反爬：第一个请求（小组主页）即探针；403/429/验证码 -> 立刻熔断停手。
"""

import re
from datetime import datetime
from html.parser import HTMLParser

from .common import make_session, polite_get, AntiCrawlStop

PLATFORM = "douban"
PLATFORM_CN = "豆瓣"


# ---------------- HTML 解析（只用标准库） ----------------

def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


class TopicListParser:
    """解析 discussion 列表页：提取 (topic_id, 标题, 作者, 回复数, 最后回复时间)。"""

    TOPIC_RE = re.compile(r'href="https://www\.douban\.com/group/topic/(\d+)/"')

    def parse(self, html: str):
        topics = []
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
            m = self.TOPIC_RE.search(row)
            if not m:
                continue
            tid = m.group(1)
            title_m = re.search(r'title="([^"]+)"', row[m.start():m.start() + 500])
            title = title_m.group(1).strip() if title_m else ""
            tds = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            author, replies, last = "", 0, ""
            if len(tds) >= 4:
                author = _strip_tags(tds[1])
                num = _strip_tags(tds[2])
                replies = int(num) if num.isdigit() else 0
                last = _strip_tags(tds[3])
            topics.append({"id": tid, "title": title, "author": author,
                           "replies": replies, "last_reply": last})
        return topics


class TopicPageParser(HTMLParser):
    """解析 topic 详情页：标题/正文/发布时间/评论列表。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self.body_chunks = []
        self._body_depth = 0          # id=link-report 元素内深度
        self.pub_time = ""
        self.comments = []
        self._cur = None              # 当前 comment-item
        self._cmt_depth = 0
        self._field = None            # author/time/likes/short/all
        self._stack = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self._stack.append(tag)
        if tag == "title":
            self._in_title = True
        if attrs.get("id") == "link-report":
            self._body_depth = len(self._stack)
        cls = attrs.get("class", "")
        if tag == "div" and "comment-item" in cls:
            self._cur = {"cid": attrs.get("data-cid", ""), "author": "",
                         "time": "", "likes": 0, "short": [], "all": []}
            self._cmt_depth = len(self._stack)
        if self._cur is not None:
            if "comment-info" in cls:
                self._field = "author"
            elif "comment-time" in cls:
                self._field = "time"
            elif "vote-count" in cls:
                self._field = "likes"
            elif tag == "span" and "short" in cls:
                self._field = "short"
            elif tag == "span" and cls.strip() == "all":
                self._field = "all"

    def handle_endtag(self, tag):
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()
        if tag == "title":
            self._in_title = False
        if self._body_depth and len(self._stack) < self._body_depth:
            self._body_depth = 0
        if self._cur is not None and self._cmt_depth and \
                len(self._stack) < self._cmt_depth:
            short = "".join(self._cur["short"]).strip()
            all_ = "".join(self._cur["all"]).strip()
            self._cur["text"] = all_ if len(all_) > len(short) else short
            del self._cur["short"], self._cur["all"]
            self.comments.append(self._cur)
            self._cur = None
            self._cmt_depth = 0
            self._field = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._body_depth:
            self.body_chunks.append(data)
        if not self.pub_time:
            m = re.search(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", data)
            if m:
                self.pub_time = m.group(0)
        if self._cur is not None and self._field:
            t = data.strip()
            if not t:
                return
            if self._field == "author" and not self._cur["author"]:
                self._cur["author"] = t
            elif self._field == "time" and not self._cur["time"]:
                self._cur["time"] = t
            elif self._field == "likes":
                num = re.sub(r"\D", "", t)
                if num:
                    self._cur["likes"] = int(num)
            elif self._field == "short":
                self._cur["short"].append(data)
            elif self._field == "all":
                self._cur["all"].append(data)


# ---------------- 抓取 ----------------

def _get(session, url, g, params=None):
    return polite_get(session, url, params=params,
                      delay_min=g["delay_min"], delay_max=g["delay_max"],
                      retries=g["retries"])


def resolve_group(session, entry, g):
    """entry 必须是数字 ID。返回 (gid, 小组名)，并校验小组主页可打开。

    小组名无法免登录解析：直接报错，指引去浏览器复制数字 ID。
    """
    entry = str(entry).strip()
    if not entry.isdigit():
        raise RuntimeError(
            "小组「{}」是名称不是数字 ID：豆瓣免登录无法按名称搜索，"
            "请在浏览器打开该小组主页，把 URL 中的数字 ID 填入 config.yaml 的 groups".format(entry)
        )
    url = "https://www.douban.com/group/{}/".format(entry)
    resp = _get(session, url, g)          # 探针请求
    html = resp.text
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    name = _strip_tags(m.group(1)).replace("(豆瓣小组)", "").strip() if m else ""
    if not name or "不存在" in name or "登录" in name:
        raise RuntimeError("小组 ID {} 无法打开（可能不存在或需登录），请核对 ID".format(entry))
    return entry, name


def get_topic(session, topic_id, g):
    url = "https://www.douban.com/group/topic/{}/".format(topic_id)
    resp = _get(session, url, g)
    p = TopicPageParser()
    p.feed(resp.text)
    title = _strip_tags(p.title).replace("(豆瓣)", "").strip()
    body = _strip_tags("".join(p.body_chunks))
    return {"title": title, "body": body, "pub_time": p.pub_time,
            "comments": p.comments}


def _row(group_name, topic, detail, hot_n, now_str):
    comments = sorted(detail["comments"], key=lambda c: c.get("likes", 0),
                      reverse=True)[:hot_n]
    hot_text = "\n".join(
        "@{}（赞{}）：{}".format(c["author"], c.get("likes", 0), c.get("text", ""))
        for c in comments if c.get("text"))
    body = detail["body"]
    if hot_text:
        body = body + "\n\n【热评】\n" + hot_text
    like_sum = sum(c.get("likes", 0) for c in comments)
    return {
        "平台": PLATFORM_CN,
        "来源": group_name,
        "标题": detail["title"] or topic["title"],
        "正文": body,
        "发布时间": detail["pub_time"],
        "点赞数": like_sum,          # 口径：所附热评点赞数之和（帖子本身无公开点赞数）
        "评论数": topic["replies"],  # 帖子总回复数（列表页）
        "原链接": "https://www.douban.com/group/topic/{}/".format(topic["id"]),
        "抓取时间": now_str,
        "_id": "douban:{}".format(topic["id"]),
    }


def crawl(cfg: dict) -> list:
    g = dict(cfg["global"])
    # 豆瓣礼貌间隔：默认 2-4 秒（比全局更保守），config 可覆盖
    g["delay_min"] = int(cfg.get("delay_min", 2))
    g["delay_max"] = int(cfg.get("delay_max", 4))
    groups = cfg.get("groups", [])
    target = int(cfg.get("target_count", 600))
    hot_n = int(cfg.get("hot_comments_per_topic", 5))
    list_pages = int(cfg.get("list_pages_per_group", 24))
    done = set(cfg.get("checkpoint", []))

    session = make_session()
    rows = []
    try:
        for entry in groups:
            if len(rows) >= target:
                break
            try:
                gid, gname = resolve_group(session, entry, g)
            except RuntimeError as e:
                print("[{}] 跳过：{}".format(PLATFORM_CN, e))
                continue
            print("[{}] 小组「{}」(id={}) 探针通过，开始采集…".format(
                PLATFORM_CN, gname, gid))
            list_parser = TopicListParser()
            for pg in range(list_pages):
                if len(rows) >= target:
                    break
                start = pg * 25
                url = "https://www.douban.com/group/{}/discussion?start={}".format(
                    gid, start)
                resp = _get(session, url, g)
                topics = list_parser.parse(resp.text)
                if not topics:
                    print("[{}] 列表第 {} 页无帖子，换下一小组".format(PLATFORM_CN, pg + 1))
                    break
                for t in topics:
                    if len(rows) >= target:
                        break
                    rid = "douban:{}".format(t["id"])
                    if rid in done:
                        continue
                    detail = get_topic(session, t["id"], g)
                    if not detail["body"]:
                        continue
                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    rows.append(_row(gname, t, detail, hot_n, now_str))
                    done.add(rid)
                    if len(rows) % 20 == 0:
                        print("[{}] 已采集 {}/{} 条".format(PLATFORM_CN, len(rows), target))
    except AntiCrawlStop as e:
        print("\n[{}] 反爬熔断报告：{}".format(PLATFORM_CN, e))
        print("[{}] 本次已采集 {} 条，保留已抓数据并停手。".format(PLATFORM_CN, len(rows)))
        print("[{}] 建议：等待一段时间/更换网络出口后重跑（checkpoint 自动跳过已抓）。\n".format(PLATFORM_CN))
    return rows
