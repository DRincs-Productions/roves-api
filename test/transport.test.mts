// Transport selection (Node >= 22.6: `npm test`, types stripped): the CEF player's HTTP host
// API when `window.__ROVES__` is its frozen marker, the legacy schemes otherwise.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { invoke, isAvailable } from "../src/core.ts";
import { saves } from "../src/saves.ts";
import { steam } from "../src/steam.ts";

type Call = {
	url: string;
	method: string;
	header: string | null;
	body: unknown;
};
const scope = globalThis as {
	window?: Record<string, unknown>;
	fetch: typeof fetch;
};
const realFetch = scope.fetch;
const MARKER = Object.freeze({ transport: "http", api: "/__roves/" });

function record(reply: unknown): Call[] {
	const calls: Call[] = [];
	scope.fetch = (async (url: string, init?: RequestInit) => {
		calls.push({
			url,
			method: init?.method ?? "GET",
			header: new Headers(init?.headers).get("X-Roves-Api"),
			body: init?.body,
		});
		return new Response(JSON.stringify(reply), { status: 200 });
	}) as typeof fetch;
	return calls;
}

afterEach(() => {
	delete scope.window;
	scope.fetch = realFetch;
});

test("isAvailable(): legacy true and the CEF host marker; nothing else", () => {
	scope.window = { __ROVES__: true };
	assert.equal(isAvailable(), true);
	scope.window = { __ROVES__: MARKER };
	assert.equal(isAvailable(), true);
	for (const value of [
		{ transport: "ws", api: "/x/" },
		{ transport: "http" },
		"http",
		1,
		null,
	]) {
		scope.window = { __ROVES__: value };
		assert.equal(isAvailable(), false, JSON.stringify(value));
	}
});

test("core over HTTP: POST to the same-origin route with the API header", async () => {
	scope.window = { __ROVES__: MARKER };
	const calls = record({ os_type: "windows" });
	assert.deepEqual(await invoke("system_info"), { os_type: "windows" });
	await invoke("exit", { reason: "menu" });
	assert.deepEqual(
		calls.map(({ url, method, header }) => [url, method, header]),
		[
			["/__roves/core/system_info", "POST", "1"],
			["/__roves/core/exit?reason=menu", "POST", "1"],
		],
	);
});

test("core without the marker keeps the roves: scheme", async () => {
	scope.window = { __ROVES__: true };
	const calls = record(true);
	await invoke("exit");
	assert.deepEqual(
		calls.map(({ url, method, header }) => [url, method, header]),
		[["roves:exit", "GET", null]],
	);
});

test("saves over HTTP: GET reads, POST mutations, body writes, unchanged parsing", async () => {
	scope.window = { __ROVES__: MARKER };
	let calls = record(true);
	assert.equal(await saves.write("slot 1", new Uint8Array([104, 105])), true);
	assert.equal(await saves.delete(2), true);
	assert.equal(await saves.clear(), true);
	assert.deepEqual(
		calls.map(({ url, method, header }) => [url, method, header]),
		[
			["/__roves/saves/write?key=slot%201", "POST", "1"],
			["/__roves/saves/delete?key=2", "POST", "1"],
			["/__roves/saves/clear", "POST", "1"],
		],
	);
	assert.deepEqual(calls[0].body, new Uint8Array([104, 105]));
	calls = record(btoa('{"n":1}'));
	assert.deepEqual(await saves.readJSON("slot"), { n: 1 });
	calls = record(["a", "b"]);
	assert.deepEqual(await saves.list(), ["a", "b"]);
	assert.equal(calls[0].url, "/__roves/saves/list");
	assert.equal(calls[0].method, "GET");
	assert.equal(calls[0].header, "1");
});

test("saves.write over HTTP never falls back to the query string", async () => {
	scope.window = { __ROVES__: MARKER };
	const calls: string[] = [];
	scope.fetch = (async (url: string) => {
		calls.push(url);
		return new Response("forbidden", { status: 403 });
	}) as typeof fetch;
	assert.equal(await saves.write("k", new Uint8Array([1])), false);
	assert.deepEqual(calls, ["/__roves/saves/write?key=k"]);
});

test("saves without the marker keep the saves: scheme", async () => {
	scope.window = { __ROVES__: true };
	const calls = record(["x"]);
	assert.deepEqual(await saves.list(), ["x"]);
	await saves.write("k", new Uint8Array([1]));
	assert.deepEqual(
		calls.map(({ url, method }) => [url, method]),
		[
			["saves:list", "GET"],
			["saves:write?key=k", "POST"],
		],
	);
});

test("steam over HTTP: GET reads, POST mutations, legacy query names", async () => {
	scope.window = { __ROVES__: MARKER };
	let calls = record(true);
	assert.equal(await steam.isAvailable(), true);
	assert.equal(await steam.isAchievementUnlocked("ACH_A"), true);
	assert.equal(await steam.isDlcInstalled(10), true);
	assert.equal(await steam.unlockAchievement("ACH_A"), true);
	assert.equal(await steam.clearAchievement("ACH_A"), true);
	assert.equal(await steam.setStatInt("wins", 2.7), true);
	assert.equal(await steam.setStatFloat("time", 1.5), true);
	assert.equal(await steam.storeStats(), true);
	assert.equal(await steam.openOverlay("achievements"), true);
	assert.equal(await steam.openStore(), true);
	assert.equal(await steam.openStore(20), true);
	assert.deepEqual(
		calls.map(({ url, method, header }) => [url, method, header]),
		[
			["/__roves/steam/is_available", "GET", "1"],
			[
				"/__roves/steam/is_achievement_unlocked?achievement_id=ACH_A",
				"GET",
				"1",
			],
			["/__roves/steam/is_dlc_installed?app_id=10", "GET", "1"],
			["/__roves/steam/unlock_achievement?achievement_id=ACH_A", "POST", "1"],
			["/__roves/steam/clear_achievement?achievement_id=ACH_A", "POST", "1"],
			["/__roves/steam/set_stat_int?name=wins&value=2", "POST", "1"],
			["/__roves/steam/set_stat_float?name=time&value=1.5", "POST", "1"],
			["/__roves/steam/store_stats", "POST", "1"],
			["/__roves/steam/open_overlay?dialog=achievements", "POST", "1"],
			["/__roves/steam/open_store", "POST", "1"],
			["/__roves/steam/open_store?app_id=20", "POST", "1"],
		],
	);
	calls = record(480);
	assert.equal(await steam.getAppId(), 480);
	assert.equal(await steam.getStatInt("wins"), 480);
	assert.deepEqual(
		calls.map(({ url, method }) => [url, method]),
		[
			["/__roves/steam/get_app_id", "GET"],
			["/__roves/steam/get_stat_int?name=wins", "GET"],
		],
	);
});

test("steam over HTTP degrades to the defaults on a refused request", async () => {
	scope.window = { __ROVES__: MARKER };
	scope.fetch = (async () =>
		new Response("forbidden", { status: 403 })) as typeof fetch;
	assert.equal(await steam.isAvailable(), false);
	assert.equal(await steam.getPlayerName(), null);
	assert.equal(await steam.getStatFloat("x"), 0);
	assert.equal(await steam.unlockAchievement("ACH_A"), false);
});

test("steam without the marker keeps the steam: scheme", async () => {
	scope.window = { __ROVES__: true };
	const calls = record(true);
	await steam.isAvailable();
	await steam.unlockAchievement("ACH_A");
	assert.deepEqual(
		calls.map(({ url, method, header }) => [url, method, header]),
		[
			["steam:is_available", "GET", null],
			["steam:unlock_achievement?achievement_id=ACH_A", "GET", null],
		],
	);
});
