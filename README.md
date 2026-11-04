# 大学生成长世界

大学生痛点与需求研究看板（wowland）。

## 目录结构

```
app/                 # 前端看板（日常开发入口）
  index.html
  css/app.css
  js/
    util.js          # 纯工具函数
    core.js          # 状态、筛选、各 Tab 渲染
    main.js          # 启动入口
  vendor/            # echarts / marked / wordcloud
  data/dashboard.json
data/
  raw/               # 原始抓取与表格
  processed/         # 中间产物与 dashboard 备份
docs/                # 报告与方案文档
tools/               # 抓取工具
scripts/             # 一次性处理脚本
archive/             # 旧版 HTML / zip
```

## 本地预览

```bash
cd app
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

## 主口径

自 2026-10-10 起：**全部渠道均为主口径**（含 V2EX、百度贴吧标题）。
顶部开关用于临时排除某渠道，默认全部勾选。

## Gap

- **主分析**：全量规则 gap（随筛选联动，覆盖全库命中标签的帖子）
- **辅助**：人工深读样本（V2EX 已合并进主口径分母）
