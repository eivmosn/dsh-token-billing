window.__ModuleLoader__.load({ id: "dsh-token-billing", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react = require("react");
react = __toESM(react, 1);
let react_dom = require("react-dom");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/billing.ts
const MODELS_DEV_URL = "https://models.dev/api.json";
const BALANCE_ROUTE = "/plugins/dsh-token-billing/balance";
const USAGE_URL = "https://platform.deepseek.com/usage";
const USD_PER_CNY = .15;
const PEAK_FACTOR = 2;
const DEEPSEEK_PROVIDER$1 = /deepseek/i;
function toCny(usd) {
	return usd / USD_PER_CNY;
}
function formatCost(amount) {
	if (amount >= 1) return `¥${amount.toFixed(2)}`;
	if (amount >= .01) return `¥${amount.toFixed(3)}`;
	return `¥${amount.toPrecision(2)}`;
}
function formatRate(amount) {
	return `¥${amount.toFixed(2)}`;
}
function formatExactTokens(value) {
	return value.toLocaleString("en-US");
}
function formatTokens(value) {
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e4) return `${Math.round(value / 1e3)}K`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return String(value);
}
function cacheSaving(buckets, rate, factor) {
	const hit = numOf(buckets.cacheReadTokens) ?? 0;
	const total = hit + (numOf(buckets.uncachedInputTokens) ?? 0);
	if (total === 0) return void 0;
	const savedUsd = hit * Math.max(0, rate.miss - rate.hit) * factor / 1e6;
	return {
		hitRate: hit / total,
		savedCny: toCny(savedUsd)
	};
}
function dominantShare(buckets, rate, factor) {
	let best;
	let total = 0;
	const costs = [];
	for (const bucket of BUCKETS) {
		const tokens = numOf(buckets[bucket.key]) ?? 0;
		if (tokens === 0) continue;
		const cny = tokens * rate[bucket.rate] * factor / 1e6;
		total += cny;
		costs.push({
			label: bucket.label,
			share: cny
		});
	}
	if (total === 0) return void 0;
	for (const cost of costs) {
		const share = cost.share / total;
		if (best === void 0 || share > best.share) best = {
			label: cost.label,
			share
		};
	}
	return best;
}
function burnRemainingMs(spentCny, elapsedMs, balanceCny) {
	if (spentCny <= 0 || elapsedMs < 3e4 || balanceCny <= 0) return void 0;
	return balanceCny / (spentCny / elapsedMs);
}
function formatBalance(amount, symbol) {
	const raw = typeof amount === "string" ? amount.trim() : "";
	if (!/^-?\d+(\.\d+)?$/.test(raw)) return `${symbol}—`;
	const negative = raw.startsWith("-");
	const [intPartRaw = "0", fracPart = ""] = (negative ? raw.slice(1) : raw).split(".");
	const intPart = Number(intPartRaw);
	const cents = Number((fracPart + "00").slice(0, 2));
	const subCent = intPart === 0 && cents === 0 && /[1-9]/.test(fracPart.slice(2));
	const text = `${intPart.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
	if (intPart === 0 && cents === 0 && !subCent) return `${symbol}0.00`;
	if (negative) {
		if (subCent) return `-${symbol}0.01`;
		return `-${symbol}${text}`;
	}
	if (subCent) return `<${symbol}0.01`;
	return `${symbol}${text}`;
}
function numOf(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function rateOfEntry(entry, modelId) {
	const record = asRecord(entry);
	if (record === null) return null;
	const cost = asRecord(record.cost);
	if (cost === null) return null;
	const miss = numOf(cost.input);
	const out = numOf(cost.output);
	if (miss === null || out === null) return null;
	const hit = numOf(cost.cache_read);
	const write = numOf(cost.cache_write);
	const label = typeof record.name === "string" ? record.name.trim() : "";
	return {
		miss,
		out,
		hit: hit === null ? miss : hit,
		write: write === null ? miss : write,
		name: label === "" ? modelId : label
	};
}
function emptyBook() {
	return {
		branches: {},
		providerIndex: {},
		modelIndex: {}
	};
}
function buildBranches(payload) {
	const providers = asRecord(payload);
	const branches = {};
	if (providers === null) return branches;
	for (const providerId of Object.keys(providers)) {
		const provider = asRecord(providers[providerId]);
		if (provider === null) continue;
		const models = asRecord(provider.models);
		if (models === null) continue;
		const branch = {};
		for (const modelId of Object.keys(models)) {
			const rate = rateOfEntry(models[modelId], modelId);
			if (rate !== null) branch[modelId] = rate;
		}
		if (Object.keys(branch).length > 0) branches[providerId] = branch;
	}
	return branches;
}
function indexBook(branches) {
	const providerIndex = {};
	const modelIndex = {};
	for (const providerId of Object.keys(branches)) {
		const lowerProvider = providerId.toLowerCase();
		if (providerIndex[lowerProvider] === void 0) providerIndex[lowerProvider] = providerId;
		const branch = branches[providerId];
		if (branch === void 0) continue;
		for (const modelId of Object.keys(branch)) {
			const lowerModel = modelId.toLowerCase();
			if (modelIndex[lowerModel] === void 0) modelIndex[lowerModel] = {
				providerId,
				modelId
			};
		}
	}
	return {
		branches,
		providerIndex,
		modelIndex
	};
}
function buildBook(payload) {
	return indexBook(buildBranches(payload));
}
function resolveRate(book, provider, model) {
	const exactRate = book.branches[provider]?.[model];
	if (exactRate !== void 0) return {
		rate: exactRate,
		providerId: provider,
		modelId: model,
		exact: true
	};
	const providerId = book.providerIndex[provider.toLowerCase()];
	if (providerId !== void 0) {
		const rate = book.branches[providerId]?.[model];
		if (rate !== void 0) return {
			rate,
			providerId,
			modelId: model,
			exact: false
		};
	}
	const hit = book.modelIndex[model.toLowerCase()];
	if (hit !== void 0) {
		const rate = book.branches[hit.providerId]?.[hit.modelId];
		if (rate !== void 0) return {
			rate,
			providerId: hit.providerId,
			modelId: hit.modelId,
			exact: false
		};
	}
	return null;
}
const SHANGHAI_CLOCK = new Intl.DateTimeFormat("en-US", {
	timeZone: "Asia/Shanghai",
	weekday: "short",
	hour: "2-digit",
	hour12: false
});
function isPeak(at) {
	const parts = SHANGHAI_CLOCK.formatToParts(at);
	let weekday = "";
	let hour = 0;
	for (const part of parts) if (part.type === "weekday") weekday = part.value;
	else if (part.type === "hour") hour = Number.parseInt(part.value, 10) % 24;
	if (weekday === "Sat" || weekday === "Sun") return false;
	return hour >= 9 && hour < 12 || hour >= 14 && hour < 18;
}
function subtractBuckets(later, earlier) {
	const delta = {};
	for (const { key } of BUCKETS) {
		const value = (later[key] ?? 0) - (earlier[key] ?? 0);
		if (value > 0) delta[key] = value;
	}
	return delta;
}
const BUCKETS = [
	{
		key: "uncachedInputTokens",
		rate: "miss",
		label: "未缓存输入"
	},
	{
		key: "cacheReadTokens",
		rate: "hit",
		label: "缓存读取"
	},
	{
		key: "cacheWriteTokens",
		rate: "write",
		label: "缓存写入"
	},
	{
		key: "outputTokens",
		rate: "out",
		label: "输出"
	}
];
function priceUsage(usage, book, provider, model, at) {
	const buckets = asRecord(usage);
	if (buckets === null) return { kind: "no-usage" };
	if (Object.keys(book.branches).length === 0) return { kind: "no-book" };
	if (provider === void 0 || model === void 0) return { kind: "no-route" };
	const resolved = resolveRate(book, provider, model);
	if (resolved === null) return {
		kind: "unpriced",
		provider,
		model
	};
	const peak = DEEPSEEK_PROVIDER$1.test(provider) && isPeak(at);
	const factor = peak ? 2 : 1;
	const rows = [];
	let totalUsd = 0;
	let totalTokens = 0;
	let anyBucket = false;
	for (const bucket of BUCKETS) {
		const tokens = numOf(buckets[bucket.key]) ?? 0;
		totalTokens += tokens;
		if (tokens > 0) anyBucket = true;
		const rate = resolved.rate[bucket.rate];
		const usd = tokens * rate * factor / 1e6;
		totalUsd += usd;
		rows.push({
			key: bucket.key,
			label: bucket.label,
			tokens,
			rate,
			usd
		});
	}
	if (!anyBucket) return { kind: "no-usage" };
	return {
		kind: "ok",
		rows,
		totalCny: toCny(totalUsd),
		totalTokens,
		peak,
		factor,
		rate: resolved.rate,
		providerId: resolved.providerId,
		modelId: resolved.modelId,
		modelName: resolved.rate.name,
		rateExact: resolved.exact
	};
}
const MAX_AGENT_ITEMS = 12;
function priceSessionTree(sources, book, at) {
	const totals = /* @__PURE__ */ new Map();
	let totalCny = 0;
	let totalTokens = 0;
	let peak = false;
	let priced = 0;
	let agentCount = 0;
	let agentCny = 0;
	let agentTokens = 0;
	const agentItems = [];
	for (let index = 0; index < sources.length; index += 1) {
		const source = sources[index];
		if (source === void 0) continue;
		const result = priceUsage(source.usage, book, source.provider, source.model, at);
		if (result.kind !== "ok") continue;
		priced += 1;
		totalCny += result.totalCny;
		totalTokens += result.totalTokens;
		if (result.peak) peak = true;
		agentCount += 1;
		agentCny += result.totalCny;
		agentTokens += result.totalTokens;
		agentItems.push({
			id: source.sessionId ?? `agent-${String(index)}`,
			label: source.label ?? result.modelName,
			providerId: result.providerId,
			modelId: result.modelId,
			modelName: result.modelName,
			cny: result.totalCny,
			tokens: result.totalTokens,
			peak: result.peak
		});
		for (const row of result.rows) {
			const prev = totals.get(row.key);
			totals.set(row.key, prev === void 0 ? { ...row } : {
				key: row.key,
				label: row.label,
				tokens: prev.tokens + row.tokens,
				rate: row.rate,
				usd: prev.usd + row.usd
			});
		}
	}
	if (priced === 0) return null;
	const rows = [];
	for (const bucket of BUCKETS) {
		const row = totals.get(bucket.key);
		if (row !== void 0) rows.push(row);
	}
	return {
		totalCny,
		totalTokens,
		rows,
		peak,
		agents: {
			count: agentCount,
			cny: agentCny,
			tokens: agentTokens,
			items: agentItems.toSorted((left, right) => right.cny - left.cny).slice(0, 12),
			overflow: Math.max(0, agentCount - 12)
		}
	};
}
const DECIMAL = /^-?\d+(\.\d+)?$/;
const ZERO = /^0+(\.0+)?$/;
function readBalanceResponse(value) {
	const result = asRecord(value);
	if (result === null) return {
		kind: "error",
		error: "malformed"
	};
	if (result.ok !== true) {
		const reason = String(result.error ?? "unavailable");
		return reason === "no-key" ? { kind: "no-key" } : {
			kind: "error",
			error: reason
		};
	}
	const wallets = [];
	const bonusWallets = [];
	for (const wallet of Array.isArray(result.wallets) ? result.wallets : []) {
		const entry = asRecord(wallet);
		if (entry === null) continue;
		const currency = entry.currency === "USD" ? "USD" : "CNY";
		const total = String(entry.totalBalance ?? "");
		if (!DECIMAL.test(total)) continue;
		wallets.push({
			currency,
			balance: total
		});
		const granted = String(entry.grantedBalance ?? "0");
		if (DECIMAL.test(granted) && !ZERO.test(granted)) bonusWallets.push({
			currency,
			balance: granted
		});
	}
	return {
		kind: "ready",
		wallets,
		bonusWallets,
		unavailable: result.isAvailable === false
	};
}

//#endregion
//#region src/attribution.ts
const DEEPSEEK_PROVIDER = /deepseek/i;
const SEARCH_USD_PER_CALL = .01;
const SEARCH_TOOL = /web_search|websearch/i;
function isDeepSeekRoute(provider) {
	return DEEPSEEK_PROVIDER.test(provider ?? "");
}
function isListPricePeriod(provider, at) {
	return !isDeepSeekRoute(provider) || isPeak(new Date(at));
}
function countTokens(buckets) {
	let total = 0;
	for (const bucket of BUCKETS) total += num(buckets[bucket.key]);
	return total;
}
function num(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
function add(into, from) {
	const next = { ...into };
	for (const bucket of BUCKETS) {
		const value = num(from[bucket.key]);
		if (value > 0) next[bucket.key] = num(into[bucket.key]) + value;
	}
	return next;
}
function priceGroup(buckets, rate, factor) {
	let usd = 0;
	for (const bucket of BUCKETS) usd += num(buckets[bucket.key]) * rate[bucket.rate] * factor / 1e6;
	return toCny(usd);
}
function searchSpend(searches) {
	return toCny(searches * SEARCH_USD_PER_CALL);
}
function attributeRequests(requests, book, searches = 0) {
	const pending = /* @__PURE__ */ new Map();
	for (const request of requests) {
		if (countTokens(request.buckets) === 0) continue;
		const peak = isListPricePeriod(request.provider, request.at);
		const key = `${request.provider ?? ""}\u0000${request.model ?? ""}\u0000${peak ? "peak" : "off"}`;
		const existing = pending.get(key);
		if (existing === void 0) {
			pending.set(key, {
				provider: request.provider,
				model: request.model,
				peak,
				buckets: add({}, request.buckets)
			});
			continue;
		}
		existing.buckets = add(existing.buckets, request.buckets);
	}
	const groups = [];
	let totalCny = 0;
	let totalTokens = 0;
	let peakCny = 0;
	let offCny = 0;
	let peakTokens = 0;
	let offTokens = 0;
	let unpriced = 0;
	const routes = /* @__PURE__ */ new Set();
	for (const entry of pending.values()) {
		const tokens = countTokens(entry.buckets);
		const resolved = resolveRate(book, entry.provider ?? "", entry.model ?? "");
		const factor = entry.peak && isDeepSeekRoute(entry.provider) ? 2 : 1;
		if (resolved === null) {
			unpriced += tokens;
			totalTokens += tokens;
			if (entry.peak) peakTokens += tokens;
			else offTokens += tokens;
			continue;
		}
		const cny = priceGroup(entry.buckets, resolved.rate, factor);
		groups.push({
			providerId: resolved.providerId,
			modelId: resolved.modelId,
			modelName: resolved.rate.name,
			peak: entry.peak,
			buckets: entry.buckets,
			tokens,
			cny
		});
		totalCny += cny;
		totalTokens += tokens;
		routes.add(`${resolved.providerId}\u0000${resolved.modelId}`);
		if (entry.peak) {
			peakCny += cny;
			peakTokens += tokens;
		} else {
			offCny += cny;
			offTokens += tokens;
		}
	}
	groups.sort((left, right) => right.cny - left.cny);
	const searchCny = searchSpend(searches);
	return {
		groups,
		searches,
		searchCny,
		totalCny: totalCny + searchCny,
		totalTokens,
		peakCny,
		offCny,
		peakTokens,
		offTokens,
		routes: routes.size,
		unpriced,
		mixedPeriod: peakTokens > 0 && offTokens > 0,
		switchedRoute: routes.size > 1
	};
}
function attributedBuckets(attribution) {
	let total = {};
	for (const group of attribution.groups) total = add(total, group.buckets);
	return total;
}
function attributeTurn(requests, book, baseline, current, fallback, searches = 0) {
	if (Object.keys(book.branches).length === 0) return void 0;
	const run = attributeRequests(requests.filter((request) => request.at >= baseline.at), book, searches);
	const delta = subtractBuckets(current, baseline.usage);
	const rest = subtractBuckets(delta, attributedBuckets(run));
	const restPriced = countTokens(rest) > 0 ? priceUsage(rest, book, fallback.provider, fallback.model, fallback.at) : void 0;
	const tokens = run.totalTokens + (restPriced?.kind === "ok" ? restPriced.totalTokens : 0);
	if (tokens === 0 && run.searches === 0) return void 0;
	return {
		tokens,
		searches: run.searches,
		cny: run.totalCny + (restPriced?.kind === "ok" ? restPriced.totalCny : 0)
	};
}

//#endregion
//#region src/client/constants.ts
const COUNT_UP_EPSILON = 5e-4;
const MEASURE_STYLE = {
	visibility: "hidden",
	left: 0,
	top: 0
};
const BALANCE_REUSE_MS = 15e3;
const BALANCE_FRESH_MS = 3e3;
const BALANCE_RELOAD_COOLDOWN_MS = 6e4;
const TURN_BASELINE_FRESH_MS = 18e5;
const POSTURE_REFRESH_MS = 3e4;

//#endregion
//#region src/client/hooks/use-count-up.ts
function useCountUp(target) {
	const [display, setDisplay] = react.useState(target);
	const anim = react.useRef({
		from: target,
		start: 0,
		raf: 0,
		shown: target,
		seeded: false
	});
	react.useEffect(() => {
		const state = anim.current;
		const start = state.shown;
		const delta = target - start;
		if (!state.seeded) {
			state.seeded = true;
			state.shown = target;
			setDisplay(target);
			return;
		}
		if (Math.abs(delta) < 5e-4) {
			state.shown = target;
			setDisplay(target);
			return;
		}
		if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches || typeof requestAnimationFrame !== "function") {
			state.shown = target;
			setDisplay(target);
			return;
		}
		const time0 = performance.now();
		state.from = start;
		state.start = time0;
		const step = () => {
			const now = performance.now();
			const t = Math.min(1, (now - state.start) / 450);
			const eased = 1 - (1 - t) ** 3;
			const value = state.from + delta * eased;
			state.shown = value;
			setDisplay(value);
			if (t < 1) state.raf = requestAnimationFrame(step);
		};
		state.raf = requestAnimationFrame(step);
		return () => {
			if (state.raf !== 0) cancelAnimationFrame(state.raf);
			state.raf = 0;
		};
	}, [target]);
	return display;
}

//#endregion
//#region src/client/hooks/use-overlay.ts
function useOverlay(open, setOpen) {
	const anchorRef = react.useRef(null);
	const panelRef = react.useRef(null);
	const pos = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
		open,
		anchorRef,
		panelRef,
		side: "top",
		gap: 8,
		margin: 12
	});
	(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(anchorRef, open, setOpen, panelRef);
	const onKeyDown = react.useCallback((event) => {
		if (event.key === "Escape") setOpen(false);
	}, [setOpen]);
	react.useEffect(() => {
		if (!open) return void 0;
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onKeyDown]);
	return {
		anchorRef,
		panelRef,
		pos
	};
}

//#endregion
//#region src/client/locale.ts
const NAMESPACE = "dsh-token-billing";
const zh = {
	"chip.sessionCost": "本会话预估费用",
	"chip.sessionCostBare": "本会话费用",
	"chip.balanceSuffix": "，账户余额 {amount}",
	"chip.billingSuffix": "，计费中",
	"chip.turnTokens": "本次 {tokens} tok",
	"chip.turnCost": "花费 {cost}",
	"panel.search": "联网搜索",
	"panel.searchBasis": "按每次 $0.01（$10 / 1000 次）估算",
	"panel.searchValue": "{count} 次 · {cost}",
	"panel.title": "本会话预估费用",
	"panel.aria": "Token 计费详情",
	"panel.model": "模型",
	"bucket.miss": "未缓存输入",
	"bucket.hit": "缓存读取",
	"bucket.write": "缓存写入",
	"bucket.out": "输出",
	"panel.turn": "本次",
	"panel.session": "会话合计",
	"panel.agents": "子智能体",
	"panel.agentsCount": "{count} 个 · {tokens} · {cost}",
	"panel.agentsUnreported": " · {count} 个未上报",
	"panel.rates": "每百万 token 单价",
	"panel.peak": "高峰",
	"panel.offPeak": "低谷",
	"panel.rateNote": "表内为空闲价；高峰时段按 2 倍计。",
	"panel.rateSource": "挂牌价以 USD 计，按 1 CNY = 0.15 USD 折算。",
	"insight.cache": "缓存命中 {rate}，已省约 {cost}",
	"insight.bucket": "{label}占 {share}",
	"burn.line": "本轮 ¥{rate}/分钟 · 余额约还够 {duration}",
	"burn.hours": "{hours} 小时 {minutes} 分",
	"burn.minutes": "{minutes} 分钟",
	"attribution.peak": "高峰期",
	"attribution.off": "低谷期",
	"attribution.remainder": "其余用量",
	"panel.balance": "账户余额",
	"panel.noRateDetail": "价格表中没有该模型的挂牌价，无法估算。",
	"hover.estimated": "（估算）",
	"panel.loading": "正在获取价格表，稍后自动重试。",
	"panel.noBook": "价格表加载中…",
	"panel.noModel": "尚未确定当前模型。",
	"panel.noRate": "该模型暂无挂牌价",
	"hover.details": "点击查看详情",
	"balance.usageTip": "点击查看",
	"subagents.title": "子智能体",
	"subagents.aria": "子智能体花费",
	"subagents.more": "另有 {count} 个"
};
const en = {
	"chip.sessionCost": "Estimated session cost",
	"chip.sessionCostBare": "Session cost",
	"chip.balanceSuffix": ", balance {amount}",
	"chip.billingSuffix": ", billing",
	"chip.turnTokens": "turn {tokens} tok",
	"chip.turnCost": "{cost}",
	"panel.search": "Web search",
	"panel.searchBasis": "Estimated at $0.01 per search ($10 / 1000)",
	"panel.searchValue": "{count} · {cost}",
	"panel.title": "Session cost",
	"panel.aria": "Token billing detail",
	"panel.model": "Model",
	"bucket.miss": "Uncached",
	"bucket.hit": "Cache read",
	"bucket.write": "Cache write",
	"bucket.out": "Output",
	"panel.turn": "This turn",
	"panel.session": "Session",
	"panel.agents": "Subagents",
	"panel.agentsCount": "{count} · {tokens} · {cost}",
	"panel.agentsUnreported": " · {count} unreported",
	"panel.rates": "Per 1M tokens",
	"panel.peak": "Peak",
	"panel.offPeak": "Off-peak",
	"panel.rateNote": "Rates are off-peak; peak windows bill at 2x.",
	"panel.rateSource": "Listed in USD, converted at 1 CNY = 0.15 USD.",
	"insight.cache": "Cache hits {rate}, saving about {cost}",
	"insight.bucket": "{label} is {share}",
	"burn.line": "¥{rate}/min this turn · balance lasts about {duration}",
	"burn.hours": "{hours}h {minutes}m",
	"burn.minutes": "{minutes}m",
	"attribution.peak": "Peak",
	"attribution.off": "Off-peak",
	"attribution.remainder": "Remaining",
	"panel.balance": "Balance",
	"panel.noRateDetail": "No listed price for this model; cannot estimate.",
	"hover.estimated": " (est.)",
	"panel.loading": "Loading rates; retrying shortly.",
	"panel.noBook": "Loading rates…",
	"panel.noModel": "Model not determined yet.",
	"panel.noRate": "No listed price for this model",
	"hover.details": "Click for details",
	"balance.usageTip": "View usage",
	"subagents.title": "Subagents",
	"subagents.aria": "Subagent spend",
	"subagents.more": "{count} more"
};
let bound;
function asService(input) {
	return input !== null && typeof input === "object" ? input : void 0;
}
function registerDictionaries(input) {
	const locale = asService(input);
	if (locale?.register === void 0) return () => void 0;
	try {
		const dispose = locale.register(NAMESPACE, {
			zh,
			en
		});
		return typeof dispose === "function" ? dispose : () => void 0;
	} catch {
		return () => void 0;
	}
}
function bindLocale(input) {
	const locale = asService(input);
	bound = void 0;
	if (locale?.bind === void 0) return;
	try {
		const translate = locale.bind(NAMESPACE);
		if (typeof translate === "function") bound = translate;
	} catch {
		bound = void 0;
	}
}
function fill(template, params) {
	if (params === void 0) return template;
	return template.replace(/\{(\w+)\}/g, (whole, name) => Object.hasOwn(params, name) ? String(params[name]) : whole);
}
function t(key, params) {
	const fromService = bound?.(key, params);
	if (fromService !== void 0 && fromService !== key) return fromService;
	return fill(zh[key] ?? key, params);
}

//#endregion
//#region src/client/trajectory.ts
function stringOf(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
function bucketsOf(value) {
	const usage = asRecord(value);
	if (usage === null) return void 0;
	const buckets = {};
	const miss = numOf(usage.uncachedInputTokens ?? usage.input);
	const hit = numOf(usage.cacheReadTokens ?? usage.cacheRead);
	const write = numOf(usage.cacheWriteTokens ?? usage.cacheWrite);
	const out = numOf(usage.outputTokens ?? usage.output);
	if (miss !== null) buckets.uncachedInputTokens = miss;
	if (hit !== null) buckets.cacheReadTokens = hit;
	if (write !== null) buckets.cacheWriteTokens = write;
	if (out !== null) buckets.outputTokens = out;
	return Object.keys(buckets).length === 0 ? void 0 : buckets;
}
function billedRequestsOf(snapshot) {
	const nodes = asRecord(snapshot)?.eventNodes;
	if (!Array.isArray(nodes)) return [];
	const requests = [];
	for (const node of nodes) {
		const record = asRecord(node);
		if (record === null || record.kind !== "assistant") continue;
		const at = numOf(record.time);
		if (at === null) continue;
		const buckets = bucketsOf(record.usage);
		if (buckets === void 0) continue;
		const meta = asRecord(record.providerMetadata);
		requests.push({
			at,
			provider: stringOf(meta?.provider),
			model: stringOf(meta?.model),
			buckets
		});
	}
	return requests;
}
function queriesIn(argsRaw) {
	if (typeof argsRaw !== "string" || argsRaw === "") return 1;
	try {
		const args = JSON.parse(argsRaw);
		if (Array.isArray(args.queries)) return Math.max(1, args.queries.length);
		return typeof args.query === "string" && args.query !== "" ? 1 : 1;
	} catch {
		return 1;
	}
}
function searchCallsIn(snapshot) {
	const nodes = asRecord(snapshot)?.eventNodes;
	if (!Array.isArray(nodes)) return [];
	const calls = [];
	for (const node of nodes) {
		const record = asRecord(node);
		if (record?.kind !== "assistant" || !Array.isArray(record.blocks)) continue;
		const at = numOf(record.time);
		if (at === null) continue;
		for (const block of record.blocks) {
			const call = asRecord(block);
			if (call?.kind !== "tool-call") continue;
			const name = stringOf(call.name);
			if (name === void 0 || !SEARCH_TOOL.test(name)) continue;
			calls.push({
				at,
				queries: queriesIn(call.argsRaw)
			});
		}
	}
	return calls;
}

//#endregion
//#region src/client/session-tree.ts
const REMINDER_PREFIX = /^<system-reminder>/i;
function shortId(id) {
	return id.length <= 8 ? id : id.slice(0, 8);
}
function labelOf(row, id, catalog) {
	const described = catalog?.get(id);
	if (described !== void 0) return described;
	const raw = (row?.title ?? row?.displayTitle ?? "").replace(/\s+/g, " ").trim();
	return raw === "" || REMINDER_PREFIX.test(raw) ? shortId(id) : raw;
}
function catalogLabelsOf(state, rootId) {
	const catalog = /* @__PURE__ */ new Map();
	const byId = state.byId;
	const seen = /* @__PURE__ */ new Set();
	let id = rootId;
	while (id !== void 0 && !seen.has(id)) {
		seen.add(id);
		for (const entry of state.projectionsBySession?.[id]?.values?.subagentCatalog ?? []) {
			const childId = entry.id ?? entry.childId;
			const label = entry.label?.trim();
			if (childId !== void 0 && label !== void 0 && label !== "") catalog.set(childId, label);
		}
		id = byId?.[id]?.parentId ?? byId?.[id]?.parentSession;
	}
	return catalog;
}
const EMPTY = {
	sources: [],
	agentSessions: 0,
	unreported: 0
};
function projectionsOf(row) {
	if (row === void 0) return void 0;
	return row.projectionValues ?? row.projections;
}
function collectChildUsage(state, rootId) {
	const byId = state?.byId;
	if (state === void 0 || byId === void 0 || rootId === void 0 || rootId === "") return EMPTY;
	const childrenOf = /* @__PURE__ */ new Map();
	for (const id of Object.keys(byId)) {
		const row = byId[id];
		if (row === void 0 || row.blank === true) continue;
		const parent = row.parentId ?? row.parentSession;
		if (parent === void 0 || parent === "") continue;
		const list = childrenOf.get(parent);
		if (list === void 0) childrenOf.set(parent, [id]);
		else list.push(id);
	}
	const catalog = catalogLabelsOf(state, rootId);
	const sources = [];
	let agentSessions = 0;
	let unreported = 0;
	const seen = /* @__PURE__ */ new Set([rootId]);
	const queue = [rootId];
	for (let index = 0; index < queue.length; index += 1) {
		const id = queue[index];
		if (id === void 0) continue;
		for (const childId of childrenOf.get(id) ?? []) {
			if (seen.has(childId)) continue;
			seen.add(childId);
			queue.push(childId);
			agentSessions += 1;
			const values = projectionsOf(byId[childId]);
			const usage = values?.tokenUsage;
			if (usage === void 0 || usage === null) {
				unreported += 1;
				continue;
			}
			const selection = values?.modelSelection;
			sources.push({
				usage,
				provider: selection?.next?.provider ?? selection?.lastUsed?.provider,
				model: selection?.next?.model ?? selection?.lastUsed?.model,
				sessionId: childId,
				label: labelOf(byId[childId], childId, catalog)
			});
		}
	}
	return {
		sources,
		agentSessions,
		unreported
	};
}

//#endregion
//#region src/client/stores/account-balance.ts
const READ_AT_KEY = "dsh-token-billing/balance-snapshot/v1";
function readStored() {
	try {
		const raw = sessionStorage.getItem(READ_AT_KEY);
		if (raw === null) return void 0;
		const parsed = JSON.parse(raw);
		if (typeof parsed.at !== "number") return void 0;
		if (Date.now() - parsed.at >= 6e4) return void 0;
		if (parsed.status !== "ready" && parsed.status !== "no-key") return void 0;
		return {
			at: parsed.at,
			status: parsed.status,
			wallets: parsed.wallets ?? [],
			bonusWallets: parsed.bonusWallets ?? []
		};
	} catch {
		return;
	}
}
function store(next) {
	if (next.status !== "ready" && next.status !== "no-key") return;
	try {
		const stored = {
			at: next.at,
			status: next.status,
			wallets: next.wallets,
			bonusWallets: next.bonusWallets
		};
		sessionStorage.setItem(READ_AT_KEY, JSON.stringify(stored));
	} catch {}
}
const accountBalance = (() => {
	let state = {
		status: "idle",
		wallets: [],
		bonusWallets: [],
		error: null,
		at: 0
	};
	const listeners = /* @__PURE__ */ new Set();
	let inFlight = null;
	let lastRead = 0;
	let attached = false;
	function emit() {
		for (const listener of listeners) listener();
	}
	function read(force) {
		if (!attached) return Promise.resolve();
		const now = Date.now();
		if (inFlight !== null) return inFlight;
		if (!force && state.status === "ready" && now - lastRead < 15e3) return Promise.resolve();
		lastRead = now;
		if (state.status === "idle") {
			state = {
				...state,
				status: "loading"
			};
			emit();
		}
		const settle = (next) => {
			state = next;
			store(next);
			emit();
		};
		const task = (async () => {
			try {
				const response = await fetch(BALANCE_ROUTE, {
					method: "GET",
					headers: { accept: "application/json" },
					credentials: "same-origin",
					cache: "no-store"
				});
				if (!response.ok) {
					settle({
						status: "error",
						wallets: [],
						bonusWallets: [],
						error: `HTTP ${response.status}`,
						at: Date.now()
					});
					return;
				}
				const outcome = readBalanceResponse(await response.json());
				if (outcome.kind === "no-key") {
					settle({
						status: "no-key",
						wallets: [],
						bonusWallets: [],
						error: null,
						at: Date.now()
					});
					return;
				}
				if (outcome.kind === "error") {
					settle({
						status: "error",
						wallets: [],
						bonusWallets: [],
						error: outcome.error,
						at: Date.now()
					});
					return;
				}
				settle({
					status: "ready",
					wallets: outcome.wallets,
					bonusWallets: outcome.bonusWallets,
					error: outcome.unavailable ? "unavailable" : null,
					at: Date.now()
				});
			} catch (error) {
				settle({
					status: "error",
					wallets: [],
					bonusWallets: [],
					error: error instanceof Error ? error.message : String(error),
					at: Date.now()
				});
			} finally {
				inFlight = null;
			}
		})();
		inFlight = task;
		return task;
	}
	return {
		attach() {
			attached = true;
			const stored = readStored();
			if (stored !== void 0) {
				state = {
					status: stored.status,
					wallets: stored.wallets,
					bonusWallets: stored.bonusWallets,
					error: null,
					at: stored.at
				};
				emit();
				return;
			}
			read(false);
		},
		detach() {
			attached = false;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return state;
		},
		refresh() {
			if (!attached) return Promise.resolve();
			if (inFlight !== null) return inFlight;
			if (Date.now() - lastRead < 3e3) return Promise.resolve();
			return read(true);
		}
	};
})();

//#endregion
//#region src/client/stores/turn-baseline.ts
const KEY = "dsh-token-billing/turn-baseline/v1";
function readTurnBaseline(sessionId) {
	if (sessionId === void 0) return void 0;
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw === null) return void 0;
		const parsed = JSON.parse(raw);
		if (parsed.id !== sessionId || typeof parsed.at !== "number") return void 0;
		if (Date.now() - parsed.at > 18e5) return void 0;
		return {
			usage: parsed.usage ?? {},
			at: parsed.at
		};
	} catch {
		return;
	}
}
function writeTurnBaseline(sessionId, usage, at) {
	if (sessionId === void 0) return;
	try {
		const stored = {
			id: sessionId,
			at,
			usage
		};
		sessionStorage.setItem(KEY, JSON.stringify(stored));
	} catch {}
}

//#endregion
//#region src/client/stores/price-book.ts
const RETRY_BASE_MS = 3e4;
const RETRY_CEILING_MS = 6e5;
const CACHE_KEY = "dsh-token-billing/price-book/v1";
const CACHE_TTL_MS = 864e5;
const CACHE_HARD_TTL_MS = 6048e5;
function readCache() {
	if (typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (raw === null) return null;
		const entry = JSON.parse(raw);
		if (typeof entry?.at !== "number" || entry.branches === null) return null;
		const age = Date.now() - entry.at;
		if (age > CACHE_HARD_TTL_MS) return null;
		const branches = entry.branches;
		if (typeof branches !== "object" || Object.keys(branches).length === 0) return null;
		return {
			book: indexBook(branches),
			fresh: age < CACHE_TTL_MS
		};
	} catch {
		return null;
	}
}
function writeCache(branches) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({
			at: Date.now(),
			branches
		}));
	} catch {}
}
const priceBook = (() => {
	let state = {
		status: "loading",
		book: emptyBook(),
		error: null
	};
	const listeners = /* @__PURE__ */ new Set();
	let started = false;
	let timer = null;
	let attempt = 0;
	function emit() {
		for (const listener of listeners) listener();
	}
	function scheduleRetry() {
		attempt += 1;
		const delay = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_CEILING_MS);
		timer = setTimeout(fetchBook, delay);
	}
	function fetchBook() {
		if (typeof fetch !== "function") {
			state = {
				status: "error",
				book: emptyBook(),
				error: "fetch unavailable"
			};
			emit();
			return;
		}
		fetch(MODELS_DEV_URL, { headers: { accept: "application/json" } }).then((response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json();
		}).then((payload) => {
			const book = buildBook(payload);
			if (Object.keys(book.branches).length === 0) throw new Error("empty price registry");
			attempt = 0;
			writeCache(book.branches);
			state = {
				status: "ready",
				book,
				error: null
			};
			emit();
		}).catch((error) => {
			if (state.status !== "ready") {
				state = {
					status: "error",
					book: emptyBook(),
					error: error instanceof Error ? error.message : String(error)
				};
				emit();
			}
			scheduleRetry();
		});
	}
	function load() {
		const cached = readCache();
		if (cached !== null) {
			state = {
				status: "ready",
				book: cached.book,
				error: null
			};
			emit();
			if (cached.fresh) return;
		}
		fetchBook();
	}
	return {
		subscribe(listener) {
			listeners.add(listener);
			if (!started) {
				started = true;
				load();
			}
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return state;
		},
		dispose() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
			listeners.clear();
			started = false;
			attempt = 0;
			state = {
				status: "loading",
				book: emptyBook(),
				error: null
			};
		}
	};
})();

//#endregion
//#region src/client/components/BillingHoverCard.tsx
function BillingHoverCard({ priced, amount, panelRef, style }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: panelRef,
		className: "tb-hover",
		role: "tooltip",
		style,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "tb-hoverAmount",
			children: amount
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "tb-hoverBasis",
			children: priced.kind === "ok" ? `${priced.modelName} · ${t(priced.peak ? "panel.peak" : "panel.offPeak")}${t("hover.estimated")}` : t("hover.details")
		})]
	});
}

//#endregion
//#region src/client/components/BalanceValue.tsx
function BalanceValue({ state }) {
	if (state.status === "idle" || state.status === "loading") return ["…"];
	if (state.status === "no-key" || state.status === "error") return ["—"];
	if (state.wallets.length === 0) return ["—"];
	const bonusTotal = state.bonusWallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0);
	const parts = state.wallets.map((wallet) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		"data-token-billing-wallet": wallet.currency,
		children: formatBalance(wallet.balance, wallet.currency === "CNY" ? "¥" : "$")
	}, `b-${wallet.currency}`));
	if (bonusTotal > 0) {
		const currency = state.wallets[0]?.currency ?? "CNY";
		parts.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "tb-granted",
			children: `+${formatBalance(String(bonusTotal), currency === "USD" ? "$" : "¥")}`
		}, "b-granted"));
	}
	return parts;
}

//#endregion
//#region src/client/components/SubagentCard.tsx
function subagentCardPosition(panel, card, viewport) {
	return {
		left: Math.min(Math.max(panel.left - card.width - 8, 12), Math.max(12, viewport.width - card.width - 12)),
		top: Math.min(Math.max(panel.top, 12), Math.max(12, viewport.height - card.height - 12))
	};
}
function SubagentCard({ agents, cardRef, style }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: cardRef,
		className: "tb-subagents",
		role: "dialog",
		"aria-label": t("subagents.aria"),
		"data-token-billing-subagents": true,
		style,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "tb-subagentTitle",
			children: t("subagents.title")
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
			className: "tb-subagentList",
			children: [agents.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "tb-subagentItem",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "tb-subagentLine",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "tb-subagentLabel",
						title: item.label,
						children: item.label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "tb-subagentCost",
						children: formatCost(item.cny)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "tb-subagentMeta",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "tb-subagentModel",
						title: item.modelName,
						children: item.modelName
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "tb-subagentTokens",
						title: `${formatExactTokens(item.tokens)} token`,
						children: `${formatTokens(item.tokens)} token`
					})]
				})]
			}, item.id)), agents.overflow > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
				className: "tb-subagentMore",
				children: t("subagents.more", { count: agents.overflow })
			})]
		})]
	});
}

//#endregion
//#region src/client/components/UnitRatesCard.tsx
function UnitRatesCard({ rate }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "tb-rateCard",
		"data-token-billing-rates": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
				className: "tb-details",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("bucket.miss") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.miss)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("bucket.hit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.hit)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("bucket.write") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.write)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("bucket.out") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.out)) })]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: t("panel.rateNote")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note tb-rateSource",
				children: t("panel.rateSource")
			})
		]
	});
}

//#endregion
//#region src/client/components/BillingPanel.tsx
const useBrowserLayoutEffect = typeof document === "undefined" ? react.useEffect : react.useLayoutEffect;
const BUCKET_LABEL = {
	uncachedInputTokens: "bucket.miss",
	cacheReadTokens: "bucket.hit",
	cacheWriteTokens: "bucket.write",
	outputTokens: "bucket.out"
};
function Chevron({ className = "tb-rateToggleChevron" }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		className,
		width: "12",
		height: "12",
		viewBox: "0 0 12 12",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.4",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M3 4.5 6 7.5 9 4.5",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function BillingPanel({ priced, balance, headline, totalCny, panelRef, style, defaultRatesOpen = false, rows, totalTokens, agents, search, insight, burn, turn }) {
	const animatedTurnCny = useCountUp(turn?.cny ?? 0);
	const animatedCny = useCountUp(totalCny);
	const detailRows = rows ?? (priced.kind === "ok" ? priced.rows : []);
	const detailTokens = totalTokens ?? (priced.kind === "ok" ? priced.totalTokens : 0);
	const [ratesOpen, setRatesOpen] = (0, react.useState)(defaultRatesOpen);
	const ratesId = (0, react.useId)();
	const [agentsOpen, setAgentsOpen] = (0, react.useState)(false);
	const [agentsPos, setAgentsPos] = (0, react.useState)(null);
	const agentTriggerRef = (0, react.useRef)(null);
	const agentCardRef = (0, react.useRef)(null);
	const agentListable = agents !== void 0 && agents.count > 0 && agents.items.length > 0;
	const setAgentsVisible = (0, react.useCallback)((open) => {
		setAgentsOpen(open);
		if (!open) setAgentsPos(null);
	}, []);
	(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(agentTriggerRef, agentsOpen, setAgentsVisible, agentCardRef);
	useBrowserLayoutEffect(() => {
		if (!agentsOpen) return void 0;
		const place = () => {
			const panel = panelRef.current;
			const card = agentCardRef.current;
			if (panel === null || card === null) return;
			setAgentsPos(subagentCardPosition(panel.getBoundingClientRect(), card.getBoundingClientRect(), {
				width: window.innerWidth,
				height: window.innerHeight
			}));
		};
		place();
		window.addEventListener("resize", place);
		document.addEventListener("scroll", place, true);
		return () => {
			window.removeEventListener("resize", place);
			document.removeEventListener("scroll", place, true);
		};
	}, [agentsOpen, panelRef]);
	(0, react.useEffect)(() => {
		if (!agentsOpen) return void 0;
		const onKeyDown = (event) => {
			if (event.key === "Escape") setAgentsVisible(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [agentsOpen, setAgentsVisible]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		ref: panelRef,
		className: "tb-panel",
		role: "dialog",
		"aria-label": t("panel.aria"),
		style,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "tb-title",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "tb-titleLabel",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular, {}), t("panel.title")]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "tb-titleValue",
					children: priced.kind === "ok" ? formatCost(totalCny) : headline
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-titleRule",
				"aria-hidden": true
			}),
			priced.kind === "ok" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: "tb-details",
					"data-token-billing-details": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.model") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-model": "",
								children: priced.modelName
							})]
						}),
						search === void 0 || search.calls === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							"data-token-billing-search": "",
							title: t("panel.searchBasis"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.search") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("panel.searchValue", {
								count: search.calls,
								cost: formatCost(search.cny)
							}) })]
						}),
						detailRows.flatMap((row) => row.tokens === 0 ? [] : [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t(BUCKET_LABEL[row.key] ?? "") || row.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${formatTokens(row.tokens)} · ${formatCost(toCny(row.usd))}` })]
						}, row.key)]),
						turn !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							"data-token-billing-turn-value": "",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.turn") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${formatTokens(turn.tokens)} · ${formatCost(animatedTurnCny)}` })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("panel.session") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-session-value": "",
								children: `${formatTokens(detailTokens)} · ${formatCost(animatedCny)}`
							})]
						}),
						agents !== void 0 && agents.count > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row tb-agentRow",
							"data-open": agentListable && agentsOpen ? "true" : void 0,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: agentListable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								ref: agentTriggerRef,
								type: "button",
								className: "tb-agentTrigger",
								"aria-expanded": agentsOpen,
								"data-token-billing-agents-toggle": true,
								onClick: () => setAgentsVisible(!agentsOpen),
								children: [t("panel.agents"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { className: "tb-agentChevron" })]
							}) : t("panel.agents") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-agents": agents.count,
								children: agents.unreported > 0 ? `${t("panel.agentsCount", {
									count: agents.count,
									tokens: formatTokens(agents.tokens),
									cost: formatCost(agents.cny)
								})}${t("panel.agentsUnreported", { count: agents.unreported })}` : t("panel.agentsCount", {
									count: agents.count,
									tokens: formatTokens(agents.tokens),
									cost: formatCost(agents.cny)
								})
							})]
						})
					]
				}),
				agentListable && agentsOpen && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubagentCard, {
					agents,
					cardRef: agentCardRef,
					style: agentsPos ?? MEASURE_STYLE
				}), document.body),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "tb-rateToggle",
					"aria-expanded": ratesOpen,
					"aria-controls": ratesId,
					"data-token-billing-rates-toggle": true,
					onClick: () => setRatesOpen(!ratesOpen),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tb-rateToggleLabel",
							children: t("panel.rates")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tb-rateToggleHint",
							children: t(priced.peak ? "panel.peak" : "panel.offPeak")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "tb-rateReveal",
					"data-open": ratesOpen,
					id: ratesId,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "tb-rateRevealInner",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnitRatesCard, { rate: priced.rate })
					})
				})
			] }),
			priced.kind === "no-book" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: t("panel.loading")
			}),
			priced.kind === "unpriced" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: t("panel.noRateDetail")
			}),
			priced.kind === "no-route" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: t("panel.noModel")
			}),
			insight === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				"data-token-billing-insight": "",
				children: insight
			}),
			burn === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				"data-token-billing-burn": "",
				children: burn
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "tb-balanceRow",
				"data-token-billing-balance": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "tb-balanceLabel",
					children: t("panel.balance")
				}), balance.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("balance.usageTip"),
					side: "top",
					portal: true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: "tb-balanceValue tb-balanceLink",
						href: USAGE_URL,
						target: "_blank",
						rel: "noreferrer",
						"data-token-billing-balance-value": balance.status,
						"data-token-billing-balance-link": "",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BalanceValue, { state: balance })
					})
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "tb-balanceValue",
					"data-token-billing-balance-value": balance.status,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BalanceValue, { state: balance })
				})]
			})
		]
	});
}

//#endregion
//#region src/client/components/BillingChip.tsx
function BillingChip({ useProjection, useSessionStatus, useSessions, useTrajectory, sessionId }) {
	const usage = useProjection("tokenUsage");
	const selection = useProjection("modelSelection");
	const provider = selection?.next?.provider ?? selection?.lastUsed?.provider;
	const model = selection?.next?.model ?? selection?.lastUsed?.model;
	const running = useSessionStatus((statuses) => statuses.get(sessionId ?? "")?.running === true);
	const sessionState = useSessions((state) => state);
	const descendants = react.useMemo(() => collectChildUsage(sessionState, sessionId), [sessionState, sessionId]);
	const book = react.useSyncExternalStore(priceBook.subscribe, priceBook.getSnapshot, priceBook.getSnapshot);
	const balance = react.useSyncExternalStore(accountBalance.subscribe, accountBalance.getSnapshot, accountBalance.getSnapshot);
	const [now, setNow] = react.useState(() => Date.now());
	react.useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), POSTURE_REFRESH_MS);
		return () => clearInterval(id);
	}, []);
	const [baseline, setBaseline] = react.useState(() => running ? readTurnBaseline(sessionId) : void 0);
	const previousRunning = react.useRef(baseline !== void 0);
	react.useEffect(() => {
		if (!running) {
			previousRunning.current = false;
			return;
		}
		if (previousRunning.current) return;
		previousRunning.current = true;
		const start = usage ?? {};
		const at = Date.now();
		setBaseline({
			usage: start,
			at
		});
		writeTurnBaseline(sessionId, start, at);
	}, [
		running,
		usage,
		sessionId
	]);
	const [hover, setHover] = react.useState(false);
	const [open, setOpen] = react.useState(false);
	const { anchorRef, panelRef, pos } = useOverlay(open, setOpen);
	const hoverSeat = useOverlay(hover && !open, setHover);
	react.useEffect(() => {
		if (open) accountBalance.refresh();
	}, [open]);
	const trajectory = useTrajectory((snapshot) => snapshot);
	const requests = react.useMemo(() => billedRequestsOf(trajectory), [trajectory]);
	const searchCalls = react.useMemo(() => searchCallsIn(trajectory), [trajectory]);
	const searches = react.useMemo(() => searchCalls.reduce((total, call) => total + call.queries, 0), [searchCalls]);
	const session = react.useMemo(() => attributeRequests(requests, book.book, searches), [
		requests,
		book.book,
		searches
	]);
	const priced = react.useMemo(() => priceUsage(usage, book.book, provider, model, new Date(now)), [
		usage,
		book.book,
		provider,
		model,
		now
	]);
	const sources = descendants.sources;
	const tree = react.useMemo(() => priceSessionTree(sources, book.book, new Date(now)), [
		sources,
		book.book,
		now
	]);
	const attributed = react.useMemo(() => {
		if (session.groups.length === 0) return null;
		const covered = attributedBuckets(session);
		const rest = usage === void 0 ? {} : subtractBuckets(usage, covered);
		const restPriced = countTokens(rest) > 0 ? priceUsage(rest, book.book, provider, model, new Date(now)) : null;
		const rows = session.groups.map((group) => {
			const usd = group.cny * USD_PER_CNY;
			return {
				key: `${group.providerId}:${group.modelId}:${group.peak ? "peak" : "off"}`,
				label: isDeepSeekRoute(group.providerId) ? `${t(group.peak ? "attribution.peak" : "attribution.off")} · ${group.modelName}` : group.modelName,
				tokens: group.tokens,
				usd,
				rate: group.tokens > 0 ? usd * 1e6 / group.tokens : 0
			};
		});
		let totalCny = session.totalCny;
		let totalTokens = session.totalTokens;
		if (restPriced?.kind === "ok") {
			const usd = restPriced.totalCny * USD_PER_CNY;
			rows.push({
				key: "remainder",
				label: t("attribution.remainder"),
				tokens: restPriced.totalTokens,
				usd,
				rate: restPriced.totalTokens > 0 ? usd * 1e6 / restPriced.totalTokens : 0
			});
			totalCny += restPriced.totalCny;
			totalTokens += restPriced.totalTokens;
		}
		return {
			rows,
			totalCny,
			totalTokens
		};
	}, [
		session,
		usage,
		book.book,
		provider,
		model,
		now
	]);
	const turn = react.useMemo(() => {
		if (baseline === void 0 || usage === void 0) return void 0;
		const since = searchCalls.filter((call) => call.at >= baseline.at).reduce((total, call) => total + call.queries, 0);
		return attributeTurn(requests, book.book, baseline, usage, {
			provider,
			model,
			at: new Date(now)
		}, since);
	}, [
		baseline,
		usage,
		requests,
		book.book,
		provider,
		model,
		now,
		searchCalls
	]);
	const insight = react.useMemo(() => {
		if (usage === void 0 || priced.kind !== "ok") return void 0;
		const saving = cacheSaving(usage, priced.rate, priced.factor);
		if (saving !== void 0 && saving.hitRate >= .5) return t("insight.cache", {
			rate: `${(saving.hitRate * 100).toFixed(1)}%`,
			cost: formatCost(saving.savedCny)
		});
		const share = dominantShare(usage, priced.rate, priced.factor);
		return share === void 0 ? void 0 : t("insight.bucket", {
			label: share.label,
			share: `${String(Math.round(share.share * 100))}%`
		});
	}, [
		usage,
		priced,
		t
	]);
	const burnRef = react.useRef(void 0);
	const turnCny = turn?.cny;
	react.useEffect(() => {
		if (turnCny === void 0 || baseline === void 0 || turnCny <= 0) {
			burnRef.current = void 0;
			return;
		}
		burnRef.current = {
			cny: turnCny,
			minutes: (Date.now() - baseline.at) / 6e4
		};
	}, [turnCny, baseline]);
	const burn = react.useMemo(() => {
		const snapshot = burnRef.current;
		if (snapshot === void 0 || snapshot.minutes <= 0) return void 0;
		const wallet = balance.status === "ready" ? balance.wallets[0] : void 0;
		const left = wallet === void 0 ? NaN : Number(wallet.balance);
		const remaining = burnRemainingMs(snapshot.cny, snapshot.minutes * 6e4, left);
		if (remaining === void 0) return void 0;
		const raw = Math.floor(remaining / 6e4);
		const minutes = raw < 30 ? Math.max(5, Math.round(raw / 5) * 5) : raw < 120 ? Math.round(raw / 10) * 10 : Math.round(raw / 30) * 30;
		return t("burn.line", {
			rate: formatCost(snapshot.cny / snapshot.minutes),
			duration: minutes < 60 ? t("burn.minutes", { minutes }) : t("burn.hours", {
				hours: Math.floor(minutes / 60),
				minutes: minutes % 60
			})
		});
	}, [
		balance,
		turnCny,
		t
	]);
	const flatCny = priced.kind === "ok" ? priced.totalCny + session.searchCny : 0;
	const rootCny = attributed?.totalCny ?? flatCny;
	const rootTokens = attributed?.totalTokens ?? (priced.kind === "ok" ? priced.totalTokens : 0);
	const totalCny = rootCny + (priced.kind === "ok" ? tree?.totalCny ?? 0 : 0);
	const totalTokens = rootTokens + (priced.kind === "ok" ? tree?.totalTokens ?? 0 : 0);
	const rows = priced.kind === "ok" ? attributed?.rows ?? priced.rows : [];
	const agents = priced.kind === "ok" && tree !== null ? {
		...tree.agents,
		unreported: descendants.unreported
	} : void 0;
	const animatedCny = useCountUp(totalCny);
	const animatedTurnCny = useCountUp(turn?.cny ?? 0);
	if (priced.kind === "no-usage") return null;
	const headline = priced.kind === "ok" ? formatCost(animatedCny) : priced.kind === "no-book" ? "¥ —" : "¥ ?";
	const anchorLabel = t(priced.kind === "ok" ? "chip.sessionCost" : "chip.sessionCostBare");
	const wallet = balance.status === "ready" ? balance.wallets[0] : void 0;
	const balanceText = wallet === void 0 ? void 0 : formatBalance(wallet.balance, wallet.currency === "CNY" ? "¥" : "$");
	const chipLabel = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "tb-label",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-amount",
				children: headline
			}),
			balanceText !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-sep",
				"aria-hidden": true,
				children: "/"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-balanceNow",
				"data-token-billing-balance-now": "",
				children: balanceText
			})] }),
			turn !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-sep",
				"aria-hidden": true,
				children: "·"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-turn",
				"data-token-billing-turn": "",
				children: `${t("chip.turnTokens", { tokens: formatTokens(turn.tokens) })} ${t("chip.turnCost", { cost: formatCost(animatedTurnCny) })}`
			})] }),
			running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-running",
				"data-token-billing-live": "",
				"aria-hidden": true
			})
		]
	});
	const hoverAmount = priced.kind === "ok" ? formatCost(totalCny) : priced.kind === "no-book" ? t("panel.noBook") : t("panel.noRate");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "tb-root",
		"data-token-billing": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				ref: (node) => {
					anchorRef.current = node;
					hoverSeat.anchorRef.current = node;
				},
				className: "tb-anchor",
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "tb-pill",
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					"aria-label": `${anchorLabel} ${formatCost(totalCny)}${balanceText === void 0 ? "" : t("chip.balanceSuffix", { amount: balanceText })}${running ? t("chip.billingSuffix") : ""}`,
					"data-token-billing-amount": priced.kind === "ok" ? totalCny : "",
					onClick: () => {
						setHover(false);
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular, { className: "tb-icon" }), chipLabel]
				})
			}),
			hover && !open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BillingHoverCard, {
				priced,
				amount: hoverAmount,
				panelRef: hoverSeat.panelRef,
				style: hoverSeat.pos ?? MEASURE_STYLE
			}), document.body),
			open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BillingPanel, {
				priced,
				balance,
				headline,
				totalCny,
				rows,
				totalTokens,
				agents,
				turn,
				search: searches > 0 ? {
					calls: searches,
					cny: session.searchCny
				} : void 0,
				insight,
				burn,
				panelRef,
				style: pos ?? MEASURE_STYLE
			}), document.body)
		]
	});
}

//#endregion
//#region \0dsh-css-text:/Users/eivmosn/Desktop/dsh-token-billing/src/client/billing.css.mjs
var billing_css_default = ".tb-root {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  justify-content: center;\n  align-items: center;\n  display: flex;\n  order: 9999;\n}\n\n[class*=\"dock\"] > [data-token-billing],\n[class*=\"dock\"] [data-token-billing] {\n  order: 9999;\n}\n\n.tb-anchor {\n  min-width: 0;\n  align-items: center;\n  display: inline-flex;\n  position: relative;\n}\n\n.tb-pill {\n  box-sizing: border-box;\n  corner-shape: round;\n  max-width: 100%;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-variant-numeric: tabular-nums;\n  line-height: inherit;\n  white-space: nowrap;\n  background: 0 0;\n  border: none;\n  border-radius: 999px;\n  align-items: center;\n  gap: 6px;\n  padding: 1px 8px;\n  display: inline-flex;\n}\n\n.tb-pill .tb-icon {\n  flex: none;\n  width: 14px;\n  height: 14px;\n}\n\nbutton.tb-pill {\n  cursor: pointer;\n}\n\nbutton.tb-pill:hover,\nbutton.tb-pill[aria-expanded=\"true\"] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-label {\n  text-overflow: ellipsis;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-sep {\n  color: var(--dsw-alias-separator-primary);\n  margin: 0 6px;\n}\n\n.tb-panel {\n  z-index: 1100;\n  box-sizing: border-box;\n  isolation: isolate;\n  position: fixed;\n  width: max-content;\n  min-width: min(300px, 100vw - 24px);\n  max-width: min(440px, 100vw - 24px);\n  border: 0;\n  border-radius: var(--dsw-radius-lg);\n  padding: 16px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n  --tb-wash-fade: linear-gradient(180deg, #000 0, rgb(0 0 0 / 35%) 34px, transparent 78px);\n}\n\n.tb-panel::before,\n.tb-hover::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  border-radius: inherit;\n  background-image: linear-gradient(\n    104deg,\n    color-mix(in srgb, var(--dsw-static-deepseek-400) 30%, transparent) 0%,\n    color-mix(in srgb, var(--dsw-static-blue-500) 26%, transparent) 20%,\n    color-mix(in srgb, var(--dsw-static-green-500) 24%, transparent) 40%,\n    color-mix(in srgb, var(--dsw-static-amber-400) 28%, transparent) 62%,\n    color-mix(in srgb, var(--dsw-static-red-400) 30%, transparent) 82%,\n    color-mix(in srgb, var(--dsw-static-red-500) 24%, transparent) 100%\n  );\n  -webkit-mask-image: var(--tb-wash-fade, none);\n  mask-image: var(--tb-wash-fade, none);\n}\n\n.tb-title {\n  color: var(--dsw-alias-label-primary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 16px;\n  margin-bottom: 8px;\n  font-weight: 500;\n  display: flex;\n}\n\n.tb-titleRule,\n.tb-subagentTitle::after {\n  height: 1px;\n  background: var(--dsw-alias-border-l1);\n}\n\n.tb-titleRule {\n  margin-bottom: 12px;\n}\n\n.tb-titleValue {\n  font-variant-numeric: tabular-nums;\n  font-weight: 600;\n  font-size: 14px;\n  letter-spacing: -0.01em;\n}\n\n.tb-titleLabel {\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  display: inline-flex;\n}\n\n.tb-titleLabel svg {\n  flex: none;\n  width: 14px;\n  height: 14px;\n}\n\n.tb-details {\n  color: var(--dsw-alias-label-tertiary);\n  margin: -3px 0;\n  display: block;\n}\n\n.tb-row {\n  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);\n  gap: 0 16px;\n  align-items: baseline;\n  margin: 0 -8px;\n  padding: 3px 8px;\n  border-radius: 6px;\n  background-color: transparent;\n  transition: background-color 0.18s ease;\n  display: grid;\n}\n\n.tb-details dt,\n.tb-details dd {\n  min-width: 0;\n  margin: 0;\n  transition: color 0.18s ease;\n}\n\n.tb-details dd {\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n.tb-row:hover {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-row:hover dt {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-row:hover dd {\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-agentRow {\n  position: relative;\n}\n\n.tb-agentRow[data-open=\"true\"] {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-agentTrigger {\n  appearance: none;\n  align-items: center;\n  gap: 4px;\n  max-width: 100%;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  background: 0 0;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  display: inline-flex;\n}\n\n.tb-agentTrigger::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border-radius: 6px;\n}\n\n.tb-agentTrigger:focus-visible {\n  outline: none;\n}\n\n.tb-agentTrigger:focus-visible::after {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.tb-agentChevron {\n  flex: none;\n  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n.tb-agentTrigger[aria-expanded=\"true\"] .tb-agentChevron {\n  transform: rotate(90deg);\n}\n\n.tb-rateToggle {\n  appearance: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  margin-top: 14px;\n  padding: 7px 10px;\n  border: 0;\n  border-radius: 10px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-weight: 500;\n  text-align: left;\n  cursor: pointer;\n  transition: background 0.18s ease, color 0.18s ease;\n}\n\n.tb-rateToggle:hover {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-rateToggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.tb-rateToggleLabel {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.tb-rateToggleHint {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-weight: 400;\n}\n\n.tb-rateToggleChevron {\n  flex: none;\n  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n.tb-rateToggle[aria-expanded=\"true\"] .tb-rateToggleChevron {\n  transform: rotate(180deg);\n}\n\n.tb-rateReveal {\n  display: grid;\n  grid-template-rows: 0fr;\n  opacity: 0;\n  transition: grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease;\n}\n\n.tb-rateReveal[data-open=\"true\"] {\n  grid-template-rows: 1fr;\n  opacity: 1;\n}\n\n.tb-rateRevealInner {\n  min-height: 0;\n  overflow: hidden;\n  visibility: hidden;\n  transition: visibility 0s linear 0.28s;\n}\n\n.tb-rateReveal[data-open=\"true\"] .tb-rateRevealInner {\n  visibility: visible;\n  transition-delay: 0s;\n}\n\n.tb-rateCard {\n  position: relative;\n  isolation: isolate;\n  margin-top: 10px;\n  padding: 11px 12px 10px;\n  border-radius: var(--dsw-radius-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1);\n}\n\n.tb-note {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 10px;\n  overflow-wrap: anywhere;\n}\n\n.tb-subagents {\n  z-index: 1100;\n  box-sizing: border-box;\n  position: fixed;\n  width: 244px;\n  max-height: min(60vh, 420px);\n  overflow: hidden auto;\n  padding: 12px;\n  border-radius: var(--dsw-radius-md);\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.tb-subagentTitle {\n  color: var(--dsw-alias-label-primary);\n  margin-bottom: 0;\n  font-weight: 500;\n}\n\n.tb-subagentTitle::after {\n  content: \"\";\n  margin: 7px 0 4px;\n  display: block;\n}\n\n.tb-subagentList {\n  flex-direction: column;\n  gap: 4px;\n  margin: -3px 0;\n  padding: 0;\n  list-style: none;\n  display: flex;\n}\n\n.tb-subagentItem {\n  margin: 0 -8px;\n  padding: 3px 8px;\n  border-radius: 6px;\n  transition: background-color 0.18s ease;\n}\n\n.tb-subagentItem:hover {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-subagentLine {\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 12px;\n  display: flex;\n}\n\n.tb-subagentLabel {\n  color: var(--dsw-alias-label-secondary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-subagentCost {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  flex: none;\n}\n\n.tb-subagentLabel,\n.tb-subagentMeta {\n  transition: color 0.18s ease;\n}\n\n.tb-subagentItem:hover .tb-subagentLabel {\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-subagentItem:hover .tb-subagentMeta {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-subagentMeta {\n  color: var(--dsw-alias-label-tertiary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 10px;\n  margin-top: 1px;\n  font-size: 11px;\n  display: flex;\n}\n\n.tb-subagentModel {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-subagentTokens {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-subagentMore {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.tb-rateSource {\n  margin-top: 6px;\n  font-size: 11px;\n}\n\n.tb-balanceRow {\n  color: var(--dsw-alias-label-tertiary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 16px;\n  margin-top: 14px;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  font-weight: 500;\n  display: flex;\n}\n\n.tb-balanceValue {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  min-width: 0;\n  text-align: right;\n  overflow-wrap: anywhere;\n}\n\n.tb-balanceLink {\n  color: inherit;\n  text-decoration: none;\n}\n\n.tb-balanceLink:hover {\n  text-decoration: underline;\n}\n\n\n.tb-granted {\n  color: var(--dsw-alias-label-tertiary);\n  margin-left: 6px;\n  font-weight: 400;\n}\n\n.tb-hover {\n  z-index: 1100;\n  box-sizing: border-box;\n  isolation: isolate;\n  position: fixed;\n  border: 0;\n  border-radius: var(--dsw-radius-md);\n  padding: 9px 11px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n  --tb-wash-fade: linear-gradient(180deg, #000 0, rgb(0 0 0 / 35%) 16px, transparent 46px);\n}\n\n.tb-hoverAmount {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  font-size: 13px;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-hoverBasis {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 3px;\n}\n\n.tb-amount {\n  font-variant-numeric: tabular-nums;\n  transition: color 0.25s var(--ds-ease-in-out, ease-in-out);\n}\n\n.tb-balanceNow {\n  opacity: 0.6;\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-running {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  margin-left: 6px;\n  vertical-align: middle;\n  position: relative;\n  top: -1px;\n  background: var(--dsw-alias-state-success-primary);\n  flex: none;\n  display: inline-block;\n  animation: tb-breathe 1.8s ease-in-out infinite;\n}\n\n@keyframes tb-breathe {\n  0%,\n  100% {\n    opacity: 1;\n    transform: scale(1);\n  }\n\n  50% {\n    opacity: 0.4;\n    transform: scale(0.72);\n  }\n}\n\n\n.tb-turn {\n  opacity: 0.85;\n  font-variant-numeric: tabular-nums;\n}\n\n@supports (corner-shape: superellipse(1.25)) {\n  .tb-panel,\n  .tb-hover,\n  .tb-rateCard,\n  .tb-subagents {\n    corner-shape: superellipse(1.25);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .tb-rateToggleChevron,\n  .tb-rateReveal,\n  .tb-rateRevealInner,\n  .tb-row,\n  .tb-details dt,\n  .tb-details dd,\n  .tb-agentChevron,\n  .tb-subagentItem,\n  .tb-subagentLabel,\n  .tb-subagentMeta {\n    transition: none;\n  }\n\n  .tb-running {\n    animation: none;\n  }\n}\n";

//#endregion
//#region src/client/styles.ts
const STYLE_TAG_ID = "dsh-token-billing/billing.css";
const PLUGIN_NAME = "dsh-token-billing";
function insertStyles() {
	if (typeof document === "undefined") return () => {};
	const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`);
	if (existing !== null) return () => {
		existing.remove();
	};
	const tag = document.createElement("style");
	tag.dataset.plugin = PLUGIN_NAME;
	tag.dataset.pluginCss = STYLE_TAG_ID;
	tag.textContent = billing_css_default;
	document.head.appendChild(tag);
	return () => {
		tag.remove();
	};
}

//#endregion
//#region src/client/index.ts
const name = "dsh-token-billing";
const inject = ["slots", "locale"];
function apply(ctx) {
	const locale = ctx.locale ?? ctx.get?.("locale");
	ctx.effect(() => registerDictionaries(locale), "dsh-token-billing: dictionaries");
	bindLocale(locale);
	const disposeStyles = insertStyles();
	ctx.effect(() => disposeStyles, "dsh-token-billing: styles");
	accountBalance.attach();
	ctx.effect(() => () => accountBalance.detach(), "dsh-token-billing: account balance");
	ctx.effect(() => () => priceBook.dispose(), "dsh-token-billing: price book");
	ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
		name: "conversation.composer.dock",
		id: "token-billing",
		order: 10,
		registrant: "dsh-token-billing"
	}, BillingChip));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });
//# sourceMappingURL=client.js.map