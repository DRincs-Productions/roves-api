/**
 * Startup extraction-cache control.
 *
 * The game's packed content bundle (`manifest.json` + `.pack` archives, see
 * `servo/support/content-packer`) is decompressed on first launch into a
 * per-install cache directory under the OS's cache dir — not save data, and
 * not the bundle itself, just the already-unpacked copy Roves serves pages
 * and assets from. `clearContentCache()` wipes that directory via
 * `roves:clear_content_cache` (see
 * servo/ports/servoshell/desktop/protocols/roves.rs), so the next launch
 * re-extracts fresh from the shipped bundle.
 *
 * That cache directory is the *live* document root while the game is
 * running, so clearing it also closes the game, exactly like
 * `process.exit()` does — there is currently no way to clear the cache and
 * keep playing, or to have it relaunch itself afterwards; the player (or
 * launcher) starts the game again.
 */

import { invoke } from "./core";

/**
 * Deletes the startup extraction cache (not save data) and closes the game.
 *
 * @example
 * ```ts
 * import { clearContentCache } from "@drincs/roves-api/cache";
 * await clearContentCache();
 * ```
 */
export async function clearContentCache(): Promise<void> {
	await invoke("clear_content_cache");
}
