# -*- coding: utf-8 -*-
"""tieba.py / zhihu.py 自测（放仓库里，方便回归）。
跑法：
  python3 tests/test_tieba_zhihu.py            # 无 bs4：正则 fallback 路径
  tool/.venv-test/bin/python tests/test_tieba_zhihu.py   # 有 bs4：BeautifulSoup 路径
"""
import json
import os
import sys
from datetime import datetime as _dt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "crawlers"))
import tieba
import zhihu
import requests

ok = []


def check(name, cond):
    ok.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name)


print("bs4 available in this interpreter:", tieba._HAS_BS4)

# ---------- tieba PC 列表页 ----------
check("tieba默认入口: WAP", tieba._list_url("大学吧", 0, True).startswith(tieba.BASE + "/mo/q/fl"))
LIST_HTML = '''
<div class="threadlist_lz clearfix">
  <div class="threadlist_top clearfix thread_top"></div>
  <div class="threadlist_title pull_left j_th_tit ">
    <a rel="noreferrer" href="/p/1111111111" title="置顶帖应该被跳过" target="_blank" class="j_th_tit ">置顶帖应该被跳过</a>
  </div>
</div>
<div class="threadlist_lz clearfix">
  <div class="threadlist_title pull_left j_th_tit ">
    <a rel="noreferrer" href="/p/8901234567" title="大学牲的日常：又挂科了" target="_blank" class="j_th_tit ">大学牲的日常：又挂科了</a>
  </div>
  <div class="threadlist_detail clearfix">
    <span class="threadlist_rep_num center_text">128</span>
  </div>
</div>
<div class="threadlist_lz clearfix">
  <div class="threadlist_title pull_left j_th_tit ">
    <a rel="noreferrer" href="/p/8901234568" title="考研崩溃实录" target="_blank" class="j_th_tit ">考研崩溃实录</a>
  </div>
  <div class="threadlist_detail clearfix">
    <span class="threadlist_rep_num center_text">56</span>
  </div>
</div>
'''
threads = tieba._parse_list_pc(LIST_HTML)
check("tieba列表: 解析出2条(跳过置顶)", len(threads) == 2)
check("tieba列表: tid正确", threads[0]["tid"] == "8901234567")
check("tieba列表: 标题正确", threads[0]["title"] == "大学牲的日常：又挂科了")
check("tieba列表: 回复数正确", threads[0]["reply_count"] == 128)
check("tieba列表: 链接正确", threads[0]["url"] == "https://tieba.baidu.com/p/8901234567")

# ---------- tieba PC 帖子页 ----------
THREAD_HTML = '''<html><head><title>大学牲的日常：又挂科了_大学吧_百度贴吧</title></head><body>
<h3 class="core_title_txt pull-left text-overflow " title="大学牲的日常：又挂科了">大学牲的日常：又挂科了</h3>
<div class="l_post"><cc><div id="post_content_1" class="d_post_content j_d_post_content ">第一段正文<br>第二段正文</div></cc></div>
<span class="tail-info">1楼&nbsp;2026-10-01 08:30</span>
<li class="l_reply_num"><span class="red">128</span>回复贴</li>
<script>var x = {"agree":{"agree_num":56,"laud_num":56}};</script>
</body></html>'''
rec = tieba._parse_thread_pc(THREAD_HTML, {"tid": "8901234567", "title": "x", "bar": "大学吧", "reply_count": 0})
check("tieba帖子: 平台=贴吧", rec["平台"] == "贴吧")
check("tieba帖子: 来源=大学吧", rec["来源"] == "大学吧")
check("tieba帖子: 标题", rec["标题"] == "大学牲的日常：又挂科了")
check("tieba帖子: 正文含两段", "第一段正文" in rec["正文"] and "第二段正文" in rec["正文"])
check("tieba帖子: 发布时间", rec["发布时间"] == "2026-10-01 08:30")
check("tieba帖子: 点赞数56", rec["点赞数"] == 56)
check("tieba帖子: 评论数128", rec["评论数"] == 128)
check("tieba帖子: 原链接", rec["原链接"] == "https://tieba.baidu.com/p/8901234567")
check("tieba帖子: 字段齐全",
      set(rec.keys()) == {"平台", "来源", "标题", "正文", "发布时间", "点赞数", "评论数", "原链接", "抓取时间"})

# ---------- tieba WAP（真实 touch 结构） ----------
WAP_LIST = ('<li><a href="/p/11057213632?lp=5028&amp;mo_device=1" class="j_common ti_item " '
            'data-tid="11057213632"><div class="ti_title"> <span>优绩主义爆了</span></div> '
            '<div class="ti_zan_reply clearfix"> <div class="ti_func_btn btn_reply">'
            '<span class="btn_icon">2</span></div> </div> </a></li>')
wl = tieba._parse_list_wap(WAP_LIST)
check("tieba WAP列表", len(wl) == 1 and wl[0]["tid"] == "11057213632"
      and wl[0]["title"] == "优绩主义爆了" and wl[0]["reply_count"] == 2
      and wl[0]["url"] == "https://tieba.baidu.com/mo/q/m?kz=11057213632")
WAP_THREAD = ('<html><head><title>优绩主义爆了</title></head><body>'
              '<li tid="1" fn="1" class="list_item post_list_item ">'
              '<div class="post_title_embed">优绩主义爆了 </div>'
              '<span class="list_item_time">9-27 11:19</span>'
              '<div class="content" style="">想象一下你是一个211<br/>第二段</div></li>'
              '<script>var x = {"reply_num":2,"agree_num":5};</script></body></html>')
wr = tieba._parse_thread_wap(WAP_THREAD, {"tid": "11057213632", "title": "x", "bar": "大学吧", "reply_count": 0})
check("tieba WAP帖子标题", wr["标题"] == "优绩主义爆了")
check("tieba WAP帖子正文", "想象一下你是一个211" in wr["正文"] and "第二段" in wr["正文"])
check("tieba WAP帖子时间补年份", wr["发布时间"] == "%d-09-27 11:19" % _dt.now().year)
check("tieba WAP帖子回复/赞", wr["评论数"] == 2 and wr["点赞数"] == 5)
check("tieba WAP帖子来源", wr["来源"] == "大学吧" and wr["原链接"] == "https://tieba.baidu.com/p/11057213632")
check("tieba WAP字段齐全",
      set(wr.keys()) == {"平台", "来源", "标题", "正文", "发布时间", "点赞数", "评论数", "原链接", "抓取时间"})

# ---------- tieba 拦截停手（fake 403） ----------
class FakeResp:
    def __init__(self, status, text=""):
        self.status_code, self.text, self.headers = status, text, {}

    def raise_for_status(self):
        pass

    def json(self):
        return json.loads(self.text)


class FakeSession(requests.Session):
    def __init__(self, mode):
        super().__init__()
        self.mode = mode

    def get(self, url, **kw):
        if self.mode == "blocked":
            return FakeResp(403, "<title>百度安全验证</title>")
        if self.mode == "empty":
            return FakeResp(200, "<html><head><title>百度贴吧</title></head><body></body></html>")
        if "f?kw=" in url or "mo/q/fl" in url:
            return FakeResp(200, LIST_HTML)
        return FakeResp(200, THREAD_HTML)


orig_session = requests.Session
requests.Session = lambda: FakeSession("blocked")
try:
    items = tieba.crawl({"bars": ["大学吧"], "target_count": 10, "delay_min": 0, "delay_max": 0})
    check("tieba拦截: 403 返回空列表不停机", items == [])
finally:
    requests.Session = orig_session

requests.Session = lambda: FakeSession("empty")
try:
    items = tieba.crawl({"bars": ["大学吧"], "target_count": 10, "delay_min": 0, "delay_max": 0})
    check("tieba软拦截: 首页0条 -> 警告并返回空", items == [])
finally:
    requests.Session = orig_session

# 正常流程（fake）+ checkpoint 去重
requests.Session = lambda: FakeSession("ok")
try:
    items = tieba.crawl({"bars": ["大学吧"], "target_count": 10, "delay_min": 0, "delay_max": 0,
                         "checkpoint": ["tieba:8901234567"], "wap": False})
    # fake 帖子页固定返回同一份 HTML，标题取自帖子页 fixture
    check("tieba流程: checkpoint去重后只剩1条", len(items) == 1 and items[0]["标题"] == "大学牲的日常：又挂科了")
    check("tieba流程: 跳过的是 checkpoint 中的 tid", items[0]["原链接"] == "https://tieba.baidu.com/p/8901234568")
finally:
    requests.Session = orig_session

# ---------- zhihu ----------
class FakeZhihuSession(requests.Session):
    def get(self, url, **kw):
        if url.rstrip("/").endswith("/questions/123") and "answers" not in url:
            return FakeResp(200, json.dumps({"title": "选专业后悔是一种什么体验？", "answer_count": 2}))
        if "/questions/123/answers" in url:
            data = {"data": [
                {"id": 1001, "is_normal": True, "content": "<p>回答一内容</p><p>第二段</p>",
                 "voteup_count": 321, "comment_count": 45, "created_time": 1727740800,
                 "url": "https://www.zhihu.com/question/123/answer/1001",
                 "author": {"name": "某答主"}, "question": {"title": "选专业后悔是一种什么体验？", "id": 123}},
                {"id": 1002, "is_normal": True, "content": "纯文本回答二",
                 "voteup_count": 10, "comment_count": 2, "created_time": 1727827200,
                 "url": "https://www.zhihu.com/question/123/answer/1002",
                 "author": {"name": "答主B"}, "question": {"title": "选专业后悔是一种什么体验？", "id": 123}},
            ], "paging": {"is_end": True}}
            return FakeResp(200, json.dumps(data))
        return FakeResp(404, "{}")


# 无 cookie -> 空列表
items = zhihu.crawl({"question_ids": [123]})
check("zhihu无cookie: 返回空列表", items == [])

# env cookie 解析
os.environ["ZHIHU_COOKIE"] = "z_c0=abc123; _xsrf=def456"
c = zhihu._load_cookies({})
check("zhihu env cookie解析", c == {"z_c0": "abc123", "_xsrf": "def456"})
del os.environ["ZHIHU_COOKIE"]
c2 = zhihu._load_cookies({"cookies": {"z_c0": "X"}})
check("zhihu cfg cookie优先", c2 == {"z_c0": "X"})

# 有 cookie 正常流程（monkeypatch 掉 sleep 与 Session）
requests.Session = FakeZhihuSession
orig_sleep = zhihu._sleep
zhihu._sleep = lambda a, b: None
try:
    items = zhihu.crawl({"question_ids": [123], "cookies": {"z_c0": "X"},
                         "target_count": 10, "per_question": 20,
                         "checkpoint": ["zhihu:1001"]})
    check("zhihu流程: checkpoint去重后1条", len(items) == 1)
    r0 = items[0]
    check("zhihu字段: 平台=知乎", r0["平台"] == "知乎")
    check("zhihu字段: 来源=问题标题", r0["来源"] == "选专业后悔是一种什么体验？")
    check("zhihu字段: 标题=问题标题", r0["标题"] == "选专业后悔是一种什么体验？")
    check("zhihu字段: 正文转纯文本", r0["正文"] == "纯文本回答二")
    check("zhihu字段: 点赞/评论", r0["点赞数"] == 10 and r0["评论数"] == 2)
    check("zhihu字段: 发布时间", r0["发布时间"] == _dt.fromtimestamp(1727827200).strftime("%Y-%m-%d %H:%M:%S"))
    check("zhihu字段: 原链接", r0["原链接"] == "https://www.zhihu.com/question/123/answer/1002")
    check("zhihu字段: 字段齐全",
          set(r0.keys()) == {"平台", "来源", "标题", "正文", "发布时间", "点赞数", "评论数", "原链接", "抓取时间"})
finally:
    requests.Session = orig_session
    zhihu._sleep = orig_sleep

# zhihu 拦截停手
class FakeZhihuBlocked(requests.Session):
    def get(self, url, **kw):
        return FakeResp(403, '{"error":{"code":403,"message":""}}')


requests.Session = FakeZhihuBlocked
zhihu._sleep = lambda a, b: None
try:
    items = zhihu.crawl({"question_ids": [123], "cookies": {"z_c0": "X"}})
    check("zhihu拦截: 返回已抓部分(空)不停机", items == [])
finally:
    requests.Session = orig_session
    zhihu._sleep = orig_sleep

print()
print("TOTAL:", sum(ok), "/", len(ok), "ALL PASS" if all(ok) else "SOME FAILED")
sys.exit(0 if all(ok) else 1)
