/**
 * Mods and DLC — talks to the Roves CEF player's same-origin HTTP host API
 * (`<api>mods/<command>`, when `window.__ROVES__` is its frozen marker: see
 * `@drincs/roves-api/core`).
 *
 * The player finds the add-ons next to the game and in the player's profile,
 * checks them (game version, required mods, shared libraries, DLC signature)
 * and serves the active ones. Your game lists them, lets the player turn them
 * on and off, and runs their code with {@link mods.loadAll}. Changes apply at
 * the next launch: call `relaunch()` from `@drincs/roves-api/process`.
 *
 * Outside the player (a browser, older shells) every read degrades to a
 * harmless default (`false` / `[]`) and never throws.
 *
 * @example
 * ```ts
 * import { mods } from "@drincs/roves-api/mods";
 *
 * await mods.loadAll({ addLabel, addCharacter });
 * ```
 */

/** One DLC or mod as the player reports it. */
export interface ModInfo {
	/** The `name` of the add-on's `package.json`. */
	id: string;
	kind: "mod" | "dlc";
	/** `displayName`, or `id` when missing. */
	name: string;
	description: string;
	author: string | null;
	version: string;
	/** URL of `cover.png`/`cover.jpg`/`cover.webp`, or `null` without one. */
	cover_url: string | null;
	/** URL of the `main` module, or `null` for an add-on that only replaces files. */
	main_url: string | null;
	/** Where it was found: next to the game (`dlc`, `game`), the profile, or `roves mod dev`. */
	location: "dlc" | "game" | "profile" | "dev";
	/** The saved choice (applies at the next launch). */
	enabled: boolean;
	/** Loaded in this run. */
	active: boolean;
	/** `false` when {@link problems} is not empty. */
	compatible: boolean;
	/** Why it cannot load, in plain English. */
	problems: string[];
	/** `roves.game`: the game name and the npm version range it supports. */
	game: { name: string; version: string } | null;
	/** `roves.mods`: required add-ons and their version ranges. */
	requires: Record<string, string>;
	libraries: {
		/** `peerDependencies`: libraries reused from the game. */
		peer: Record<string, string>;
		/** `dependencies`: libraries bundled by the add-on. */
		bundled: Record<string, string>;
	};
	/** A DLC sold on Steam: its app id. */
	steam_app_id: number | null;
}

/** What an add-on's `main` module exports as `default` (see {@link defineMod}). */
export interface RovesMod<Api = unknown> {
	activate(api: Api, info: ModInfo): void | Promise<void>;
}

/** Result of {@link ModsApi.loadAll} for one add-on. */
export interface ModLoadResult {
	id: string;
	ok: boolean;
	error?: unknown;
}

export interface ModsApi {
	/** `false` when the game was packaged without mod support (DLC may still load). */
	isSupported(): Promise<boolean>;
	/** Every DLC and mod found, in load order. */
	list(): Promise<ModInfo[]>;
	/** Turns an add-on on or off; applies at the next launch. */
	setEnabled(id: string, enabled: boolean): Promise<boolean>;
	/** Sets the load order (a later add-on wins when two replace the same file). */
	setOrder(ids: string[]): Promise<boolean>;
	/** `true` when saved choices differ from what is loaded in this run. */
	restartRequired(): Promise<boolean>;
	/**
	 * Imports the `main` module of every active add-on, in load order, and
	 * calls its `activate(api, info)`. A failing add-on is logged and reported,
	 * and never stops the others.
	 */
	loadAll<Api>(api: Api): Promise<ModLoadResult[]>;
}

/** Commands that change state: `POST` on the host API. */
const MUTATING = new Set(["set_enabled", "set_order"]);

function hostApi(): string | null {
	const marker: unknown =
		typeof window !== "undefined" ? window.__ROVES__ : undefined;
	if (typeof marker !== "object" || marker === null) return null;
	const { transport, api } = marker as { transport?: unknown; api?: unknown };
	return transport === "http" && typeof api === "string" ? api : null;
}

async function callMods<T>(
	command: string,
	params?: Record<string, unknown>,
	body?: unknown,
): Promise<T> {
	const api = hostApi();
	if (api === null) throw new Error("mods: not running in a Roves player");
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params ?? {})) {
		query.set(key, String(value));
	}
	const queryString = query.toString();
	const response = await fetch(
		`${api}mods/${command}${queryString ? `?${queryString}` : ""}`,
		{
			method: MUTATING.has(command) ? "POST" : "GET",
			headers: { "X-Roves-Api": "1" },
			body: body === undefined ? undefined : JSON.stringify(body),
		},
	);
	if (!response.ok) throw new Error(`mods: '${command}' failed`);
	return (await response.json()) as T;
}

export const mods: ModsApi = {
	async isSupported() {
		return callMods<boolean>("is_supported").catch(() => false);
	},

	async list() {
		return callMods<ModInfo[]>("list").catch(() => []);
	},

	async setEnabled(id, enabled) {
		return callMods<boolean>("set_enabled", { id, enabled });
	},

	async setOrder(ids) {
		return callMods<boolean>("set_order", undefined, ids);
	},

	async restartRequired() {
		return callMods<boolean>("restart_required").catch(() => false);
	},

	async loadAll(api) {
		const results: ModLoadResult[] = [];
		for (const info of await mods.list()) {
			if (!info.active || info.main_url === null) continue;
			try {
				const module = await import(
					/* @vite-ignore */ /* webpackIgnore: true */ info.main_url
				);
				const mod = (module.default ?? module) as Partial<RovesMod>;
				if (typeof mod.activate !== "function") {
					throw new Error("the main module exports no activate()");
				}
				await mod.activate(api, info);
				results.push({ id: info.id, ok: true });
			} catch (error) {
				console.error(`[mod ${info.id}]`, error);
				results.push({ id: info.id, ok: false, error });
			}
		}
		return results;
	},
};

/**
 * Types an add-on's `main` module. Identity at run time.
 *
 * @example
 * ```ts
 * import { defineMod } from "@drincs/roves-api/mods";
 * import type { MyGameApi } from "my-game-mod-kit";
 *
 * export default defineMod<MyGameApi>({
 *   activate(api) {
 *     api.addLabel(myNewEnding);
 *   },
 * });
 * ```
 */
export function defineMod<Api = unknown>(mod: RovesMod<Api>): RovesMod<Api> {
	return mod;
}
