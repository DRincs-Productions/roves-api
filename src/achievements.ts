/**
 * Platform-agnostic achievements API.
 *
 * Game code should call this instead of `steam`'s own achievement methods —
 * this module picks whichever backend is actually available at runtime
 * (Steam today) behind one stable interface, so a future platform backend
 * (e.g. Google Play Games Services) can be added later without any change
 * to game code that already calls `achievements.unlock(...)`. Achievement
 * IDs are passed straight through to the active backend unchanged, so use
 * whatever ID scheme that backend expects (e.g. Steam's own API Name) —
 * this module doesn't remap IDs between backends.
 *
 * @example
 * ```ts
 * import { achievements } from "@drincs/roves-api/achievements";
 *
 * if (await achievements.isAvailable()) {
 *   await achievements.unlock("ACH_COMPLETE_CH1");
 * }
 * ```
 */

import { steam } from "./steam";

export interface AchievementsApi {
	/** `true` when at least one achievements backend is available right now. */
	isAvailable(): Promise<boolean>;

	/** Unlock an achievement and immediately persist it. */
	unlock(achievementId: string): Promise<boolean>;

	/** Returns `true` if the player has already unlocked the achievement. */
	isUnlocked(achievementId: string): Promise<boolean>;

	/** Reset an achievement — intended for development/testing only. */
	clear(achievementId: string): Promise<boolean>;
}

/**
 * Backends to try, most-specific/highest-priority first. Add a new platform
 * here (each conforming to {@link AchievementsApi}) when one is supported —
 * this is the only place that should ever need to change for that; the
 * exported `achievements` object and every caller of it stay the same.
 */
const backends: AchievementsApi[] = [
	{
		isAvailable: steam.isAvailable,
		unlock: steam.unlockAchievement,
		isUnlocked: steam.isAchievementUnlocked,
		clear: steam.clearAchievement,
	},
];

async function firstAvailableBackend(): Promise<AchievementsApi | null> {
	for (const backend of backends) {
		if (await backend.isAvailable()) {
			return backend;
		}
	}
	return null;
}

export const achievements: AchievementsApi = {
	async isAvailable() {
		return (await firstAvailableBackend()) !== null;
	},

	async unlock(achievementId) {
		const backend = await firstAvailableBackend();
		return backend ? backend.unlock(achievementId) : false;
	},

	async isUnlocked(achievementId) {
		const backend = await firstAvailableBackend();
		return backend ? backend.isUnlocked(achievementId) : false;
	},

	async clear(achievementId) {
		const backend = await firstAvailableBackend();
		return backend ? backend.clear(achievementId) : false;
	},
};
