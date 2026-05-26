import { findMonorepoWebApp, runServeNext } from "../serve-next.js";

export interface ServeOptions {
  /** Absolute or cwd-relative path to the target project. */
  path: string;
  /** Port to bind. Defaults to the first free port at or above {@link DEFAULT_PORT}. */
  port?: number;
  /** Bind host. Defaults to 127.0.0.1. */
  host?: string;
  /** Re-analyse on source-file changes. */
  watch?: boolean;
  /** Open a browser to the served URL once the server is ready. */
  open?: boolean;
  /** Suppress non-error output. */
  quiet?: boolean;
  /** Disable ANSI colours. */
  noColor?: boolean;
  /** Stdout sink (injected for testability). */
  stdout?: (line: string) => void;
  /** Allow-list of POSIX globs anchored at `path`. */
  include?: string[];
  /** Exclude globs (applied after .gitignore). */
  exclude?: string[];
  /** When false, ignore `.gitignore` files. Defaults to true. */
  respectGitignore?: boolean;
  /** When true, omit test/spec files from the graph. */
  excludeTests?: boolean;
  /** Bypass the incremental slice cache for this run. */
  noCache?: boolean;
}

export interface ServeHandle {
  /** Local URL the server is listening on. */
  url: string;
  /** Stop the server and the watcher. */
  close: () => Promise<void>;
}

/**
 * `depmod-ui <path>` — analyse the project and host the dashboard via the
 * bundled Next.js application. The Next process is spawned with the session
 * file path so `/api/graph` can serve the freshly-analysed graph.
 */
export async function runServe(options: ServeOptions): Promise<ServeHandle> {
  const webApp = findMonorepoWebApp();
  if (!webApp) {
    throw new Error(
      "depmod-ui: bundled Next.js application not found. Reinstall `depmod-ui` " +
        "or run from the monorepo with `pnpm --filter web build`.",
    );
  }
  return runServeNext(options, webApp);
}
