/**
 * Steamworks bridge — talks to the Roves CEF player's same-origin HTTP host
 * API (`<api>steam/<command>`, when `window.__ROVES__` is its frozen marker:
 * see `@drincs/roves-api/core`), or to the legacy `steam:` custom protocol
 * of older shells (servo/ports/servoshell/desktop/protocols/steam.rs), via
 * plain `fetch()`. Steam gets its own dedicated protocol (rather than being
 * routed through `core`'s generic `roves:` `invoke()`) since it's a large,
 * separate SDK surface, not a general "control this app" command.
 *
 * Requires a shell built with Steam support (the CEF player's `steam`
 * feature; `./mach build --features steam` on older shells).
 * Every function below degrades to a harmless default (null / false / 0)
 * when Steam isn't compiled in or isn't running — never throws.
 *
 * @example
 * ```ts
 * import { steam } from "@drincs/roves-api/steam";
 *
 * if (await steam.isAvailable()) {
 *   await steam.unlockAchievement("ACH_COMPLETE_CH1");
 * }
 * ```
 */

/** Commands that change state: `POST` on the CEF player's HTTP host API. */
const MUTATING = new Set([
	"unlock_achievement",
	"clear_achievement",
	"set_stat_int",
	"set_stat_float",
	"store_stats",
	"open_overlay",
	"open_store",
]);

/**
 * The CEF player's host API prefix from its frozen `window.__ROVES__` marker
 * (see `@drincs/roves-api/core`), or `null` on older shells (`steam:` scheme).
 */
function hostApi(): string | null {
	const marker: unknown =
		typeof window !== "undefined" ? window.__ROVES__ : undefined;
	if (typeof marker !== "object" || marker === null) return null;
	const { transport, api } = marker as { transport?: unknown; api?: unknown };
	return transport === "http" && typeof api === "string" ? api : null;
}

async function callSteam<T>(
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
	const suffix = `${command}${queryString ? `?${queryString}` : ""}`;
	const api = hostApi();
	// CEF player: GET for reads, POST for commands that change state or open the overlay.
	const response = await (api !== null
		? fetch(`${api}steam/${suffix}`, {
				method: MUTATING.has(command) ? "POST" : "GET",
				headers: { "X-Roves-Api": "1" },
			})
		: fetch(`steam:${suffix}`));
	if (!response.ok) throw new Error(`steam: '${command}' failed`);
	return (await response.json()) as T;
}

/** Dialogs supported by the Steam overlay. */
export type SteamOverlayDialog =
	| "achievements"
	| "community"
	| "friends"
	| "players"
	| "settings"
	| "officialgamegroup"
	| "stats";

export interface SteamApi {
	/** `true` when Steam was initialised successfully (Steam client running). */
	isAvailable(): Promise<boolean>;

	/** Steam display name of the logged-in user. */
	getPlayerName(): Promise<string | null>;

	/** Numeric App ID of the running application. */
	getAppId(): Promise<number | null>;

	/**
	 * Unlock an achievement and immediately persist it.
	 * `achievementId` must match the API Name in Steamworks Partner.
	 */
	unlockAchievement(achievementId: string): Promise<boolean>;

	/**
	 * Returns `true` if the user has already unlocked the achievement.
	 * Reliable only after the first few seconds of launch (stats are
	 * fetched automatically at startup).
	 */
	isAchievementUnlocked(achievementId: string): Promise<boolean>;

	/** Reset an achievement — intended for development / testing only. */
	clearAchievement(achievementId: string): Promise<boolean>;

	/** Set an integer stat. Call `storeStats()` afterwards to persist it. */
	setStatInt(name: string, value: number): Promise<boolean>;

	/** Read an integer stat (returns `0` on error). */
	getStatInt(name: string): Promise<number>;

	/** Set a float stat. Call `storeStats()` afterwards to persist it. */
	setStatFloat(name: string, value: number): Promise<boolean>;

	/** Read a float stat (returns `0` on error). */
	getStatFloat(name: string): Promise<number>;

	/**
	 * Commit pending stat changes to Steam servers.
	 * `unlockAchievement` / `clearAchievement` already call this
	 * automatically; you only need this when using `setStatInt` /
	 * `setStatFloat` directly.
	 */
	storeStats(): Promise<boolean>;

	/** `true` if the user owns and has installed the DLC with the given App ID. */
	isDlcInstalled(appId: number): Promise<boolean>;

	/** Open the Steam overlay to a specific dialog. */
	openOverlay(dialog: SteamOverlayDialog): Promise<boolean>;

	/** Open the Steam store page for this game (or a different `appId`). */
	openStore(appId?: number): Promise<boolean>;
}

export const steam: SteamApi = {
	async isAvailable() {
		return callSteam<boolean>("is_available").catch(() => false);
	},

	async getPlayerName() {
		return callSteam<string | null>("get_player_name").catch(() => null);
	},

	async getAppId() {
		return callSteam<number | null>("get_app_id").catch(() => null);
	},

	async unlockAchievement(achievementId) {
		return callSteam<boolean>("unlock_achievement", {
			achievement_id: achievementId,
		}).catch(() => false);
	},

	async isAchievementUnlocked(achievementId) {
		return callSteam<boolean>("is_achievement_unlocked", {
			achievement_id: achievementId,
		}).catch(() => false);
	},

	async clearAchievement(achievementId) {
		return callSteam<boolean>("clear_achievement", {
			achievement_id: achievementId,
		}).catch(() => false);
	},

	async setStatInt(name, value) {
		return callSteam<boolean>("set_stat_int", {
			name,
			value: Math.trunc(value),
		}).catch(() => false);
	},

	async getStatInt(name) {
		return callSteam<number>("get_stat_int", { name }).catch(() => 0);
	},

	async setStatFloat(name, value) {
		return callSteam<boolean>("set_stat_float", { name, value }).catch(
			() => false,
		);
	},

	async getStatFloat(name) {
		return callSteam<number>("get_stat_float", { name }).catch(() => 0);
	},

	async storeStats() {
		return callSteam<boolean>("store_stats").catch(() => false);
	},

	async isDlcInstalled(appId) {
		return callSteam<boolean>("is_dlc_installed", { app_id: appId }).catch(
			() => false,
		);
	},

	async openOverlay(dialog) {
		return callSteam<boolean>("open_overlay", { dialog }).catch(() => false);
	},

	async openStore(appId) {
		return callSteam<boolean>("open_store", { app_id: appId }).catch(
			() => false,
		);
	},
};
