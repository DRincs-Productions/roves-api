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
```

## Compatible Roves shell version

This version of `@drincs/roves-api` targets Roves shell
[`v0.1.0`](https://github.com/DRincs-Productions/roves/releases/tag/v0.1.0) — see that
version's own `COMPATIBLE_SHELL_VERSION` export (`@drincs/roves-api/version`) if you need
this at runtime (e.g. to log it, or to warn a player running against a mismatched shell). It
isn't a live check against the running shell — `roves:` has no "get version" command today,
just a static marker bumped whenever a new shell version is published (see the engine repo's
own `CLAUDE.md`, "Cutting a versioned release" section).

## Modules

- **`core`** — `invoke(cmd, args)`, the generic bridge to Roves' `roves:` protocol
  (`servo/ports/servoshell/desktop/protocols/roves.rs`). Small and general-purpose:
  window/process lifecycle today, more as Roves grows its own native surface.
- **`process`** — `exit()`, the Roves equivalent of `@tauri-apps/plugin-process`'s `exit()`.
  Closes every open window via Roves' own window API — **not** `window.close()`, which isn't
  reliable for a shell-created top-level window (see that module's own doc comment).
- **`steam`** — a full Steamworks wrapper (achievements, stats, DLC, overlay, store), talking
  to its own dedicated `steam:` protocol (`servo/ports/servoshell/desktop/protocols/steam.rs`).
  Requires the native binary to be built with `--features steam`; every function degrades to
  a harmless default when Steam isn't compiled in or isn't running.
- **`cache`** — `clearContentCache()`, wipes the startup extraction cache (not save data) and
  closes the game, since that cache is the live document root while running. The next launch
  re-extracts fresh from the shipped bundle.
- **`version`** — `COMPATIBLE_SHELL_VERSION`, the Roves shell version this package targets
  (see "Compatible Roves shell version" above).

## Why a separate package instead of reusing `@tauri-apps/api`

Tauri's `invoke()` only works because Tauri's own runtime injects `window.__TAURI_INTERNALS__`
into the page. Roves has no such runtime and isn't going to pretend to be Tauri — this
package is a real, independent implementation, just deliberately shaped to feel familiar if
you already know Tauri's API. If your frontend needs to run under **both** Tauri and Roves,
branch between this package and `@tauri-apps/api` per shell (see the parent
pixi-vn-react-template project's `src/lib/steam.ts` for exactly that).

## Usage example

```ts
import { steam } from "@drincs/roves-api/steam";

if (await steam.isAvailable()) {
    await steam.unlockAchievement("ACH_COMPLETE_CH1");
    await steam.openOverlay("achievements");
}
```
