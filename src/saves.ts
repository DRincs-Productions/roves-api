/**
 * Save-game storage — talks to the `saves:` custom protocol registered in
 * servo/ports/servoshell/desktop/protocols/saves.rs, via plain `fetch()`.
 * Shaped like an async, origin-scoped key/value store on purpose — the same
 * reasoning a game already reaching for IndexedDB would recognize — but
 * backed by real files on disk under a location Roves picks for you (a
 * `saves/` folder next to the game when it's running portably, the OS cache
 * directory when it's installed via an .msi/.dmg/.deb — see that Rust
 * module's own doc comment for the exact rules, and
 * `@drincs/roves-api/core`'s `isAvailable()` for checking you're even
 * running under Roves before calling any of this).
 *
 * When the native binary is built with `--features steam` and a Steam
 * client is running, every `write`/`delete` here is also mirrored to Steam
 * Cloud automatically — nothing extra to call, nothing to configure in your
 * own code either way; it's a transparent side effect of using this API.
 *
 * @example
 * ```ts
 * import { isAvailable } from "@drincs/roves-api/core";
 * import { saves } from "@drincs/roves-api/saves";
 *
 * if (await isAvailable()) {
 *   await saves.writeText("slot-1", JSON.stringify(gameState));
 *   const saved = await saves.readText("slot-1");
 * }
 * ```
 */

async function callSaves<T>(
	command: string,
	params?: Record<string, unknown>,
): Promise<T> {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params ?? {})) {
		if (value !== null && value !== undefined) {
			query.set(key, String(value));
		}
	}
	const queryString = query.toString();
	const response = await fetch(
		`saves:${command}${queryString ? `?${queryString}` : ""}`,
	);
	if (!response.ok) throw new Error(`saves: '${command}' failed`);
	return (await response.json()) as T;
}

/**
 * `Uint8Array` <-> base64, chunked so a large save doesn't blow the call
 * stack the naive `String.fromCharCode(...bytes)` spread would hit well
 * before any realistic save file size.
 */
const BASE64_CHUNK_SIZE = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export interface SavesApi {
	/**
	 * `true` when a save location could be resolved at all — practically
	 * always `true` on desktop; reserved for the future case of a console
	 * port with no save API wired up yet (see the Rust module's own doc
	 * comment), where every method below degrades to a harmless default
	 * instead of throwing.
	 */
	isAvailable(): Promise<boolean>;

	/** Write raw bytes under `key`, overwriting any existing save there. */
	write(key: string, data: Uint8Array): Promise<boolean>;

	/** Convenience for a text (typically JSON) save — encodes as UTF-8 for you. */
	writeText(key: string, text: string): Promise<boolean>;

	/** Read the raw bytes stored under `key`, or `null` if nothing's saved there yet. */
	read(key: string): Promise<Uint8Array | null>;

	/** Convenience for a text (typically JSON) save — decodes as UTF-8 for you. */
	readText(key: string): Promise<string | null>;

	/** Delete the save at `key`. Returns `true` even if nothing was there to delete. */
	delete(key: string): Promise<boolean>;

	/** List every save key currently on disk. */
	list(): Promise<string[]>;

	/** Delete every save. Meant for a "reset save data" feature, not routine use. */
	clear(): Promise<boolean>;
}

export const saves: SavesApi = {
	async isAvailable() {
		return callSaves<boolean>("is_available").catch(() => false);
	},

	async write(key, data) {
		return callSaves<boolean>("write", {
			key,
			data: bytesToBase64(data),
		}).catch(() => false);
	},

	async writeText(key, text) {
		return saves.write(key, new TextEncoder().encode(text));
	},

	async read(key) {
		const base64 = await callSaves<string | null>("read", { key }).catch(
			() => null,
		);
		return base64 !== null ? base64ToBytes(base64) : null;
	},

	async readText(key) {
		const bytes = await saves.read(key);
		return bytes !== null ? new TextDecoder().decode(bytes) : null;
	},

	async delete(key) {
		return callSaves<boolean>("delete", { key }).catch(() => false);
	},

	async list() {
		return callSaves<string[]>("list").catch(() => []);
	},

	async clear() {
		return callSaves<boolean>("clear").catch(() => false);
	},
};
