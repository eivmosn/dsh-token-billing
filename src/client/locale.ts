const NAMESPACE = 'dsh-token-billing'

const zh: Record<string, string> = {
  'chip.sessionCost': '本会话预估费用',
  'chip.sessionCostBare': '本会话费用',
  'chip.balanceSuffix': '，账户余额 {amount}',
  'chip.billingSuffix': '，计费中',
  'chip.turnTokens': '本次 {tokens} tok',
  'chip.turnCost': '花费 {cost}',
  'chip.search': '搜索 {count} 次 {cost}',
  'panel.search': '联网搜索',
  'panel.searchBasis': '按每次 $0.01（$10 / 1000 次）估算',
  'panel.searchValue': '{count} 次 · {cost}',
  'panel.title': '本会话预估费用',
  'panel.aria': 'Token 计费详情',
  'panel.model': '模型',
  'bucket.miss': '未缓存输入',
  'bucket.hit': '缓存读取',
  'bucket.write': '缓存写入',
  'bucket.out': '输出',
  'panel.turn': '本次',
  'panel.session': '会话合计',
  'panel.agents': '子智能体',
  'panel.agentsCount': '{count} 个 · {tokens} · {cost}',
  'panel.agentsUnreported': ' · {count} 个未上报',
  'panel.rates': '每百万 token 单价',
  'panel.peak': '高峰',
  'panel.offPeak': '低谷',
  'panel.rateNote': '表内为空闲价；高峰时段按 2 倍计。',
  'panel.rateSource': '挂牌价以 USD 计，按 1 CNY = 0.15 USD 折算。',
  'attribution.peak': '高峰期',
  'attribution.off': '低谷期',
  'attribution.remainder': '其余用量',
  'panel.balance': '账户余额',
  'panel.noRateDetail': '价格表中没有该模型的挂牌价，无法估算。',
  'hover.estimated': '（估算）',
  'panel.loading': '正在获取价格表，稍后自动重试。',
  'panel.noBook': '价格表加载中…',
  'panel.noModel': '尚未确定当前模型。',
  'panel.noRate': '该模型暂无挂牌价',
  'hover.details': '点击查看详情',
  'balance.usageTip': '点击查看',
  'subagents.title': '子智能体',
  'subagents.aria': '子智能体花费',
  'subagents.more': '另有 {count} 个',
}

const en: Record<string, string> = {
  'chip.sessionCost': 'Estimated session cost',
  'chip.sessionCostBare': 'Session cost',
  'chip.balanceSuffix': ', balance {amount}',
  'chip.billingSuffix': ', billing',
  'chip.turnTokens': 'turn {tokens} tok',
  'chip.turnCost': '{cost}',
  'chip.search': 'search {count} {cost}',
  'panel.search': 'Web search',
  'panel.searchBasis': 'Estimated at $0.01 per search ($10 / 1000)',
  'panel.searchValue': '{count} · {cost}',
  'panel.title': 'Session cost',
  'panel.aria': 'Token billing detail',
  'panel.model': 'Model',
  'bucket.miss': 'Uncached',
  'bucket.hit': 'Cache read',
  'bucket.write': 'Cache write',
  'bucket.out': 'Output',
  'panel.turn': 'This turn',
  'panel.session': 'Session',
  'panel.agents': 'Subagents',
  'panel.agentsCount': '{count} · {tokens} · {cost}',
  'panel.agentsUnreported': ' · {count} unreported',
  'panel.rates': 'Per 1M tokens',
  'panel.peak': 'Peak',
  'panel.offPeak': 'Off-peak',
  'panel.rateNote': 'Rates are off-peak; peak windows bill at 2x.',
  'panel.rateSource': 'Listed in USD, converted at 1 CNY = 0.15 USD.',
  'attribution.peak': 'Peak',
  'attribution.off': 'Off-peak',
  'attribution.remainder': 'Remaining',
  'panel.balance': 'Balance',
  'panel.noRateDetail': 'No listed price for this model; cannot estimate.',
  'hover.estimated': ' (est.)',
  'panel.loading': 'Loading rates; retrying shortly.',
  'panel.noBook': 'Loading rates…',
  'panel.noModel': 'Model not determined yet.',
  'panel.noRate': 'No listed price for this model',
  'hover.details': 'Click for details',
  'balance.usageTip': 'View usage',
  'subagents.title': 'Subagents',
  'subagents.aria': 'Subagent spend',
  'subagents.more': '{count} more',
}

interface LocaleService {
  register?: (namespace: string, dicts: Record<string, Record<string, string>>) => unknown
  bind?: (namespace: string) => (key: string, params?: Record<string, unknown>) => string
}

type Translate = (key: string, params?: Record<string, unknown>) => string

let bound: Translate | undefined

function asService(input: unknown): LocaleService | undefined {
  return input !== null && typeof input === 'object' ? (input as LocaleService) : undefined
}

export function registerDictionaries(input: unknown): () => void {
  const locale = asService(input)
  if (locale?.register === undefined) return () => undefined
  try {
    const dispose = locale.register(NAMESPACE, { zh, en })
    return typeof dispose === 'function' ? (dispose as () => void) : () => undefined
  } catch {
    return () => undefined
  }
}

export function bindLocale(input: unknown): void {
  const locale = asService(input)
  bound = undefined
  if (locale?.bind === undefined) return
  try {
    const translate = locale.bind(NAMESPACE)
    if (typeof translate === 'function') bound = translate
  } catch {
    bound = undefined
  }
}

function fill(template: string, params: Record<string, unknown> | undefined): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

export function t(key: string, params?: Record<string, unknown>): string {
  const fromService = bound?.(key, params)
  if (fromService !== undefined && fromService !== key) return fromService
  return fill(zh[key] ?? key, params)
}
