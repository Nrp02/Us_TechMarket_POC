// Teaches Node's loader the "@/..." path alias that tsconfig defines, so tests
// can run on the plain runtime with no test framework and no bundler.
//
// Only the test runner loads this (see the "test" script). Next resolves the
// alias itself at build time and never sees this file.
import nodeModule from "node:module";
import { pathToFileURL } from "node:url";

type ResolveContext = { conditions: string[]; parentURL?: string };
type Resolved = { url: string; format?: string | null; shortCircuit?: boolean };
type NextResolve = (specifier: string, context?: ResolveContext) => Resolved;
type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  next: NextResolve,
) => Resolved;

// registerHooks arrived in Node 22.15 and this repo pins @types/node 20, so it
// is absent from the type definitions. Casting the one member is narrower than
// bumping a major version of @types/node for a test helper.
const { registerHooks } = nodeModule as unknown as {
  registerHooks(hooks: { resolve: ResolveHook }): void;
};

const SRC = pathToFileURL(`${process.cwd()}/src/`).href;

registerHooks({
  resolve(specifier, context, next) {
    // Next's extensionless CJS entry point needs its extension in Node ESM
    // when the Node test runner imports cached page queries.
    if (specifier === "next/cache") return next("next/cache.js", context);
    if (!specifier.startsWith("@/")) return next(specifier, context);

    const url = new URL(specifier.slice(2), SRC);
    // tsconfig paths are written without an extension; the type-stripping
    // loader does no extension resolution, so add the one the sources use.
    if (!/\.[a-z]+$/i.test(url.pathname)) url.pathname += ".ts";

    return next(url.href, context);
  },
});
