/**
 * Process/window lifecycle control — the Roves equivalent of
 * `@tauri-apps/plugin-process`'s `exit()`.
 *
 * A plain `window.close()` is not reliable here: browsers (and Roves) only
 * grant scripted `window.close()` on windows the *page itself* opened via
 * `window.open()` — not on the top-level window a native shell created for
 * you, which is the normal case for a Roves-embedded game. `exit()` instead
 * asks the native side directly, via `roves:exit` (see
 * servo/ports/servoshell/desktop/protocols/roves.rs), which closes every open
 * window through Roves' own window-management API
 * (`ServoShellWindow::schedule_close`) — not the DOM API.
 *
 * In this fork's usual single-window setup (see ../../servo/CUSTOMIZATIONS.md's
 * toolbar/tab-removal entries), closing the one window IS quitting the app:
 * once no windows remain open, servoshell's own event loop exits on its own.
 */

import { invoke } from "./core";

/** Closes every open window, which quits the app once none remain. */
export async function exit(): Promise<void> {
    await invoke("exit");
}
