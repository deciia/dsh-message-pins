# dsh-message-pins

收藏 DeepSeek Harness（DSH）回答的插件：**收藏整条回答**，也支持**选中一句话/一段话收藏**，并把内容落盘为 Markdown（本地目录或 Obsidian 仓库）。

适配 DSH 0.2.x（开发与验证版本：0.2.2-rc.1）。

## 功能

- **五角星收藏**：每条已完成回答的操作条上有一个 ☆ 按钮，一键收藏/取消
- **选中文字收藏**：在任意回答里划选一段文字，选区右侧出现圆形 ☆ 图标，点击即可收藏该句/该段
- **右侧栏「收藏」标签**：在 DSH 现有右侧栏中打开收藏列表（`sidebarRightTabs` 官方 API），支持搜索、按会话筛选、导出
- **会话视图「收藏」页签**：顶部视图栏（对话 / 轨迹 / 上下文 / 编队 / **收藏**）
- **笔记与标签**：展开收藏后可填写笔记、标签，写回 Markdown frontmatter
- **跨会话收藏中心**：搜索标题 / 内容 / 标签 / 笔记
- **一键导出**：把全部收藏导出为 Markdown 文件
- **引用跳回原文**：引用类收藏可「跳到原文」，滚动到对应消息并高亮 4.5 秒
- **两种保存方式**：
  - 本地目录（默认）：`<DSH_HOME>/storages/message-pins/pins/`
  - Obsidian 仓库：仓库根 + 相对目录（默认 `DSH 收藏/回答收藏`），可在插件详情页设置
- **左栏入口可选**：默认隐藏，可在插件详情页打开

## 安装

1. DSH → 设置 → 插件 → 添加 / 安装插件，选择本仓库地址（或本地路径）
2. 安装后重启 DSH 使宿主半区加载
3. 打开任意对话，回答下方应出现 ☆；划选文字应出现圆形 ☆

## 配置

插件详情页「收藏设置」：

| 项 | 说明 |
|---|---|
| 保存方式 | 「本地目录」或「Obsidian 仓库」，点选即保存 |
| 仓库根 | Obsidian 仓库根目录（仅 Obsidian 模式） |
| 保存目录 | 相对仓库根的目录（仅 Obsidian 模式） |
| 左栏入口 | 是否在左侧栏显示收藏入口（默认关闭） |
| 当前保存到 | 实时显示实际落盘路径 |

宿主配置保存于 `~/.dsh/storages/message-pins-config.json`。首次使用时：

- 若本机已存在旧版收藏目录（`C:/Sync/datas/moonlightGarden/20-卡片/回答收藏`），自动沿用 Obsidian 模式
- 否则默认本地目录模式

## 数据格式

每条收藏是一个 Markdown 文件：

```yaml
---
title: 标题
created: ISO 时间
source: dsh
sessionId: 会话 id
messageId: 消息 id
type: answer-pin | quote-pin
tags: ["标签"]
note: "笔记"
# 引用类额外字段
flowKey: 消息行标识
offset: 文本偏移
prefix: 前文
suffix: 后文
quote: 原文
---

# 标题

正文（引用类为 `> 原文`）
```

## 开发

```
lib/index.js   宿主半区：webServer 路由、配置、读写文件、sessionQuery 取回答原文
lib/client.js  浏览器半区：星标按钮、选区图标、右栏/视图面板、设置区
cordis.patch.yml  bundle 补丁
```

改完源码后需同步到 profile 的 `node_modules/dsh-message-pins`（或以文件依赖安装），宿主改动需重启 DSH。

## 参考与致谢

本插件参考并合并了以下三个实现：

| 项目 | 作者 | 许可证 | 借鉴内容 |
|---|---|---|---|
| [dsh-bookmarks](https://github.com/penguin-oo/dsh-bookmarks) | penguin-oo | **MIT** | 逐条笔记与标签、跨会话收藏中心、一键 Markdown 导出 |
| [dsh-pins](https://github.com/ylw-ux/dsh-pins-fixtool) | ylw-ux | **MIT** | 右侧栏收藏面板、文本选区浮条与跳回原文的交互形态 |
| message-pins（未公开） | 本项目作者 | 自有 | 最初的五角星收藏 + Obsidian 落盘实现 |

两个上游项目均为 MIT 许可证，允许使用、复制、修改、合并、发布与再许可，条件是：在任何副本或实质性部分中保留其版权声明与许可声明，并在文档中注明出处。本仓库的「参考与致谢」一节用于满足该署名要求；MIT 许可证全文见 [LICENSE](./LICENSE)。

本插件未复制上述项目的源代码，仅参考其功能设计与公开 API 用法（DSH 插件的槽位、服务与事件），代码为独立实现。

## License

MIT，见 [LICENSE](./LICENSE)。
