const NAMESPACE = 'dsh-token-billing'

const zh: Record<string, string> = {
  'chip.sessionCost': '本会话预估费用',
  'chip.sessionCostBare': '本会话费用',
  'chip.balanceSuffix': '，账户余额 {amount}',
  'chip.billingSuffix': '，计费中',
  'chip.turnTokens': '本轮 {tokens} tok',
  'chip.turnCost': '花费 {cost}',
  'panel.title': '本会话预估费用',
  'panel.aria': 'Token 计费详情',
  'panel.model': '模型',
  'bucket.miss': '未缓存输入',
  'bucket.hit': '缓存读取',
  'bucket.write': '缓存写入',
  'bucket.out': '输出',
  'panel.turn': '本次对话',
  'panel.session': '会话合计',
  'panel.agents': '子智能体',
  'panel.agentsCount': '{count} 个 · {cost}',
  'panel.agentsUnreported': ' · {count} 个未上报',
  'panel.rates': '每百万 token 单价',
  'panel.peak': '高峰',
  'panel.offPeak': '低谷',
  'panel.rateNotePeak': '当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。',
  'panel.rateNoteOff': '当前为低谷时段，按半价计（高峰为挂牌价 ×2）。',
  'panel.rateSource': '挂牌价以 USD 计，按 1 CNY = 0.15 USD 折算。',
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
  'panel.agentsCount': '{count} · {cost}',
  'panel.agentsUnreported': ' · {count} unreported',
  'panel.rates': 'Per 1M tokens',
  'panel.peak': 'Peak',
  'panel.offPeak': 'Off-peak',
  'panel.rateNotePeak': 'Peak window: list price (off-peak is half).',
  'panel.rateNoteOff': 'Off-peak: half of list (peak is 2x list).',
  'panel.rateSource': 'Listed in USD, converted at 1 CNY = 0.15 USD.',
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
  register?: (namespace: string, locale: string, dict: Record<string, string>) => unknown
  bind?: (namespace: string) => (key: string, params?: Record<string, unknown>) => string
  getLocale?: () => { active?: string } | undefined
}

let viaService: ((key: string, params?: Record<string, unknown>) => string) | undefined
let dictionary = zh

function fill(template: string, params: Record<string, unknown> | undefined): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  )
}

export function bindLocale(service: unknown): void {
  const locale = service as LocaleService | undefined
  viaService = undefined
  if (locale === undefined || locale === null || typeof locale !== 'object') {
    dictionary = zh
    return
  }
  try {
    locale.register?.(NAMESPACE, 'zh', zh)
    locale.register?.(NAMESPACE, 'en', en)
    const bound = locale.bind?.(NAMESPACE)
    if (typeof bound === 'function') viaService = (key, params) => bound(key, params)
    dictionary = locale.getLocale?.()?.active === 'en' ? en : zh
  } catch {
    dictionary = zh
  }
}

export function t(key: string, params?: Record<string, unknown>): string {
  const fromService = viaService?.(key, params)
  if (fromService !== undefined && fromService !== key) return fromService
  return fill(dictionary[key] ?? zh[key] ?? key, params)
}
