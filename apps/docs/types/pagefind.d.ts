/**
 * The Pagefind runtime, which does not exist in this repository.
 *
 * `apps/docs/lib/search.ts` imports `/_pagefind/pagefind.js` at runtime — the file is written into
 * `out/` by the `search` script after the site is built, so it is never present while TypeScript is
 * looking. Without this declaration the import would either fail to type-check (if TypeScript resolves
 * the specifier) or be silently `any` (if it does not), and which of those happens depends on how the
 * argument is written rather than on anything a reader can see.
 *
 * **Declaring it settles the question in the direction that cannot break the build.** TypeScript
 * resolves a dynamic import whose argument is a string *literal*; `lib/search.ts` deliberately passes
 * a `string`-typed variable instead, so the resolution should not happen — but "should not" is doing
 * a lot of work in a build that fails on a type error, and this file costs four lines.
 *
 * Only the two functions this site calls are declared, and the shapes are the ones `search.ts` reads.
 * `data()` is the important one: `search()` returns stubs and the result bodies arrive only when each
 * one is asked for, which is why the loader slices before it awaits.
 */
declare module '/_pagefind/pagefind.js' {
  export function init(): Promise<void>;

  export function search(
    query: string,
    options?: { filters?: Record<string, string> },
  ): Promise<{
    results: Array<{
      id: string;
      data: () => Promise<{
        url: string;
        excerpt?: string;
        meta?: Record<string, string | undefined>;
      }>;
    }>;
  }>;
}
