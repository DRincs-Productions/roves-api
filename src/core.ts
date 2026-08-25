/**
 * Roves' own general-purpose native bridge.
 *
 * `invoke()` here mirrors the shape of `@tauri-apps/api/core`'s `invoke()`
 * on purpose — code that already knows Tauri's API should feel at home —
 * but this is a real, separate implementation talking directly to Roves'
 * `roves:` custom protocol (see
 * servo/ports/servoshell/desktop/protocols/roves.rs) via plain `fetch()`.
 * It is not a shim over Tauri's runtime and does not require one.
 *
 * `roves:` is Roves' small, generic "control this app" surface (window and
 * process lifecycle today — see the `process` module). Larger, self-contained
 * SDKs (like Steam) get their own dedicated protocol instead of being routed
 * through here — see the `steam` module and
 * servo/ports/servoshell/desktop/protocols/steam.rs.
 */

export type InvokeArgs = Record<string, unknown>;

/**
 * `true` when this page is actually running inside Roves — `false` in a
 * regular browser, or any other embedder that never registered a `roves:`
 * scheme handler. There is no build-time signal for this (Roves injects no
 * global marker into the page — see the engine repo's own README.md,
 * "Embedding" section); this is a genuine runtime check instead, so it works
 * regardless of how (or whether) your own build baked in some other
 * environment flag. Reaching for this before calling into `saves` (or any
 * other Roves-only API) lets your own code branch cleanly between "running
 * under Roves" and "running as a plain website" without a failed `fetch()`
 * ever surfacing as an unhandled rejection.
 *
 * @example
 * ```ts
 * import { isAvailable } from "@drincs/roves-api/core";
 * import { saves } from "@drincs/roves-api/saves";
 *
 * if (await isAvailable()) {
 *   await saves.write("slot-1", myGameState);
 * }
 * ```
 */
export async function isAvailable(): Promise<boolean> {
	return invoke<boolean>("is_available").catch(() => false);
}

/**
 * Call a native `roves:` command and return its JSON-decoded result.
 *
 * @example
 * ```ts
 * import { invoke } from "@drincs/roves-api/core";
 * await invoke("exit");
 * ```
 */
export async function invoke<T = void>(
	cmd: string,
	args?: InvokeArgs,
): Promise<T> {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(args ?? {})) {
		if (value !== null && value !== undefined) {
			params.set(key, String(value));
		}
	}
	const query = params.toString();
	const response = await fetch(`roves:${cmd}${query ? `?${query}` : ""}`);
	if (!response.ok) {
		throw new Error(`roves: '${cmd}' failed (${response.status})`);
	}
	const text = await response.text();
	return (text.length > 0 ? JSON.parse(text) : undefined) as T;
}
