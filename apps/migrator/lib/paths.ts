/**
 * The core's path normaliser on its own: the one thing the page's intake and detection need from
 * the converter before a run starts.
 *
 * Everything else comes through lib/core.ts, and that is still the rule. This is the exception because
 * importing core.ts pulls the whole converter and its vendored schemas (validate.ts imports them), and
 * the page would then download ~60 KB gzipped it only needs inside the worker. vfs.ts imports nothing,
 * so this re-export carries the function and nothing more. Same function, so the same refusals.
 */
export { normalizePath } from '../vendor/migrator-core/src/vfs';
