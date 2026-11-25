import { execFileSync } from "node:child_process";

function git(repoRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
}

export function repositoryRoot(directory: string): string | undefined {
  return git(directory, ["rev-parse", "--show-toplevel"])?.trim();
}

export function refExists(repoRoot: string, ref: string): boolean {
  return git(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== undefined;
}

/** Lists the files under a directory at a ref, as paths relative to the repository root. */
export function listFiles(repoRoot: string, ref: string, directory: string): string[] {
  const output = git(repoRoot, ["ls-tree", "-r", "--name-only", ref, "--", directory]) ?? "";
  return output.split("\n").filter((line) => line !== "");
}

/** Lists the files under a directory that differ between a ref and the working tree. */
export function changedFiles(repoRoot: string, ref: string, directory: string): Set<string> {
  const output = git(repoRoot, ["diff", "--name-only", "--no-renames", ref, "--", directory]) ?? "";
  return new Set(output.split("\n").filter((line) => line !== ""));
}

/** Returns a file's content at a ref, or undefined when it doesn't exist there. */
export function showFile(repoRoot: string, ref: string, path: string): string | undefined {
  return git(repoRoot, ["show", `${ref}:${path}`]);
}

/**
 * Returns when each file last changed, in seconds since the epoch: the commit time,
 * or the current time for files with uncommitted changes. Files git doesn't track are left out.
 */
export function lastChanged(repoRoot: string, paths: string[]): Map<string, number> {
  const times = new Map<string, number>();
  if (paths.length === 0) return times;
  const dirty = new Set(
    (git(repoRoot, ["status", "--porcelain", "--no-renames", "--", ...paths]) ?? "")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.slice(3)),
  );
  const now = Math.floor(Date.now() / 1000);
  for (const path of paths) {
    if (dirty.has(path)) {
      times.set(path, now);
      continue;
    }
    const time = git(repoRoot, ["log", "-1", "--format=%ct", "--", path])?.trim();
    if (time) times.set(path, Number(time));
  }
  return times;
}
