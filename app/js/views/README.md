# views/

目标：把 `../core.js` 里各 Tab 的 `render*` 逐步拆到本目录。

建议文件：
- overview.js
- themes.js
- heat.js
- types.js
- gap.js
- sit.js
- report.js
- explorer.js

约定：只从 `../core.js` / `../util.js` 导入共享状态与工具，避免循环依赖。
当前 Gap 已在 `core.js` 内按「全量规则为主、人工样本为辅」重写；后续优先抽出 `gap.js`。
