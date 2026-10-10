# dsh-token-billing

在 DeepSeek Harness 的 dock 行显示本会话花了多少钱（¥）。悬停看摘要，点击展开明细。

## 解决什么问题

DSH 告诉你用了多少 token，但不告诉你花了多少钱，而且这个换算并不直观：缓存读取比未缓存输入便宜一个量级，高峰时段单价翻倍，不同模型之间差几十倍 —— 只看 token 数字判断不出「这一趟贵不贵」。

开了多智能体之后更明显。子智能体和 teammate 是**独立会话**，父会话的用量里不包含它们，所以主界面上那个数字会系统性地低于真实花费，用得越多偏得越远。

这个插件把 token 折算成钱，并把整棵会话树的花费算进来。

## 会不会破坏什么

不会。它不改不写任何会话内容，清单如下：

| | 做了什么 |
| --- | --- |
| 注册 | dock 行**一个槽位**（`conversation.composer.dock`）+ Host 侧**一个只读路由** `/plugins/dsh-token-billing/balance` |
| 读取 | 会话投影里的 token 用量、模型路由、子智能体目录 |
| 写入 | 一个 `<style>` 标签（停用时移除）+ 一个 localStorage key（价格表缓存，24 小时 TTL，可随时删） |
| 网络 | 只有两个：models.dev 取公开价目表、DeepSeek 官方 `user/balance` |
| 不碰 | 你的会话内容、DSH 内核、其他插件；Host 半边零运行时 import |

**API key 不进浏览器** —— 余额请求由 Host 半边代发，用的是 Host 凭据库里的 key，浏览器只拿到数字。那个路由带信任围栏：只接受 loopback 或受信 host，拒绝跨站的 `sec-fetch-site`，并校验 `origin`，所以网页里的第三方站点借不到它去读你的余额。

卸载或禁用后槽位、路由、样式标签都随之移除。

## 显示什么

- **胶囊** —— `¥5.26 / ¥29.66`：本会话预估费用 / 账户余额。会话运行中追加脉冲点与已运行秒数。
- **悬停卡片** —— 模型、四个计费桶、合计。
- **明细面板** —— 按未缓存输入 / 缓存读取 / 缓存写入 / 输出拆分 token 与金额，末尾是账户余额。每百万 token 单价默认收起，点按钮展开，高峰 / 低谷自动切换。
- **子智能体** —— 点 `子智能体` 一行，在面板左侧弹出卡片，逐个列出 agent 的花费。

## 安装

在 DSH 的「添加插件」里填仓库地址：

```
https://github.com/eivmosn/dsh-token-billing
```

或命令行：

```bash
dsh plugin add github:eivmosn/dsh-token-billing
```

仓库已带构建好的 `lib/`，安装不需要编译、不需要放行构建脚本、也不会装 devDependencies。

## 是估算，不是账单

价格表来自 models.dev 的公开挂牌价，可能与你的实际计费口径不同。另外两处已知偏差：

- 同一个会话**中途换过模型**时，该会话全部 token 按最后的路由计价；
- **峰谷**按渲染当下的时段判定，上限 2×。

消除这两项需要逐请求归因（在 Host 侧注册投影折叠事件流），本插件没做 —— 有这些误差在，请别把它当账对。

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
