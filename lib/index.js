//#region src/billing.ts
const BALANCE_ROUTE = "/plugins/dsh-token-billing/balance";
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
const SHANGHAI_CLOCK = new Intl.DateTimeFormat("en-US", {
	timeZone: "Asia/Shanghai",
	weekday: "short",
	hour: "2-digit",
	hour12: false
});
function parseBalancePayload(raw) {
	const payload = asRecord(raw);
	const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : [];
	const wallets = [];
	for (const entry of infos) {
		const wallet = asRecord(entry);
		if (wallet === null) continue;
		const currency = wallet.currency === "USD" ? "USD" : wallet.currency === "CNY" ? "CNY" : void 0;
		const total = typeof wallet.total_balance === "string" ? wallet.total_balance : void 0;
		if (currency === void 0 || total === void 0) continue;
		wallets.push({
			currency,
			totalBalance: total,
			grantedBalance: typeof wallet.granted_balance === "string" ? wallet.granted_balance : "0.00",
			toppedUpBalance: typeof wallet.topped_up_balance === "string" ? wallet.topped_up_balance : "0.00"
		});
	}
	return {
		isAvailable: payload?.is_available === true,
		wallets
	};
}

//#endregion
//#region src/index.ts
const name = "dsh-token-billing";
const inject = ["credentials", "webServer"];
const API_KEY_REF = "DEEPSEEK_API_KEY";
const BALANCE_URL = "https://api.deepseek.com/user/balance";
const REQUEST_TIMEOUT_MS = 15e3;
const MAX_BODY_BYTES = 65536;
function isTrustedRequest(req, trustedHosts) {
	const headers = req.headers ?? {};
	const host = headers.host;
	if (typeof host !== "string" || host === "") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	const hostname = hostUrl.hostname;
	const loopback = hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
	const trusted = Array.isArray(trustedHosts) ? trustedHosts.some((entry) => {
		try {
			return new URL(`http://${entry}`).hostname === hostname;
		} catch {
			return entry === hostname;
		}
	}) : false;
	if (!loopback && !trusted) return false;
	if (headers["sec-fetch-site"] === "cross-site") return false;
	const origin = headers.origin;
	if (origin === void 0 || origin === "null") return origin === void 0;
	if (typeof origin !== "string") return false;
	try {
		return new URL(origin).hostname === hostname;
	} catch {
		return false;
	}
}
function writeJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}
async function resolveApiKey(ctx) {
	const value = (await ctx.credentials.resolve(API_KEY_REF))?.value;
	return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
}
async function fetchBalance(apiKey) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(BALANCE_URL, {
			method: "GET",
			headers: {
				accept: "application/json",
				authorization: `Bearer ${apiKey}`
			},
			signal: controller.signal
		});
		if (!response.ok) return {
			ok: false,
			status: response.status
		};
		const text = await response.text();
		if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return {
			ok: false,
			status: "oversized"
		};
		return {
			ok: true,
			payload: JSON.parse(text)
		};
	} catch (error) {
		return {
			ok: false,
			status: error instanceof Error && error.name === "AbortError" ? "timeout" : "transport"
		};
	} finally {
		clearTimeout(timer);
	}
}
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: BALANCE_ROUTE,
		handler: async (req, res) => {
			const trustedHosts = ctx.get("webRuntime")?.trustedHosts;
			if (!isTrustedRequest(req, trustedHosts)) {
				writeJson(res, 403, {
					ok: false,
					error: "forbidden"
				});
				return;
			}
			if (req.method !== "GET" && req.method !== "HEAD") {
				writeJson(res, 405, {
					ok: false,
					error: "method-not-allowed"
				});
				return;
			}
			let apiKey;
			try {
				apiKey = await resolveApiKey(ctx);
			} catch {
				writeJson(res, 200, {
					ok: false,
					error: "credentials-unavailable"
				});
				return;
			}
			if (apiKey === void 0) {
				writeJson(res, 200, {
					ok: false,
					error: "no-key"
				});
				return;
			}
			const result = await fetchBalance(apiKey);
			if (!result.ok) {
				writeJson(res, 200, {
					ok: false,
					error: String(result.status)
				});
				return;
			}
			const { isAvailable, wallets } = parseBalancePayload(result.payload);
			writeJson(res, 200, {
				ok: true,
				isAvailable,
				wallets
			});
		}
	}), "dsh-token-billing: balance route");
}

//#endregion
export { apply, inject, isTrustedRequest, name };