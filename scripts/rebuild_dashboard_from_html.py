#!/usr/bin/env python3
"""Rebuild app/data/dashboard.json from the new research HTML + Zhihu xlsx.

- Themes: keep HTML T01–T28
- Scenes: remap HTML's 19 LLM scenes → product 23-class taxonomy
- Merge Zhihu rows (old theme codes mapped by label semantics)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import openpyxl

NEW_SCENES = [
    "求职/秋招/offer",
    "学校管理/规章",
    "宿舍与生活条件",
    "职业方向/技能/转行",
    "课程/考试/挂科/绩点",
    "考研/二战",
    "选专业/转专业/专业不喜欢",
    "实习",
    "室友/同学/人际关系",
    "恋爱/情感",
    "心理：焦虑/抑郁/自我否定",
    "经济压力/生活费",
    "导师/老师关系",
    "竞赛/科研/学生工作",
    "专升本/学历提升",
    "自律/拖延/执行力",
    "方向迷茫/不知道想做什么",
    "保研/推免",
    "毕业论文/延毕",
    "学历/出身/歧视",
    "家庭/父母",
    "考公/考编/体制内",
    "留学/出国",
]

DIRECT = {
    "求职/秋招/offer": ["求职/秋招/offer"],
    "实习": ["实习"],
    "职业方向/技能/转行": ["职业方向/技能/转行"],
    "学历门槛/歧视": ["学历/出身/歧视"],
    "考公/考编/体制内": ["考公/考编/体制内"],
    "考研/二战": ["考研/二战"],
    "保研/推免": ["保研/推免"],
    "专升本/学历提升": ["专升本/学历提升"],
    "留学/出国": ["留学/出国"],
    "课程/考试/挂科": ["课程/考试/挂科/绩点"],
    "选专业/转专业": ["选专业/转专业/专业不喜欢"],
    "学校管理/规章": ["学校管理/规章"],
    "宿舍与生活条件": ["宿舍与生活条件"],
    "证件/档案/手续": ["学校管理/规章"],
    "收费/生活费/经济": ["经济压力/生活费"],
    "家庭/父母": ["家庭/父母"],
}

KW = {
    "恋爱/情感": r"恋爱|脱单|分手|暗恋|表白|情侣|对象|前任|相亲|谈恋爱|被甩|异地恋|男女朋友|喜欢的人",
    "室友/同学/人际关系": r"室友|舍友|同学|被孤立|冷暴力|人际|合不来|霸凌|被排挤|交不到朋友|社交",
    "导师/老师关系": r"导师|导员|辅导员|老板不管|联系导师|导师不放|导师拖|导师卡|研究生导师",
    "毕业论文/延毕": r"毕业论文|毕业设计|开题|答辩|延毕|延期毕业|查重|盲审|毕设",
    "自律/拖延/执行力": r"拖延|自律|执行力|摆烂|躺平|管不住自己|三分钟热度|计划总是|坚持不了",
    "方向迷茫/不知道想做什么": r"方向迷茫|没有方向|不知道想做|不知道做什么|不知道学什么|不知道适合|不知道自己想|未来迷茫|人生迷茫|很迷茫|好迷茫|出路迷茫|没有目标|找不到方向|不知道以后",
    "心理：焦虑/抑郁/自我否定": r"焦虑|抑郁|自我否定|想死|自杀|崩溃|情绪低落|心理咨询|确诊|休学|复学|孤独|意义感|厌学|开学焦虑|想退学|自我怀疑|内耗|心态崩",
    "竞赛/科研/学生工作": r"竞赛|大创|科研|实验室|学生会|社团|科创|数模|挑战杯|互联网\+|团委|学生工作",
    "求职/秋招/offer": r"秋招|春招|校招|offer|投简历|面试挂|0\s*offer|找不到工作|就业",
    "实习": r"实习|暑期实习|日常实习|找不到实习",
    "职业方向/技能/转行": r"转行|转码|转产品|技能|培训班|职业规划|就业方向",
    "课程/考试/挂科/绩点": r"挂科|补考|重修|绩点|GPA|期末|水课|压分|学分|课业",
    "考研/二战": r"考研|二战|三战|研友|复试|初试",
    "选专业/转专业/专业不喜欢": r"转专业|选专业|专业不喜欢|别来学|劝退|专业选错|跨专业",
    "学校管理/规章": r"查寝|收手机|晨跑|早晚自习|综测|强制|封寝|违纪|处分|校规|形式主义|签到扣分",
    "宿舍与生活条件": r"宿舍|没空调|六人间|八人间|上下铺|停水|停电|食堂|住宿",
    "经济压力/生活费": r"生活费|学费|乱收费|没钱|经济压力|助学贷款|兼职",
    "专升本/学历提升": r"专升本|专科|提升学历",
    "保研/推免": r"保研|推免|夏令营|预推免",
    "学历/出身/歧视": r"双非|学历歧视|第一学历|被筛|卡学历|性别歧视",
    "家庭/父母": r"父母|家里|家长|爸妈|家庭压力|原生家庭",
    "考公/考编/体制内": r"考公|考编|体制内|公务员|事业单位|选调|不想当老师",
    "留学/出国": r"留学|出国|雅思|托福|GRE|申请季",
}

# Zhihu spreadsheet uses an older theme code scheme
ZH_TH = {
    "T01": "T01",
    "T02": "T02",
    "T03": "T03",
    "T04": "T08",
    "T05": "T09",
    "T06": "T09",
    "T07": "T05",
    "T08": "T04",
    "T09": "T04",
    "T10": "T12",
    "T11": "T01",
    "T12": "T15",
    "T13": "T13",
    "T14": "T14",
    "T15": "T15",
    "T16": "T03",
    "T17": "T07",
    "T18": "T28",
    "T19": "T07",
    "T20": "T10",
    "T21": "T25",
    "T22": "T06",
    "T23": "T16",
    "T24": "T24",
    "T26": "T26",
}


def load_html(path: Path) -> dict:
    html = path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'<script[^>]*id=["\']dashboard-data["\'][^>]*>(.*?)</script>', html, re.S)
    if not m:
        m = re.search(r'<script type="application/json"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise SystemExit("dashboard-data JSON not found in HTML")
    return json.loads(m.group(1).strip())


def remap_scenes(old_scenes: list[str], old_idxs: list[int], text: str, si: dict[str, int]) -> list[int]:
    kw_re = {k: re.compile(v) for k, v in KW.items()}
    out: set[int] = set()
    for i in old_idxs or []:
        if not (0 <= i < len(old_scenes)):
            continue
        name = old_scenes[i]
        if name in DIRECT:
            for s in DIRECT[name]:
                out.add(si[s])
        elif name == "导师/论文/延毕":
            hit_m = kw_re["导师/老师关系"].search(text)
            hit_p = kw_re["毕业论文/延毕"].search(text)
            if hit_m:
                out.add(si["导师/老师关系"])
            if hit_p:
                out.add(si["毕业论文/延毕"])
            if not hit_m and not hit_p:
                out.add(si["导师/老师关系"])
                out.add(si["毕业论文/延毕"])
        elif name == "室友/同学/恋爱":
            hit_l = kw_re["恋爱/情感"].search(text)
            if hit_l:
                out.add(si["恋爱/情感"])
            if kw_re["室友/同学/人际关系"].search(text) or not hit_l:
                out.add(si["室友/同学/人际关系"])
        elif name == "心理/情绪/状态":
            out.add(si["心理：焦虑/抑郁/自我否定"])
            if kw_re["自律/拖延/执行力"].search(text):
                out.add(si["自律/拖延/执行力"])
            if kw_re["方向迷茫/不知道想做什么"].search(text):
                out.add(si["方向迷茫/不知道想做什么"])
    for s in (
        "竞赛/科研/学生工作",
        "自律/拖延/执行力",
        "方向迷茫/不知道想做什么",
        "恋爱/情感",
        "毕业论文/延毕",
        "导师/老师关系",
    ):
        if kw_re[s].search(text):
            out.add(si[s])
    return sorted(out)


def enrich(post: dict, si: dict[str, int]) -> None:
    text = (post.get("t") or "") + "\n" + (post.get("q") or "")
    sc = set(post.get("sc") or [])
    if post.get("th") == "T03":
        sc.add(si["方向迷茫/不知道想做什么"])
    for name, pat in KW.items():
        if re.search(pat, text):
            # only add fine-grain / rescue tags lightly for non-empty
            if name in (
                "方向迷茫/不知道想做什么",
                "自律/拖延/执行力",
                "恋爱/情感",
                "竞赛/科研/学生工作",
                "心理：焦虑/抑郁/自我否定",
            ) or not sc:
                sc.add(si[name])
    if not sc:
        for name, pat in KW.items():
            if re.search(pat, text):
                sc.add(si[name])
    post["sc"] = sorted(sc)


def map_zh_theme(th_str: str, text: str) -> str | None:
    th_str = (th_str or "").strip()
    if not th_str:
        return None
    code = th_str.split()[0]
    if code == "T27":
        if re.search(r"查寝|收手机|早八|签到|形式主义|综测|强制|晨跑|辅导员", text + th_str):
            return "T17"
        return "T27"
    return ZH_TH.get(code)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True)
    ap.add_argument("--zhihu", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    D = load_html(args.html)
    old_scenes = list(D["scenes"])
    si = {s: i for i, s in enumerate(NEW_SCENES)}

    for p in D["posts"]:
        text = (p.get("t") or "") + "\n" + (p.get("q") or "")
        p["sc"] = remap_scenes(old_scenes, p.get("sc") or [], text, si)
    D["scenes"] = NEW_SCENES

    wb = openpyxl.load_workbook(args.zhihu, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    H = {h: i for i, h in enumerate(rows[0])}
    existing_txt = {(p.get("s"), (p.get("t") or "")[:80]) for p in D["posts"]}
    existing_ids = {p.get("id") for p in D["posts"]}

    for r in rows[1:]:
        text = (r[H["原文"]] or "").strip()
        if not text or len(text) < 8:
            continue
        title = (r[H["所在帖子/视频标题"]] or "") or ""
        url = (r[H["原链接"]] or "") or ""
        key = ("zhihu", text[:80])
        if key in existing_txt:
            continue
        pid = "zhihu_" + hashlib.md5((url or text[:120]).encode()).hexdigest()[:12]
        if pid in existing_ids:
            continue
        th = map_zh_theme(str(r[H["主题"]] or ""), text + "\n" + str(title))
        inten = r[H["情绪强度(1-3)"]]
        if inten is None:
            inten = 3 if re.search(r"崩溃|想死|绝望|抑郁", text) else (
                2 if re.search(r"求助|怎么办|迷茫|焦虑", text) else 1
            )
        else:
            try:
                inten = int(inten)
            except Exception:
                inten = 2
        st = []
        if re.search(r"大一|新生|入学", text):
            st.append(0)
        if re.search(r"大二", text):
            st.append(1)
        if re.search(r"大三", text):
            st.append(2)
        if re.search(r"大四|毕业季|应届", text):
            st.append(3)
        if re.search(r"研[一二三]|研究生|读研", text):
            st.append(4)
        post = {
            "id": pid,
            "s": "zhihu",
            "k": "post",
            "t": text[:2000],
            "q": str(title)[:200],
            "u": url,
            "d": None,
            "th": th,
            "sc": remap_scenes(old_scenes, [], text + "\n" + str(title), si),
            "st": st,
            "ty": [],
            "em": inten,
            "vo": "ask" if ("？" in text or "?" in text or "怎么办" in text) else "vent",
            "gr": [],
            "gm": [],
        }
        D["posts"].append(post)
        existing_ids.add(pid)
        existing_txt.add(key)
    wb.close()

    for p in D["posts"]:
        enrich(p, si)

    D["sources"]["zhihu"] = {
        "label": "知乎",
        "color": "#0084ff",
        "kind": "post",
        "ctx": "所在问题/回答：",
        "note": "知乎：新抓取样本并入主口径；主题按旧标注语义映射到本版 T01–T28，场景按 23 类分类表标注。",
        "supp": False,
    }

    by_src = Counter(p["s"] for p in D["posts"])
    n_final = len(D["posts"])
    zhihu_n = by_src["zhihu"]
    funnel_by = {f["src"]: f for f in D["funnel"]}
    funnel_by["zhihu"] = {
        "src": "zhihu",
        "raw": zhihu_n,
        "cleaned": zhihu_n,
        "relevant": zhihu_n,
        "kept": zhihu_n,
        "final": zhihu_n,
    }
    order = [
        "tieba",
        "collegeschat",
        "nowcoder",
        "bilibili",
        "x",
        "v2ex",
        "sxjyt",
        "hupu",
        "eeban",
        "haoxinqing",
        "douban",
        "xinli001",
        "bili_article",
        "zhihu",
    ]
    D["funnel"] = [funnel_by[s] for s in order if s in funnel_by] + [
        funnel_by[s] for s in funnel_by if s not in order
    ]

    D["meta"]["n_final"] = n_final
    D["meta"]["n_themed"] = sum(1 for p in D["posts"] if p.get("th"))
    D["meta"]["n_scenes"] = len(NEW_SCENES)
    D["meta"]["scene_note"] = "场景已按产品分类表重标为 23 类（原 LLM 场景映射 + 关键词细分）。"
    if "totals" in D:
        D["totals"]["zhihu"] = zhihu_n
        D["totals"]["all"] = n_final
    D.setdefault("share", {}).setdefault("headline", {})
    for s, n in by_src.items():
        D["share"]["headline"][s] = round(100.0 * n / n_final, 1)

    th_count = Counter(p["th"] for p in D["posts"] if p.get("th"))
    for t in D["themes"]:
        c = th_count.get(t["code"], 0)
        t["n"] = c
        t["n_all"] = c
        if t.get("prec") is not None:
            t["est"] = round(c * t["prec"])

    concl = D["sections"].get("conclusion", "")
    for a, b in [
        ("心理/情绪/状态", "心理：焦虑/抑郁/自我否定"),
        ("室友/同学/恋爱", "室友/同学/人际关系"),
        ("导师/论文/延毕", "导师/老师关系与毕业论文/延毕"),
        ("学历门槛/歧视", "学历/出身/歧视"),
        ("收费/生活费/经济", "经济压力/生活费"),
        ("课程/考试/挂科", "课程/考试/挂科/绩点"),
        ("选专业/转专业", "选专业/转专业/专业不喜欢"),
        ("证件/档案/手续", "学校管理/规章（证件档案）"),
        ("小红书、知乎、抖音、微博未覆盖", "小红书、抖音、微博未覆盖（知乎已纳入新抓取样本）"),
        ("知乎未覆盖", "知乎已纳入"),
    ]:
        concl = concl.replace(a, b)
    D["sections"]["conclusion"] = concl

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(D, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {args.out} n_final={n_final} zhihu={zhihu_n} scenes={len(NEW_SCENES)}")


if __name__ == "__main__":
    main()
