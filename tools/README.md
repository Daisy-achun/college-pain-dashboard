# 大学生吐槽爬虫工具

采集多个平台大学生吐槽内容做聚类分析的工具框架。
当前已实现的模块：**B站**、`豆瓣小组`、`贴吧`、`知乎`（知乎默认关闭，需要经授权的登录态，
不属于公共采集模式）。来源状态和接入边界见 [`source_manifest.yaml`](source_manifest.yaml)，
输出字段契约见 [`output_schema.json`](output_schema.json)。

## 目录结构

```
tool/
├── config.yaml # 平台开关 / 关键词 / 目标条数 / 抓取间隔 / 重试次数
├── source_manifest.yaml # 来源清单、公开采集边界和已知阻塞状态
├── output_schema.json # data/raw/*.jsonl 的固定字段 JSON Schema
├── main.py # 主入口：读配置 -> 逐平台抓取 -> 去重 -> 落盘 -> 更新 checkpoint
├── README.md
├── crawlers/
│ ├── __init__.py
│ ├── common.py # 公共：UA 轮换、随机延迟、重试、反爬熔断（AntiCrawlStop）
│ ├── bilibili.py # B站：搜索(wbi签名) -> view拿aid -> reply/main拉评论
│ ├── douban.py # 豆瓣小组：discussion列表 -> topic详情拿正文+热评
│ ├── tieba.py # 贴吧：公开 WAP/PC 列表 -> 帖子正文
│ └── zhihu.py # 知乎：经授权 cookie 的问题 -> 回答（默认关闭）
└── data/
├── raw/
│ ├── bilibili.jsonl # B站数据（JSON Lines，每行一条）
│ ├── douban.jsonl # 豆瓣数据
│ └── tieba.jsonl # 贴吧数据
└── checkpoint.json # 各平台已抓 ID（断点续爬用）
```

## 运行

```bash
cd tool/
python3 main.py
```

依赖：`requests`、`pyyaml`（+ 标准库）。检查：`python3 -c "import requests, yaml"`，
缺失则 `pip install requests pyyaml`。

## config.yaml 怎么改

```yaml
global:
delay_min: 1 # 每次请求前随机延迟下限（秒）
delay_max: 3 # 随机延迟上限（秒）
retries: 3 # 网络抖动/5xx 重试次数（403/412/429/验证码不重试，直接停手）

platforms:
bilibili:
enabled: true # false 则跳过该平台
keywords: [大学生吐槽, 大学牲, 考研崩溃, 秋招, 选专业后悔]
target_count: 800 # 按评论计
search_pages_per_keyword: 5
comment_pages_per_video: 3 # 每页约 20 条评论
mode: 3 # 3=热度排序，2=时间排序
douban:
enabled: true
groups: [985废物引进计划] # 填数字 ID；小组名无法免登录解析（见下）
target_count: 600 # 按帖子计
hot_comments_per_topic: 5
list_pages_per_group: 24 # 每页 25 帖
tieba:
enabled: true
bars: [转专业吧, 专升本吧, 考研吧, 挂科吧, 大学吧, 大一吧, 专科吧, 二本吧, 双非吧, 考公吧, 保研吧, 大学生心理吧, 毕业生吧]
target_count: 2500 # 按帖子计
wap: true # 默认走公开 WAP；PC 端需显式改为 false
```

**豆瓣小组 ID 怎么填**：豆瓣免登录搜索需要登录，模块无法按小组名自动解析。
请在浏览器打开目标小组主页，把 URL 中的数字 ID 填入 `groups`
（模块会打开小组主页校验名字，校验失败会跳过并提示）。

## checkpoint 机制（断点续爬）

- `data/checkpoint.json` 记录各平台已抓 ID：
B站用 `bilibili:<评论rpid>`，豆瓣用 `douban:<帖子topic_id>`。
- 每次运行：模块先读 checkpoint，已抓 ID 自动跳过；新抓到的 ID 追加进去。
- 数据文件 `data/raw/<平台>.jsonl` 是**追加写入**，不会覆盖历史数据；
落盘前按（平台+原链接）去重，重复运行不会产生重复行。
- 想从头重抓：删掉 `data/raw/<平台>.jsonl` 和 `checkpoint.json` 里对应平台的 ID 列表。

## 数据字段（固定中文键）

每个 JSONL 行必须符合 `output_schema.json`。Schema 只允许以下 9 个公开数据字段；
内部 checkpoint ID 不会落盘。

| 字段 | B站口径 | 豆瓣口径 |
|---|---|---|
| 平台 | B站 | 豆瓣 |
| 来源 | 搜索关键词 | 小组名 |
| 标题 | 视频标题 | 帖子标题 |
| 正文 | 评论内容 | 帖子正文 + 附带的热评（``分隔） |
| 发布时间 | 评论时间 | 发帖时间 |
| 点赞数 | 评论点赞数 | 所附热评点赞数之和（帖子本身无公开点赞数） |
| 评论数 | 视频总评论数 | 帖子总回复数 |
| 原链接 | 视频链接 + `#reply<rpid>`（每条评论唯一） | 帖子链接 |
| 抓取时间 | 抓取时刻 | 抓取时刻 |

## 反爬与行为准则

- 随机延迟 1–3 秒（豆瓣默认 2–4 秒）、每次请求轮换 UA、网络/5xx 失败重试 3 次。
- **熔断**：遇到 HTTP 403/412/429 或响应中出现验证码/风控特征，
立刻抛 `AntiCrawlStop`、打印反爬熔断报告、保留已抓数据停手——不重试、不换手段硬绕。
- **只读不写**：全程只有 GET 请求，绝不发帖、私信、点赞、关注。
- **公共页面边界**：不绕过登录、验证码、风控或权限；遇到认证页、验证码、403/412/429
  立即停止当前平台，不自动换入口、换 IP 或重试硬绕。知乎当前需要 cookie，公共模式保持关闭。

### 来源状态清单

| 平台 | 公共入口 | 默认状态 | 当前阻塞 |
|---|---|---|---|
| B站 | 搜索、视频信息、评论公开接口 | 开启 | 当前出口探针曾遇 HTTP 412 |
| 豆瓣 | 已知数字小组的公开列表/帖子页 | 开启 | 发现页可能要求登录，后续请求可能 403 |
| 贴吧 | WAP 吧列表和公开帖子页 | 开启（WAP） | PC 列表页常返回安全验证空壳 |
| 知乎 | 问题/回答接口 | 关闭 | 需要登录 cookie，不纳入公共采集模式 |

## 已知阻塞（2026-10-08 实测）

- **B站**：探针第 1 个请求（取 wbi key）通过，第 2 个请求（站内搜索）返回 **HTTP 412**
——数据中心出口 IP 被风控。已按规则立即停手，未采集到数据。
- **豆瓣**：小组搜索/发现页要求登录（error 008）；帖子页首次 200、随后多次 403
并出现连接超时——同一出口 IP 被限流。已停手，未采集到数据。
- 两个模块的代码逻辑（签名、解析、字段映射、熔断）均已通过单元测试；
换到非数据中心网络（如个人宽带）后直接 `python3 main.py` 即可跑通。
豆瓣 `groups` 需先填入真实数字 ID（见上）。
