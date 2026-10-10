# dsh-token-billing

DeepSeek Harness 插件：在输入框底部的 composer dock 行末尾追加一个实时计费 chip，显示本会话的预估费用（¥）。悬停显示金额与计价依据，点击展开明细面板（各计费桶的 token 与金额、每百万 token 单价、高峰/低谷时段、账户余额）。

费用是**估算**：DSH 本身没有计费概念，本插件把 Host 上报的精确 token 桶按 models.dev 公开挂牌价折算，不是账单。

## 功能

| 状态 | 显示 |
| --- | --- |
| 无用量 | 不渲染任何内容 |
| 价格表未就绪 | `¥ —`（附一句说明与自动重试） |
| 该模型无挂牌价 | `¥ ?` |
| 正常 | `¥0.42`，超过 ¥5 转为红色 |
| 会话运行中 | 金额后追加脉冲点与已运行秒数 |

账户余额走 Host 半边的 `/plugins/dsh-token-billing/balance` 路由：API key 存在 Host 凭据库里，浏览器永远读不到，因此由 Host 代为调用官方 `user/balance` 接口，只把数字交给浏览器。

## 工程结构

```
src/
  index.ts           Host 半边：注册受信任围栏保护的余额路由
  client.ts          浏览器半边：计费 chip 组件与两个共享 store
  billing.ts         纯计费域：价格表、成本模型、时段判断、金额格式化、两侧余额报文的校验
  context-types.ts   本插件消费的 cordis 服务面的结构化镜像（纯类型）
  styles.ts          样式表与一次性注入
test/
  billing.test.ts    纯计费域
  host.test.ts       信任围栏与路由状态阶梯
  bundle.test.ts     构建产物：ModuleLoader 契约、外部依赖、slot 注册、SSR 冒烟渲染
```

产物（`pnpm build`，均不入库）：

```
lib/index.js        Host 半边，ESM，无任何运行时 import
lib/index.d.ts      上面这半的类型
lib/client.js       浏览器半边，ModuleLoader 闭包工厂
lib/client.js.map
```

## 开发

```bash
pnpm install
pnpm build        # tsdown 打包两侧
pnpm dev          # tsdown --watch
pnpm typecheck    # tsc --noEmit
pnpm lint         # oxlint
pnpm lint:fix
pnpm test         # vitest run（需先 build，bundle 测试读 lib/）
pnpm check        # typecheck → lint → build → test
```

技术栈：**TypeScript**（全程 `.ts`，无 JS 源文件）、**tsdown**（rolldown）+ 类型声明生成、**oxlint**、**vitest**。

## 构建契约

两个半边没有任何共同点，只有一个名字，所以 `tsdown.config.ts` 是两个独立配置：

- `lib/index.js` 是给 Node 的普通 ESM，由 DSH loader 加载。它**不 import 任何东西**——包括 `@deepseek-ai/*`：这些包由 DSH loader 自己的模块图提供，从 profile 里安装的插件中 `require` 会直接 `MODULE_NOT_FOUND`。所以 Host 半边消费的服务面（`credentials` / `webServer` / `webRuntime`）在 `context-types.ts` 里以结构化镜像声明，一眼能读完。

- `lib/client.js` 是浏览器半边。浏览器模块系统不加载 ESM，而是按包注册一个 CommonJS 工厂：

  ```js
  window.__ModuleLoader__.load({ id: 'dsh-token-billing', factory: (require) => { /* … */ } })
  ```

  因此产物以 CJS 产出，并把 `react`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives` 保持为外部 `require`——这三个是 shell 预置进冻结模块表的平台模块，`tsdown.config.ts` 的 `CLIENT_PLATFORM_MODULES` 与它们一一对应，其余 import 一律内联。工厂外壳由 `outputOptions` 的 `banner` / `intro` / `footer` 拼出。

  一个模块表回答不了的 `require` 必然在工厂实例化时抛错，所以 `test/bundle.test.ts` 会执行 `lib/client.js` 并断言它只请求这三个 specifier。

## 安装到 DSH profile

构建后把包安装进 profile（例如 `desktop`）：

```bash
pnpm build
# 然后在 DSH 里通过插件管理器安装本目录，或
#   把本目录（含 lib/、cordis.patch.yml、package.json）复制到
#   ~/.dsh/profiles/<profile>/node_modules/dsh-token-billing
```

`cordis.patch.yml` 按包名引用插件；`package.json` 的 `dsh.client` 声明让 web 端额外加载 `lib/client.js` 作为浏览器半边。

## 与旧版单文件实现的差异

行为保持一致，DOM 契约（`tb-*` 类名、`data-token-billing*` 属性、`order:9999` 定位）逐个对齐，并补齐了：

- **类型**：两侧全部 TS，Host 半边产出 `.d.ts`；`react` / `react-dom` / primitives 用真实类型，Host 服务面用结构化镜像。
- **可测试**：原先埋在 1400 行里的纯逻辑（价格表构建、成本模型、时段判断、金额格式化、上下游报文校验）抽到 `billing.ts`，两侧共用并有直接测试。
- **清理**：删掉从未被读到的 `MIN_DISPLAY` 与 `formatTokens`；`priceBook` 的 `dispose()` 现在真的挂在 teardown 上（停止重试链，并允许重新激活时重新拉取）。
- **两处修正**：上游响应体大小限制原先按字符数比较却叫 `MAX_BODY_BYTES`，改为按 UTF-8 字节数；余额读取里 `status === 403 ? 'error' : 'error'` 的冗余三元去掉。
- **一处简化**：`react-dom` 与 primitives 的成员改为静态 import。旧代码用 `try/catch` 包裹 `require('react-dom')` 以防缺失，但这三个 specifier 由 shell 冻结模块表保证，静态 import 让整条降级分支成为死代码。
