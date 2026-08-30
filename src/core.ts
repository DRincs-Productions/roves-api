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

declare global {
	interface Window {
		/**
		 * Set to `true` by a `UserScript` Roves injects into every page before any of
		 * the page's own scripts run (see `UserContentManager` in
		 * servo/ports/servoshell/desktop/app.rs) — Servo's own document-start
		 * script-injection mechanism, the same idea as Tauri's
		 * `window.__TAURI_INTERNALS__`. Absent entirely outside Roves. Prefer
		 * {@link isAvailable} over reading this directly.
		 */
		__ROVES__?: true;
	}
}

/**
 * `true` when this page is actually running inside Roves — `false` in a
 * regular browser, or any other embedder that never injected the `__ROVES__`
 * marker. Synchronous: no `fetch()` round trip needed, since the marker is
 * already on `window` by the time any page script runs. Reaching for this
 * before calling into `saves` (or any other Roves-only API) lets your own
 * code branch cleanly between "running under Roves" and "running as a plain
 * website".
 *
 * @example
 * ```ts
 * import { isAvailable } from "@drincs/roves-api/core";
 * import { saves } from "@drincs/roves-api/saves";
 *
 * if (isAvailable()) {
 *   await saves.write("slot-1", myGameState);
 * }
 * ```
 */
export function isAvailable(): boolean {
	return typeof window !== "undefined" && window.__ROVES__ === true;
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

/**
 * Host OS and engine info, for bug reports and graphics-compatibility triage.
 *
 * Field names deliberately mirror `@tauri-apps/plugin-os`'s (`type()`/`version()`/`arch()`)
 * and the `os_info` crate's (`os_type`/`version`/`bitness`/`architecture`) own conventions.
 */
export interface SystemInfo {
	/** e.g. `"windows"`, `"macos"`, or a Linux distro id like `"ubuntu"`. */
	os_type: string;
	/** `null` when the host couldn't be identified further than {@link os_type}. */
	os_version: string | null;
	bitness: "64-bit" | "32-bit";
	/** Rust's own `std::env::consts::ARCH`, e.g. `"x86_64"`, `"aarch64"`. */
	architecture: string;
	/**
	 * The running Roves/Servo build's own version string — the equivalent of a "webview
	 * version" elsewhere, but naming the actual rendering engine rather than a wrapper
	 * around someone else's, which is what matters for graphics/compatibility debugging.
	 */
	engine_version: string;
}

/**
 * @example
 * ```ts
 * import { systemInfo } from "@drincs/roves-api/core";
 * const info = await systemInfo();
 * console.log(`${info.os_type} ${info.os_version} (${info.architecture})`);
 * ```
 */
export async function systemInfo(): Promise<SystemInfo> {
	return invoke<SystemInfo>("system_info");
}
