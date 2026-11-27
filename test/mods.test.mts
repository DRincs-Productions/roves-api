// Mods module over the CEF player's HTTP host API (Node >= 22.6: `npm test`, types stripped).
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { defineMod, type ModInfo, mods } from "../src/mods.ts";

const scope = globalThis as {
	window?: Record<string, unknown>;
	fetch: typeof fetch;
};
const realFetch = scope.fetch;
const MARKER = Object.freeze({ transport: "http", api: "/__roves/" });

type Call = {
	url: string;
	method: string;
	header: string | null;
	body: unknown;
};

function record(reply: (url: string) => unknown): Call[] {
	const calls: Call[] = [];
	scope.fetch = (async (url: string, init?: RequestInit) => {
		calls.push({
			url,
			method: init?.method ?? "GET",
			header: new Headers(init?.headers).get("X-Roves-Api"),
			body: init?.body,
		});
		return new Response(JSON.stringify(reply(url)), { status: 200 });
	}) as typeof fetch;
	return calls;
}

afterEach(() => {
	delete scope.window;
	scope.fetch = realFetch;
});

function info(id: string, main_url: string | null, active = true): ModInfo {
	return {
		id,
		kind: "mod",
		name: id,
		description: "",
		author: null,
		version: "1.0.0",
		cover_url: null,
		main_url,
		location: "game",
		enabled: active,
		active,
		compatible: true,
		problems: [],
		game: { name: "mygame", version: "^1.0.0" },
		requires: {},
		libraries: { peer: {}, bundled: {} },
		steam_app_id: null,
	};
}

test("outside the player: harmless defaults, no request", async () => {
	const calls = record(() => true);
	assert.equal(await mods.isSupported(), false);
	assert.deepEqual(await mods.list(), []);
	assert.equal(await mods.restartRequired(), false);
	assert.deepEqual(await mods.loadAll({}), []);
	await assert.rejects(mods.setEnabled("a", true));
	assert.equal(calls.length, 0);
});

test("reads are GET, changes are POST, all with the API header", async () => {
	scope.window = { __ROVES__: MARKER };
	const calls = record(() => true);
	assert.equal(await mods.isSupported(), true);
	await mods.setEnabled("@me/new ending", false);
	await mods.setOrder(["b", "a"]);
	assert.deepEqual(
		calls.map((c) => [c.method, c.url, c.header, c.body]),
		[
			["GET", "/__roves/mods/is_supported", "1", undefined],
			[
				"POST",
				"/__roves/mods/set_enabled?id=%40me%2Fnew+ending&enabled=false",
				"1",
				undefined,
			],
			["POST", "/__roves/mods/set_order", "1", '["b","a"]'],
		],
	);
});

test("loadAll(): active add-ons with a main module, in order; failures isolated", async () => {
	scope.window = { __ROVES__: MARKER };
	const seen: string[] = [];
	const good = defineMod<{ seen: string[] }>({
		activate(api, mod) {
			api.seen.push(mod.id);
		},
	});
	(globalThis as Record<string, unknown>).__good = good;
	const url = (body: string) =>
		`data:text/javascript,${encodeURIComponent(body)}`;
	record(() => [
		info("first", url("export default globalThis.__good")),
		info("files-only", null),
		info("disabled", url("export default globalThis.__good"), false),
		info("broken", url("export default {}")),
		info("last", url("export default globalThis.__good")),
	]);
	const original = console.error;
	console.error = () => {};
	try {
		const results = await mods.loadAll({ seen });
		assert.deepEqual(seen, ["first", "last"]);
		assert.deepEqual(
			results.map((r) => [r.id, r.ok]),
			[
				["first", true],
				["broken", false],
				["last", true],
			],
		);
	} finally {
		console.error = original;
	}
});
