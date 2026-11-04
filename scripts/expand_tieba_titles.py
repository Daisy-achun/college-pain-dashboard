#!/usr/bin/env python3
"""把贴吧列表页候选整理成独立证据层，并可选合并进单文件看板。

贴吧 XLSX 是列表页数据，不是正文抓取结果。本脚本始终把输出标记为
``evidence_level=list_title_or_snippet``，并写入看板的 ``k=title`` 数据层；
它不会增加 ``meta.n_final``，也不会参与正文主题计数。

用法：
    python3 expand_tieba_titles.py
    python3 expand_tieba_titles.py --xlsx 贴吧标题_2026-10-08.xlsx \
        --dashboard college_pain_dashboard.html
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET


NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CELL_RE = re.compile(r"([A-Z]+)(\d+)$")
NOISE_RE = re.compile(
    r"招募|吧主|吧规|吧规|公告|管理员|封禁|举报|活动报名|投票|抽奖|推广|广告|加群|私信|出售|代写|兼职招聘"
)
STUDENT_RE = re.compile(
    r"大学|大一|大二|大三|大四|研究生|硕士|博士|考研|保研|专升本|专科|毕业|实习|专业|挂科|宿舍|导师|秋招|就业|考公|考编|四六级|课程|绩点|论文|学校|校园|学生|上岸|复试|转专业|本科|双非|二本|高考"
)


def _column_index(ref: str) -> int:
    letters = CELL_RE.match(ref).group(1)
    out = 0
    for ch in letters:
        out = out * 26 + ord(ch) - 64
    return out - 1


def _cell_value(cell: ET.Element) -> str:
    inline = cell.find(f"{{{NS}}}is")
    if inline is not None:
        return "".join(node.text or "" for node in inline.iter(f"{{{NS}}}t"))
    value = cell.find(f"{{{NS}}}v")
    return value.text if value is not None and value.text else ""


def read_xlsx_rows(path: Path) -> list[dict[str, str]]:
    """Read the first worksheet using only stdlib XML support."""
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    rows: list[list[str]] = []
    for row in root.findall(f".//{{{NS}}}sheetData/{{{NS}}}row"):
        values = [""] * 7
        for cell in row.findall(f"{{{NS}}}c"):
            ref = cell.get("r", "")
            if not CELL_RE.match(ref):
                continue
            idx = _column_index(ref)
            if idx < len(values):
                values[idx] = _cell_value(cell).strip()
        rows.append(values)
    if not rows:
        return []
    headers = rows[0]
    return [dict(zip(headers, row)) for row in rows[1:] if any(row)]


def clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    return value.replace("\u200b", "")


def parse_reply_count(value: str) -> int:
    m = re.search(r"\d+", value or "")
    return int(m.group()) if m else 0


def normalize_row(row: dict[str, str], seen_urls: set[str]) -> tuple[dict, str | None]:
    source = clean_text(row.get("来源", ""))
    title = clean_text(row.get("标题", ""))
    url = clean_text(row.get("原链接", ""))
    summary = clean_text(row.get("列表页原文（含摘要/作者/时间）", ""))
    pinned = clean_text(row.get("置顶", ""))
    replies = parse_reply_count(row.get("回复数", ""))
    if not url:
        return {}, "missing_url"
    if url in seen_urls:
        return {}, "duplicate_url"
    if pinned == "是":
        return {}, "pinned"
    if NOISE_RE.search(title):
        return {}, "notice_or_promo"
    if len(title) < 8:
        return {}, "too_short"
    if replies == 0 and len(title) < 12:
        return {}, "zero_reply_short"
    # 贴吧栏目的上下文本身是学生相关线索；关键词命中用于后续抽检排序。
    relevance = int(bool(STUDENT_RE.search(f"{source} {title}")))
    evidence = {
        "id": "tieba_title_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16],
        "source": "tieba",
        "bar": source,
        "url": url,
        # 列表表格没有原帖发布时间；不要把采集日伪装成发帖日，
        # 否则看板的年份分布会产生人为的 2026 峰值。
        "date": "",
        "text": title,
        "context_title": source,
        "reply_count": replies,
        "pinned": False,
        "evidence_level": "list_title_or_snippet",
        "relevance_score": relevance,
        "collected_at": clean_text(row.get("抓取时间", "")),
        "source_title": title,
        "list_text": summary,
    }
    seen_urls.add(url)
    return evidence, None


def build_evidence(rows: list[dict[str, str]]) -> tuple[list[dict], list[dict], Counter]:
    kept: list[dict] = []
    rejected: list[dict] = []
    reasons: Counter = Counter()
    seen_urls: set[str] = set()
    for row in rows:
        item, reason = normalize_row(row, seen_urls)
        if reason:
            reasons[reason] += 1
            rejected.append({
                "source": clean_text(row.get("来源", "")),
                "title": clean_text(row.get("标题", "")),
                "url": clean_text(row.get("原链接", "")),
                "reply_count": parse_reply_count(row.get("回复数", "")),
                "reason": reason,
            })
        else:
            kept.append(item)
    return kept, rejected, reasons


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_dashboard(path: Path) -> tuple[str, dict, int]:
    html = path.read_text(encoding="utf-8")
    marker = "window.DATA="
    start = html.find(marker)
    if start < 0:
        raise ValueError(f"dashboard missing {marker}")
    data_start = start + len(marker)
    data_end = html.find(";</script>", data_start)
    if data_end < 0:
        raise ValueError("dashboard DATA terminator not found")
    data = json.loads(html[data_start:data_end])
    return html, data, data_start


def merge_dashboard(path: Path, evidence: list[dict]) -> None:
    html, data, data_start = load_dashboard(path)
    existing_urls = {p.get("u") for p in data.get("posts", [])}
    added = []
    for item in evidence:
        if item["url"] in existing_urls:
            continue
        added.append({
            "i": item["id"], "s": "tieba", "u": item["url"], "d": item["date"],
            "t": item["text"], "tl": item["reply_count"], "c": item["bar"],
            "th": None, "st": [], "si": False, "sc": [], "ty": [], "tr": -1,
            "gr": [], "gm": [], "e": 1, "v": -1, "k": "title",
        })
        existing_urls.add(item["url"])
    # 旧版本可能已经把采集日写入 d；统一修正为“日期未知”。
    date_fixed = False
    for post in data.get("posts", []):
        if post.get("k") == "title" and post.get("s") == "tieba":
            if post.get("d"):
                post["d"] = ""
                date_fixed = True
    expected_extra = "source_expansion/tieba_title_evidence.csv"
    current_extra = set(data.get("meta", {}).get("extra_files", []))
    extra_fixed = expected_extra not in current_extra or "tieba_title_evidence.csv" in current_extra
    if not added and not date_fixed and not extra_fixed:
        return
    data.setdefault("posts", []).extend(added)
    data.setdefault("meta", {})["n_titles"] = sum(p.get("k") == "title" for p in data["posts"])
    data["meta"]["built"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    extra_files = set(data["meta"].get("extra_files", []))
    extra_files.discard("tieba_title_evidence.csv")
    extra_files.add("source_expansion/tieba_title_evidence.csv")
    data["meta"]["extra_files"] = sorted(extra_files)
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    end = html.find(";</script>", data_start)
    path.write_text(html[:data_start] + encoded + html[end:], encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, default=Path("贴吧标题_2026-10-08.xlsx"))
    parser.add_argument("--out-dir", type=Path, default=Path("source_expansion"))
    parser.add_argument("--dashboard", type=Path, default=Path("college_pain_dashboard.html"))
    args = parser.parse_args()
    rows = read_xlsx_rows(args.xlsx)
    kept, rejected, reasons = build_evidence(rows)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(args.out_dir / "tieba_title_evidence.csv", kept, list(kept[0].keys()) if kept else [])
    write_csv(args.out_dir / "tieba_title_rejected.csv", rejected, ["source", "title", "url", "reply_count", "reason"])
    quality = {
        "input": str(args.xlsx), "input_rows": len(rows), "kept_rows": len(kept),
        "rejected_rows": len(rejected), "unique_urls": len({x["url"] for x in kept}),
        "reply_count_nonzero": sum(x["reply_count"] > 0 for x in kept),
        "reasons": dict(reasons),
        "kept_by_bar": dict(Counter(x["bar"] for x in kept)),
        "evidence_level": "list_title_or_snippet",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    (args.out_dir / "tieba_title_quality.json").write_text(json.dumps(quality, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.dashboard.exists():
        merge_dashboard(args.dashboard, kept)
    print(json.dumps(quality, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
