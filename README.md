# @drincs/roves-api

JS/TS bridge for talking to [Roves](../servo/README.md) (the Servo-based embedded game shell)
from web content — no Tauri required.

Roves has no Tauri-style `invoke()` runtime built in. Instead, it lets native code register
custom URL schemes (`ProtocolHandler`s) that answer plain `fetch()` calls from page JS — see
`servo/ports/servoshell/desktop/protocols/`. This package wraps that in a small, ergonomic
API whose shape is deliberately familiar if you already know Tauri's:

```ts
import { invoke } from "@drincs/roves-api/core";
import { exit } from "@drincs/roves-api/process";
import { steam } from "@drincs/roves-api/steam";
import { achievements } from "@drincs/roves-api/achievements";
```

## Compatible Roves shell version

This version of `@drincs/roves-api` targets Roves shell
[`v0.3.0`](https://github.com/DRincs-Productions/roves/releases/tag/v0.3.0) — see that
version's own `COMPATIBLE_SHELL_VERSION` export (`@drincs/roves-api/version`) if you need
this at runtime (e.g. to log it, or to warn a player running against a mismatched shell). It
isn't a live check against the running shell — `roves:` has no "get version" command today,
just a static marker bumped whenever a new shell version is published (see the engine repo's
own `CLAUDE.md`, "Cutting a versioned release" section).

## Modules

- **`core`** — `invoke(cmd, args)`, the generic bridge to Roves' `roves:` protocol
  (`servo/ports/servoshell/desktop/protocols/roves.rs`). Small and general-purpose:
  window/process lifecycle today, more as Roves grows its own native surface. Also exports
  `isAvailable()`, a genuine runtime check for "is this page actually running inside Roves"
  (there's no build-time signal for this — Roves injects no global marker into the page).
- **`process`** — `exit()`, the Roves equivalent of `@tauri-apps/plugin-process`'s `exit()`.
  Closes every open window via Roves' own window API — **not** `window.close()`, which isn't
  reliable for a shell-created top-level window (see that module's own doc comment).
- **`steam`** — a full Steamworks wrapper (achievements, stats, DLC, overlay, store), talking
  to its own dedicated `steam:` protocol (`servo/ports/servoshell/desktop/protocols/steam.rs`).
  Requires the native binary to be built with `--features steam`; every function degrades to
  a harmless default when Steam isn't compiled in or isn't running.
- **`achievements`** — a platform-agnostic achievements API (`unlock`/`isUnlocked`/`clear`/
  `isAvailable`), backed by `steam`'s own achievement methods today. Prefer this over calling
  `steam.unlockAchievement`/etc. directly from game code — if a future platform backend is
  added (e.g. Google Play Games Services), it plugs in behind this same interface without any
  change to code that already calls `achievements.unlock(...)`.
- **`cache`** — `clearContentCache()`, wipes the startup extraction cache (not save data) and
  closes the game, since that cache is the live document root while running. The next launch
  re-extracts fresh from the shipped bundle.
- **`saves`** — an async, origin-scoped key/value store for player save data (shaped like
  IndexedDB, backed by real files), talking to its own dedicated `saves:` protocol
  (`servo/ports/servoshell/desktop/protocols/saves.rs`). Roves picks the actual on-disk
  location for you — a `saves/` folder next to the game when running portably, the OS cache
  directory when installed via `.msi`/`.dmg`/`.deb` — and, when built with `--features steam`,
  transparently mirrors every write/delete to Steam Cloud. Check `core`'s `isAvailable()`
  first if your code also needs to run outside Roves.
- **`version`** — `COMPATIBLE_SHELL_VERSION`, the Roves shell version this package targets
  (see "Compatible Roves shell version" above).

## Why a separate package instead of reusing `@tauri-apps/api`

Tauri's `invoke()` only works because Tauri's own runtime injects `window.__TAURI_INTERNALS__`
into the page. Roves has no such runtime and isn't going to pretend to be Tauri — this
package is a real, independent implementation, just deliberately shaped to feel familiar if
you already know Tauri's API. If your frontend needs to run under **both** Tauri and Roves,
branch between this package and `@tauri-apps/api` per shell, picking whichever's
`isAvailable()`/runtime marker check succeeds — both expose a similar shape by design, so the
branch is usually thin.

## Usage example

```ts
import { steam } from "@drincs/roves-api/steam";

if (await steam.isAvailable()) {
    await steam.unlockAchievement("ACH_COMPLETE_CH1");
    await steam.openOverlay("achievements");
}
```
