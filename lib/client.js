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
const DEEPSEEK_PROVIDER = /deepseek/i;
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
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e4) return `${Math.round(value / 1e3)}K`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return String(value);
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
	const peak = DEEPSEEK_PROVIDER.test(provider) && isPeak(at);
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
		if (index > 0) {
			agentCount += 1;
			agentCny += result.totalCny;
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
		}
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
//#region src/client/constants.ts
const COUNT_UP_EPSILON = 5e-4;
const MEASURE_STYLE = {
	visibility: "hidden",
	left: 0,
	top: 0
};
const BALANCE_REUSE_MS = 15e3;
const BALANCE_FRESH_MS = 3e3;
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
			children: priced.kind === "ok" ? `${priced.modelName}${priced.peak ? " · 高峰" : " · 低谷"}（估算）` : "点击查看详情"
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
		"aria-label": "子智能体花费",
		"data-token-billing-subagents": true,
		style,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "tb-subagentTitle",
			children: "子智能体"
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
				children: `另有 ${agents.overflow} 个`
			})]
		})]
	});
}

//#endregion
//#region src/client/components/UnitRatesCard.tsx
function UnitRatesCard({ rate, peak }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "tb-rateCard",
		"data-token-billing-rates": true,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
				className: "tb-details",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "未缓存输入" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.miss)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "缓存读取" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.hit)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "缓存写入" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.write)) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "tb-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "输出" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatRate(toCny(rate.out)) })]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: peak ? `当前为高峰时段，已按挂牌价 ×2 计（低谷为半价）。` : `当前为低谷时段，按半价计（高峰为挂牌价 ×2）。`
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note tb-rateSource",
				children: `挂牌价以 USD 计，按 1 CNY = ${USD_PER_CNY} USD 折算。`
			})
		]
	});
}

//#endregion
//#region src/client/components/BillingPanel.tsx
const useBrowserLayoutEffect = typeof document === "undefined" ? react.useEffect : react.useLayoutEffect;
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
function BillingPanel({ priced, balance, headline, totalCny, panelRef, style, defaultRatesOpen = false, rows, totalTokens, agents, turn }) {
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
		"aria-label": "Token 计费详情",
		style,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "tb-title",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "tb-titleLabel",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutlineRegular, {}), "本会话预估费用"]
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
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "模型" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-model": "",
								children: priced.modelName
							})]
						}),
						detailRows.flatMap((row) => row.tokens === 0 ? [] : [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: row.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${formatExactTokens(row.tokens)} · ${formatCost(toCny(row.usd))}` })]
						}, row.key)]),
						turn !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							"data-token-billing-turn-value": "",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "本次对话" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${formatExactTokens(turn.tokens)} · ${formatCost(animatedTurnCny)}` })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "tb-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: "会话合计" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-session-value": "",
								children: `${formatExactTokens(detailTokens)} · ${formatCost(animatedCny)}`
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
								children: ["子智能体", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { className: "tb-agentChevron" })]
							}) : "子智能体" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
								"data-token-billing-agents": agents.count,
								children: agents.unreported > 0 ? `${agents.count} 个 · ${formatCost(agents.cny)} · ${agents.unreported} 个未上报` : `${agents.count} 个 · ${formatCost(agents.cny)}`
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
							children: "每百万 token 单价"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tb-rateToggleHint",
							children: priced.peak ? "高峰" : "低谷"
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
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnitRatesCard, {
							rate: priced.rate,
							peak: priced.peak
						})
					})
				})
			] }),
			priced.kind === "no-book" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: "正在获取价格表，稍后自动重试。"
			}),
			priced.kind === "unpriced" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: "价格表中没有该模型的挂牌价，无法估算。"
			}),
			priced.kind === "no-route" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "tb-note",
				children: "尚未确定当前模型。"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "tb-balanceRow",
				"data-token-billing-balance": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "tb-balanceLabel",
					children: "账户余额"
				}), balance.status === "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: "点击查看",
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
function BillingChip({ useProjection, useSessionStatus, useSessions, sessionId }) {
	const usage = useProjection("tokenUsage");
	const selection = useProjection("modelSelection");
	const provider = selection?.next?.provider ?? selection?.lastUsed?.provider;
	const model = selection?.next?.model ?? selection?.lastUsed?.model;
	const running = useSessionStatus === void 0 ? false : useSessionStatus((statuses) => statuses.get(sessionId ?? "")?.running === true);
	const sessionState = useSessions === void 0 ? void 0 : useSessions((state) => state);
	const descendants = react.useMemo(() => collectChildUsage(sessionState, sessionId), [sessionState, sessionId]);
	const book = react.useSyncExternalStore(priceBook.subscribe, priceBook.getSnapshot, priceBook.getSnapshot);
	const balance = react.useSyncExternalStore(accountBalance.subscribe, accountBalance.getSnapshot, accountBalance.getSnapshot);
	const [now, setNow] = react.useState(() => Date.now());
	react.useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), POSTURE_REFRESH_MS);
		return () => clearInterval(id);
	}, []);
	const previousRunning = react.useRef(false);
	const [baseline, setBaseline] = react.useState(void 0);
	react.useEffect(() => {
		if (!running) {
			previousRunning.current = false;
			return;
		}
		if (previousRunning.current) return;
		previousRunning.current = true;
		setBaseline(usage ?? {});
	}, [running, usage]);
	const [hover, setHover] = react.useState(false);
	const [open, setOpen] = react.useState(false);
	const { anchorRef, panelRef, pos } = useOverlay(open, setOpen);
	const hoverSeat = useOverlay(hover && !open, setHover);
	react.useEffect(() => {
		if (open) accountBalance.refresh();
	}, [open]);
	const priced = react.useMemo(() => priceUsage(usage, book.book, provider, model, new Date(now)), [
		usage,
		book.book,
		provider,
		model,
		now
	]);
	const sources = react.useMemo(() => [{
		usage,
		provider,
		model
	}, ...descendants.sources], [
		usage,
		provider,
		model,
		descendants
	]);
	const tree = react.useMemo(() => priceSessionTree(sources, book.book, new Date(now)), [
		sources,
		book.book,
		now
	]);
	const turnPriced = react.useMemo(() => baseline !== void 0 && usage !== void 0 ? priceUsage(subtractBuckets(usage, baseline), book.book, provider, model, new Date(now)) : null, [
		baseline,
		usage,
		book.book,
		provider,
		model,
		now
	]);
	const turn = baseline !== void 0 && turnPriced?.kind === "ok" ? {
		tokens: turnPriced.totalTokens,
		cny: turnPriced.totalCny
	} : void 0;
	const totalCny = priced.kind === "ok" ? tree?.totalCny ?? priced.totalCny : 0;
	const totalTokens = priced.kind === "ok" ? tree?.totalTokens ?? priced.totalTokens : 0;
	const rows = priced.kind === "ok" ? tree?.rows ?? priced.rows : [];
	const agents = priced.kind === "ok" && tree !== null ? {
		...tree.agents,
		unreported: descendants.unreported
	} : void 0;
	const animatedCny = useCountUp(totalCny);
	const animatedTurnCny = useCountUp(turn?.cny ?? 0);
	if (priced.kind === "no-usage") return null;
	const headline = priced.kind === "ok" ? formatCost(animatedCny) : priced.kind === "no-book" ? "¥ —" : "¥ ?";
	const anchorLabel = priced.kind === "ok" ? "本会话预估费用" : "本会话费用";
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
				children: `本轮消耗 ${formatExactTokens(turn.tokens)} tok 花费 ${formatCost(animatedTurnCny)}`
			})] }),
			running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "tb-running",
				"data-token-billing-live": "",
				"aria-hidden": true
			})
		]
	});
	const hoverAmount = priced.kind === "ok" ? formatCost(totalCny) : priced.kind === "no-book" ? "价格表加载中…" : "该模型暂无挂牌价";
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
					"aria-label": `${anchorLabel} ${formatCost(totalCny)}${balanceText === void 0 ? "" : `，账户余额 ${balanceText}`}${running ? "，计费中" : ""}`,
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
				panelRef,
				style: pos ?? MEASURE_STYLE
			}), document.body)
		]
	});
}

//#endregion
//#region \0dsh-css-text:/Users/eivmosn/Desktop/dsh-token-billing/src/client/billing.css.mjs
var billing_css_default = ".tb-root {\n  box-sizing: border-box;\n  min-width: 0;\n  max-width: 100%;\n  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);\n  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));\n  justify-content: center;\n  align-items: center;\n  display: flex;\n  order: 9999;\n}\n\n[class*=\"dock\"] > [data-token-billing],\n[class*=\"dock\"] [data-token-billing] {\n  order: 9999;\n}\n\n.tb-anchor {\n  min-width: 0;\n  align-items: center;\n  display: inline-flex;\n  position: relative;\n}\n\n.tb-pill {\n  box-sizing: border-box;\n  corner-shape: round;\n  max-width: 100%;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-variant-numeric: tabular-nums;\n  line-height: inherit;\n  white-space: nowrap;\n  background: 0 0;\n  border: none;\n  border-radius: 999px;\n  align-items: center;\n  gap: 6px;\n  padding: 1px 8px;\n  display: inline-flex;\n}\n\n.tb-pill .tb-icon {\n  flex: none;\n  width: 14px;\n  height: 14px;\n}\n\nbutton.tb-pill {\n  cursor: pointer;\n}\n\nbutton.tb-pill:hover,\nbutton.tb-pill[aria-expanded=\"true\"] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-label {\n  text-overflow: ellipsis;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-sep {\n  color: var(--dsw-alias-separator-primary);\n  margin: 0 6px;\n}\n\n.tb-panel {\n  z-index: 1100;\n  box-sizing: border-box;\n  isolation: isolate;\n  position: fixed;\n  width: max-content;\n  min-width: min(300px, 100vw - 24px);\n  max-width: min(440px, 100vw - 24px);\n  border: 0;\n  border-radius: var(--dsw-radius-lg);\n  padding: 16px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n  --tb-wash-fade: linear-gradient(180deg, #000 0, rgb(0 0 0 / 35%) 34px, transparent 78px);\n}\n\n.tb-panel::before,\n.tb-hover::before {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  border-radius: inherit;\n  background-image: linear-gradient(\n    104deg,\n    color-mix(in srgb, var(--dsw-static-deepseek-400) 30%, transparent) 0%,\n    color-mix(in srgb, var(--dsw-static-blue-500) 26%, transparent) 20%,\n    color-mix(in srgb, var(--dsw-static-green-500) 24%, transparent) 40%,\n    color-mix(in srgb, var(--dsw-static-amber-400) 28%, transparent) 62%,\n    color-mix(in srgb, var(--dsw-static-red-400) 30%, transparent) 82%,\n    color-mix(in srgb, var(--dsw-static-red-500) 24%, transparent) 100%\n  );\n  -webkit-mask-image: var(--tb-wash-fade, none);\n  mask-image: var(--tb-wash-fade, none);\n}\n\n.tb-title {\n  color: var(--dsw-alias-label-primary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 16px;\n  margin-bottom: 8px;\n  font-weight: 500;\n  display: flex;\n}\n\n.tb-titleRule,\n.tb-subagentTitle::after {\n  height: 1px;\n  background: var(--dsw-alias-border-l1);\n}\n\n.tb-titleRule {\n  margin-bottom: 12px;\n}\n\n.tb-titleValue {\n  font-variant-numeric: tabular-nums;\n  font-weight: 600;\n  font-size: 14px;\n  letter-spacing: -0.01em;\n}\n\n.tb-titleLabel {\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  display: inline-flex;\n}\n\n.tb-titleLabel svg {\n  flex: none;\n  width: 14px;\n  height: 14px;\n}\n\n.tb-details {\n  color: var(--dsw-alias-label-tertiary);\n  margin: -3px 0;\n  display: block;\n}\n\n.tb-row {\n  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);\n  gap: 0 16px;\n  align-items: baseline;\n  margin: 0 -8px;\n  padding: 3px 8px;\n  border-radius: 6px;\n  background-color: transparent;\n  transition: background-color 0.18s ease;\n  display: grid;\n}\n\n.tb-details dt,\n.tb-details dd {\n  min-width: 0;\n  margin: 0;\n  transition: color 0.18s ease;\n}\n\n.tb-details dd {\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n.tb-row:hover {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-row:hover dt {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-row:hover dd {\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-agentRow {\n  position: relative;\n}\n\n.tb-agentRow[data-open=\"true\"] {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-agentTrigger {\n  appearance: none;\n  align-items: center;\n  gap: 4px;\n  max-width: 100%;\n  margin: 0;\n  padding: 0;\n  border: 0;\n  background: 0 0;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  display: inline-flex;\n}\n\n.tb-agentTrigger::after {\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  border-radius: 6px;\n}\n\n.tb-agentTrigger:focus-visible {\n  outline: none;\n}\n\n.tb-agentTrigger:focus-visible::after {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.tb-agentChevron {\n  flex: none;\n  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n.tb-agentTrigger[aria-expanded=\"true\"] .tb-agentChevron {\n  transform: rotate(90deg);\n}\n\n.tb-rateToggle {\n  appearance: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  margin-top: 14px;\n  padding: 7px 10px;\n  border: 0;\n  border-radius: 10px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-weight: 500;\n  text-align: left;\n  cursor: pointer;\n  transition: background 0.18s ease, color 0.18s ease;\n}\n\n.tb-rateToggle:hover {\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-rateToggle:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.tb-rateToggleLabel {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.tb-rateToggleHint {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-weight: 400;\n}\n\n.tb-rateToggleChevron {\n  flex: none;\n  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n.tb-rateToggle[aria-expanded=\"true\"] .tb-rateToggleChevron {\n  transform: rotate(180deg);\n}\n\n.tb-rateReveal {\n  display: grid;\n  grid-template-rows: 0fr;\n  opacity: 0;\n  transition: grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease;\n}\n\n.tb-rateReveal[data-open=\"true\"] {\n  grid-template-rows: 1fr;\n  opacity: 1;\n}\n\n.tb-rateRevealInner {\n  min-height: 0;\n  overflow: hidden;\n  visibility: hidden;\n  transition: visibility 0s linear 0.28s;\n}\n\n.tb-rateReveal[data-open=\"true\"] .tb-rateRevealInner {\n  visibility: visible;\n  transition-delay: 0s;\n}\n\n.tb-rateCard {\n  position: relative;\n  isolation: isolate;\n  margin-top: 10px;\n  padding: 11px 12px 10px;\n  border-radius: var(--dsw-radius-md);\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 2%, transparent);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l1);\n}\n\n.tb-note {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 10px;\n  overflow-wrap: anywhere;\n}\n\n.tb-subagents {\n  z-index: 1100;\n  box-sizing: border-box;\n  position: fixed;\n  width: 244px;\n  max-height: min(60vh, 420px);\n  overflow: hidden auto;\n  padding: 12px;\n  border-radius: var(--dsw-radius-md);\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n}\n\n.tb-subagentTitle {\n  color: var(--dsw-alias-label-primary);\n  margin-bottom: 0;\n  font-weight: 500;\n}\n\n.tb-subagentTitle::after {\n  content: \"\";\n  margin: 7px 0 4px;\n  display: block;\n}\n\n.tb-subagentList {\n  flex-direction: column;\n  gap: 4px;\n  margin: -3px 0;\n  padding: 0;\n  list-style: none;\n  display: flex;\n}\n\n.tb-subagentItem {\n  margin: 0 -8px;\n  padding: 3px 8px;\n  border-radius: 6px;\n  transition: background-color 0.18s ease;\n}\n\n.tb-subagentItem:hover {\n  background-color: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);\n}\n\n.tb-subagentLine {\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 12px;\n  display: flex;\n}\n\n.tb-subagentLabel {\n  color: var(--dsw-alias-label-secondary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-subagentCost {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  flex: none;\n}\n\n.tb-subagentLabel,\n.tb-subagentMeta {\n  transition: color 0.18s ease;\n}\n\n.tb-subagentItem:hover .tb-subagentLabel {\n  color: var(--dsw-alias-label-primary);\n}\n\n.tb-subagentItem:hover .tb-subagentMeta {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.tb-subagentMeta {\n  color: var(--dsw-alias-label-tertiary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 10px;\n  margin-top: 1px;\n  font-size: 11px;\n  display: flex;\n}\n\n.tb-subagentModel {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.tb-subagentTokens {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-subagentMore {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.tb-rateSource {\n  margin-top: 6px;\n  font-size: 11px;\n}\n\n.tb-balanceRow {\n  color: var(--dsw-alias-label-tertiary);\n  justify-content: space-between;\n  align-items: baseline;\n  gap: 16px;\n  margin-top: 14px;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  font-weight: 500;\n  display: flex;\n}\n\n.tb-balanceValue {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  min-width: 0;\n  text-align: right;\n  overflow-wrap: anywhere;\n}\n\n.tb-balanceLink {\n  color: inherit;\n  text-decoration: none;\n}\n\n.tb-balanceLink:hover {\n  text-decoration: underline;\n}\n\n\n.tb-granted {\n  color: var(--dsw-alias-label-tertiary);\n  margin-left: 6px;\n  font-weight: 400;\n}\n\n.tb-hover {\n  z-index: 1100;\n  box-sizing: border-box;\n  isolation: isolate;\n  position: fixed;\n  border: 0;\n  border-radius: var(--dsw-radius-md);\n  padding: 9px 11px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  font-size: 12px;\n  line-height: 18px;\n  white-space: nowrap;\n  --tb-wash-fade: linear-gradient(180deg, #000 0, rgb(0 0 0 / 35%) 16px, transparent 46px);\n}\n\n.tb-hoverAmount {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  font-size: 13px;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-hoverBasis {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 3px;\n}\n\n.tb-amount {\n  font-variant-numeric: tabular-nums;\n  transition: color 0.25s var(--ds-ease-in-out, ease-in-out);\n}\n\n.tb-balanceNow {\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.tb-running {\n  width: 6px;\n  height: 6px;\n  border-radius: 50%;\n  margin-left: 6px;\n  vertical-align: middle;\n  background: var(--dsw-alias-state-success-primary);\n  flex: none;\n  display: inline-block;\n}\n\n\n.tb-turn {\n  font-variant-numeric: tabular-nums;\n}\n\n@supports (corner-shape: superellipse(1.25)) {\n  .tb-panel,\n  .tb-hover,\n  .tb-rateCard,\n  .tb-subagents {\n    corner-shape: superellipse(1.25);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .tb-rateToggleChevron,\n  .tb-rateReveal,\n  .tb-rateRevealInner,\n  .tb-row,\n  .tb-details dt,\n  .tb-details dd,\n  .tb-agentChevron,\n  .tb-subagentItem,\n  .tb-subagentLabel,\n  .tb-subagentMeta {\n    transition: none;\n  }\n}\n";

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
const inject = ["slots"];
function apply(ctx) {
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