#!/usr/bin/env python3
"""大学生吐槽爬虫工具 —— 主入口。

流程：读 config.yaml -> 逐平台 import crawlers.<平台> 调 crawl(cfg)
    -> 按（平台+原链接）去重 -> 追加写入 data/raw/<平台>.jsonl
    -> 更新 data/checkpoint.json（断点续爬：已抓 ID 自动跳过）。

运行：cd tool/ && python3 main.py
"""

import importlib
import json
import os
import sys

import yaml

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from crawlers.common import AntiCrawlStop  # noqa: E402

# 对外固定字段（中文键），模块内部的 _id 在落盘前剔除
FIELDS = ["平台", "来源", "标题", "正文", "发布时间",
          "点赞数", "评论数", "原链接", "抓取时间"]


def load_checkpoint(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            return {k: v for k, v in data.items() if isinstance(v, list)}
    return {}


def save_checkpoint(path, checkpoint):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def main():
    cfg_path = os.path.join(BASE, "config.yaml")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    raw_dir = os.path.join(BASE, "data", "raw")
    os.makedirs(raw_dir, exist_ok=True)
    ckpt_path = os.path.join(BASE, "data", "checkpoint.json")
    checkpoint = load_checkpoint(ckpt_path)

    summary = {}
    for name, pcfg in (cfg.get("platforms") or {}).items():
        if not pcfg.get("enabled", False):
            print(f"[跳过] 平台 {name} 未启用（config.yaml 里 enabled: false）")
            continue
        print(f"\n===== 平台 {name} 开始 =====")
        try:
            mod = importlib.import_module(f"crawlers.{name}")
        except ImportError as e:
            print(f"[{name}] 模块加载失败：{e}，跳过")
            continue

        mod_cfg = dict(pcfg)
        mod_cfg["global"] = cfg.get("global", {})
        mod_cfg["checkpoint"] = set(checkpoint.get(name, []))
        before = len(mod_cfg["checkpoint"])
        print(f"[{name}] checkpoint 已有 {before} 条已抓 ID，本次自动跳过")

        try:
            rows = mod.crawl(mod_cfg) or []
        except AntiCrawlStop as e:
            print(f"[{name}] 熔断（main 层捕获）：{e}")
            rows = []
        except KeyboardInterrupt:
            print(f"[{name}] 用户中断，保留已抓数据")
            rows = []
        except Exception as e:
            print(f"[{name}] 未预期异常 {type(e).__name__}: {e}，保留已抓数据")
            rows = []

        # 去重（平台+原链接）+ 剔除内部 _id + 收集新 ID
        seen, out, new_ids = set(), [], []
        for r in rows:
            rid = r.pop("_id", None)
            key = (r.get("平台"), r.get("原链接"))
            if not r.get("原链接") or key in seen:
                continue
            seen.add(key)
            out.append({k: r.get(k, "") for k in FIELDS})
            if rid:
                new_ids.append(rid)

        if out:
            jsonl = os.path.join(raw_dir, f"{name}.jsonl")
            with open(jsonl, "a", encoding="utf-8") as f:
                for r in out:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            print(f"[{name}] 已追加写入 {jsonl}")

        ids = set(checkpoint.get(name, [])) | set(new_ids)
        checkpoint[name] = sorted(ids)
        save_checkpoint(ckpt_path, checkpoint)
        summary[name] = {"新增": len(out), "累计ID": len(ids)}
        print(f"[{name}] 本次新增 {len(out)} 条，checkpoint 累计 {len(ids)} 个 ID")

    print("\n===== 运行汇总 =====")
    for name, s in summary.items():
        print(f"  {name}: 新增 {s['新增']} 条 / checkpoint 累计 {s['累计ID']} 个 ID")
    print("数据目录：", os.path.join(BASE, "data", "raw"))


if __name__ == "__main__":
    main()
