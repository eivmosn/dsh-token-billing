# dsh-token-billing

DeepSeek Harness 客户端插件：在输入框底部的 dock 行显示本会话的预估费用（¥），悬停看摘要，点击展开明细。

费用是**估算**。DSH 本身没有计费概念，本插件把 Host 上报的 token 用量按 models.dev 的公开挂牌价折算，不是账单。

## 显示什么

- **胶囊** —— `¥5.26 / ¥29.66`：本会话预估费用 / 账户余额。会话运行中追加脉冲点与已运行秒数。
- **悬停卡片** —— 花费摘要：模型、四个计费桶、合计。
- **明细面板** —— 按未缓存输入 / 缓存读取 / 缓存写入 / 输出拆分 token 与金额，末尾是账户余额。每百万 token 单价默认收起，点按钮展开成独立卡片，高峰 / 低谷自动切换。
- **子智能体** —— 点 `子智能体` 一行，在面板左侧弹出卡片，逐个列出 agent 的花费。

价格表来自 models.dev，按 24 小时缓存在 localStorage。账户余额由 Host 半边代理官方 `user/balance` 接口：API key 只存在 Host 凭据库里，浏览器读不到。

## 安装

在 DSH 的「添加插件」里填仓库地址：

```
https://github.com/eivmosn/dsh-token-billing
```

或命令行：

```bash
dsh plugin add github:eivmosn/dsh-token-billing
```

仓库已带构建好的 `lib/`，所以安装不需要编译、不需要放行构建脚本、也不会装 devDependencies。

## 费用是怎么算的

每个会话按**它自己的**模型路由计价：

- 子智能体 / teammate 是**独立会话**，父会话的用量不包含它们 —— 沿 `parentId` 走完整棵后代树，逐个按各自路由计价再相加。还没上报用量的会话标为「未上报」，不静默丢弃。
- **已知误差**：同一会话中途换过模型时，全部 token 按最后的路由计价；峰谷按渲染当下判定，上限 2×。消除这两项需要在 Host 侧注册投影做逐请求归因，本插件没做。

## 开发

```bash
pnpm install
pnpm dev      # tsdown --watch
pnpm check    # typecheck → oxlint → build → test
pnpm preview  # 渲染明/暗预览页并截图
```

TypeScript + tsdown + oxlint + vitest。Host 半边是不含任何运行时 import 的 ESM；client 半边是浏览器 CJS 闭包工厂；样式写在真实 `.css` 文件里，构建期内联进 bundle。

改了 `src/` 请跑一次 `pnpm check` 再提交 —— 它内含构建，会刷新被跟踪的 `lib/`。

## License

MIT
