# 大学生吐槽爬虫工具 · Mac 运行指南

> 给陈慧欣：在你自己的 Mac 上跑（云服务器 IP 会被各平台拦截，家里宽带/校园网才行）

## 一、准备（只做一次，约3分钟）

1. 解压 `tucao-tool.zip`，得到 `tool/` 文件夹
2. 打开终端，进入目录：
   ```bash
   cd tool/
   ```
3. 装依赖：
   ```bash
   pip3 install requests pyyaml
   ```
   （如果提示 pip3 找不到，先装 Python 3：去 python.org 下，或 `brew install python3`）

## 二、直接开跑（B站 + 贴吧，约2900条，不需要任何账号）

```bash
python3 main.py
```

- 跑的时候终端会实时打印进度，每个平台结束会显示抓了多少条
- 数据落在 `tool/data/raw/` 里（按启用的平台写入 JSONL）
- 想停就 Ctrl+C，已抓的数据不会丢；**想继续就再跑一次 `python3 main.py`，会自动跳过已抓的**（断点续爬）
- 遇到 403/412/验证码会立刻停手并告诉你，这是保护机制，别硬重跑，换个时间段再试
- 贴吧默认走公开 WAP 入口；`config.yaml` 中只有显式设置 `wap: false` 才会尝试 PC 入口。

## 三、加量：豆瓣（需要1分钟）

1. 浏览器打开「985废物引进计划」豆瓣小组主页
2. 把网址里 `https://www.douban.com/group/` 后面的**数字**复制下来
3. 打开 `config.yaml`，找到 douban 那段，把 `985废物引进计划` 换成数字：
   ```yaml
   groups:
     - 1234567
   ```
4. 再跑 `python3 main.py`

## 四、可选：知乎（经授权的登录态，不属于公共采集模式）

公共采集保持 `zhihu.enabled: false`。只有确认数据使用范围并获得账号持有人授权后，才执行以下步骤；
采集器不会绕过登录、验证码或风控。

1. 电脑浏览器登录知乎，**手动过一次验证码**（只此一次）
2. 按 F12 → Application → Cookies → 找到 `z_c0`，复制它的值
3. 终端里设置（每次开新终端跑之前执行一次）：
   ```bash
   export ZHIHU_COOKIE="z_c0=你复制的值"
   ```
4. 找 2~3 个吐槽向问题，把问题网址里 `https://www.zhihu.com/question/` 后面的数字填进 `config.yaml`：
   ```yaml
   zhihu:
     enabled: true
     question_ids: [111111, 222222]
   ```
   推荐搜：「大学里最让你痛苦的事情是什么」「当代大学生最焦虑的是什么」「你在大学最后悔的事是什么」
5. 再跑 `python3 main.py`

## 五、想多抓 / 少抓

改 `config.yaml` 里每个平台的 `target_count` 数字，保存后重跑即可。`enabled: false` 可跳过某个平台。

## 六、数据在哪

- `tool/data/raw/<平台>.jsonl`：原始数据，每行一条
- 字段：平台、来源、标题、正文、发布时间、点赞数、评论数、原链接、抓取时间
- 固定字段和类型见 `output_schema.json`；来源、公开采集边界和阻塞状态见
  `source_manifest.yaml`
- 抓完把整个 `data/` 文件夹发给 Coco，她做聚类分析和报告

## 常见问题

- **Q: 跑着跑着停了，显示熔断/403？**
  A: 被平台限流了。等几小时再跑（checkpoint 会接着之前的进度，不会重复）。
- **Q: 知乎显示"缺少登录 cookie"？**
  A: 按第四步设置 `ZHIHU_COOKIE` 环境变量后再跑。
- **Q: 豆瓣显示"请填数字ID"？**
  A: 按第三步把小组名换成数字 ID。
