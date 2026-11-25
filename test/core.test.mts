// Runtime checks of the synchronous markers (Node >= 22.6: `npm test`, types stripped).
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isAvailable, isMcpEnabled } from "../src/core.ts";

const scope = globalThis as { window?: Record<string, unknown> };

afterEach(() => {
	delete scope.window;
});

test("no window (server-side rendering, workers without window): both false", () => {
	assert.equal(isMcpEnabled(), false);
	assert.equal(isAvailable(), false);
});

test("regular browser: no marker, isMcpEnabled() is false", () => {
	scope.window = {};
	assert.equal(isMcpEnabled(), false);
	assert.equal(isAvailable(), false);
});

test("Roves player with the MCP bridge running: true, isAvailable() unchanged", () => {
	scope.window = { __ROVES_MCP__: true };
	assert.equal(isMcpEnabled(), true);
	assert.equal(isAvailable(), false);
	scope.window = { __ROVES__: true, __ROVES_MCP__: true };
	assert.equal(isMcpEnabled(), true);
	assert.equal(isAvailable(), true);
});

test("Roves without the bridge: isMcpEnabled() is false", () => {
	scope.window = { __ROVES__: true };
	assert.equal(isMcpEnabled(), false);
	assert.equal(isAvailable(), true);
});

test("only the boolean true counts", () => {
	for (const value of ["true", 1, {}, false, null]) {
		scope.window = { __ROVES_MCP__: value };
		assert.equal(isMcpEnabled(), false, String(value));
	}
});
