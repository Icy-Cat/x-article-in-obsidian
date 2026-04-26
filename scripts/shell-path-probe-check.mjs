// Mirrors the production logic in src/commands/publishViaMcp.ts
// (probeLoginShellPath) so we can exercise it without dragging in Obsidian.
// If you change the production function, mirror the change here and the
// consistency block at the bottom will fail loudly if anything drifts.

import { execFileSync } from "node:child_process";
import { delimiter } from "node:path";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function makeProbe(processRef = process) {
  let cached = null;
  return function probe(opts = {}) {
    if (cached) return cached;
    const probe = {
      skipped: false,
      shell: null,
      method: null,
      entries: [],
      error: null,
    };
    if (processRef.platform === "win32" && !opts.forceUnix) {
      probe.skipped = true;
      cached = probe;
      return probe;
    }
    const shell =
      opts.shell ||
      processRef.env.SHELL ||
      (processRef.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
    probe.shell = shell;
    const shellLower = shell.toLowerCase();
    const isFish = shellLower.endsWith("/fish") || shellLower.endsWith("fish");
    const attempts = isFish
      ? [
          { args: ["-ilc", "env"], method: "fish-interactive-login" },
          { args: ["-lc", "env"], method: "fish-login" },
        ]
      : [
          { args: ["-ilc", "env"], method: "interactive-login" },
          { args: ["-lc", "env"], method: "login" },
        ];
    for (const attempt of attempts) {
      try {
        const output = execFileSync(shell, attempt.args, {
          encoding: "utf8",
          timeout: opts.timeout ?? 3000,
          maxBuffer: 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
        const pathLine = output.split("\n").find((line) => /^PATH=/.test(line));
        if (!pathLine) continue;
        const realPath = pathLine.slice("PATH=".length);
        const entries = realPath
          .split(delimiter)
          .map((e) => e.trim())
          .filter((e) => e.length > 0);
        if (entries.length === 0) continue;
        probe.method = attempt.method;
        probe.entries = entries;
        cached = probe;
        return probe;
      } catch (error) {
        probe.error = error instanceof Error ? error.message : String(error);
      }
    }
    cached = probe;
    return probe;
  };
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`,
    );
  }
}

// --- Test 1: Windows skip path -------------------------------------------------
{
  const probe = makeProbe({ platform: "win32", env: {} })();
  assert(probe.skipped === true, "win32 should set skipped=true");
  assertEqual(probe.entries.length, 0, "win32 should yield zero entries");
  assertEqual(probe.method, null, "win32 should not record a method");
}

// --- Test 2: Caching — second call returns the same object ---------------------
{
  const probe = makeProbe({ platform: "win32", env: {} });
  const first = probe();
  const second = probe();
  assert(first === second, "probe result must be cached");
}

// Spawn-based tests below only run on non-Windows. Production probe is
// hard-skipped on win32, and Windows can't execFile a .cmd directly the way
// these tests need, so gating these here matches both production behaviour and
// what's worth testing.
if (process.platform !== "win32") {
  // --- Test 3: env-output parsing (PATH parsed out of arbitrary shell output) -
  {
    const dir = mkdtempSync(join(tmpdir(), "probe-"));
    const fakeShellPath = join(dir, "fake-shell.sh");
    const expectedPath = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"].join(delimiter);
    writeFileSync(
      fakeShellPath,
      `#!/bin/sh\necho "hello from fake shell"\necho "PATH=${expectedPath}"\necho "SHELL=/bin/zsh"\necho "HOME=/Users/test"\n`,
    );
    chmodSync(fakeShellPath, 0o755);

    const probe = makeProbe({ platform: "linux", env: { SHELL: fakeShellPath } });
    const result = probe({ shell: fakeShellPath, forceUnix: true });
    assert(result.skipped === false, "fake shell run should not be skipped");
    assert(
      result.entries.includes("/opt/homebrew/bin"),
      `entries should include /opt/homebrew/bin, got: ${JSON.stringify(result.entries)}`,
    );
    assert(
      result.entries.includes("/usr/local/bin"),
      "entries should include /usr/local/bin",
    );
    assertEqual(result.method, "interactive-login", "method should be interactive-login");
  }

  // --- Test 4: shell that doesn't print PATH at all yields empty entries -----
  {
    const dir = mkdtempSync(join(tmpdir(), "probe-noenv-"));
    const fakeShellPath = join(dir, "noisy-shell.sh");
    writeFileSync(fakeShellPath, '#!/bin/sh\necho "hello world"\necho "FOO=bar"\n');
    chmodSync(fakeShellPath, 0o755);

    const probe = makeProbe({ platform: "linux", env: { SHELL: fakeShellPath } });
    const result = probe({ shell: fakeShellPath, forceUnix: true });
    assertEqual(result.entries.length, 0, "no PATH= line should produce zero entries");
  }

  // --- Test 5: missing shell binary surfaces error and yields empty entries --
  {
    const probe = makeProbe({ platform: "linux", env: { SHELL: "/nope/does-not-exist" } });
    const result = probe({ shell: "/nope/does-not-exist", forceUnix: true, timeout: 1000 });
    assertEqual(result.entries.length, 0, "missing shell should yield zero entries");
    assert(result.error, "missing shell should record an error message");
  }

  // --- Test 6: timeout aborts within budget ----------------------------------
  {
    const dir = mkdtempSync(join(tmpdir(), "probe-hang-"));
    const fakeShellPath = join(dir, "hang-shell.sh");
    writeFileSync(fakeShellPath, "#!/bin/sh\nsleep 30\n");
    chmodSync(fakeShellPath, 0o755);
    const startedAt = Date.now();
    const probe = makeProbe({ platform: "linux", env: { SHELL: fakeShellPath } });
    const result = probe({ shell: fakeShellPath, forceUnix: true, timeout: 600 });
    const elapsed = Date.now() - startedAt;
    assert(elapsed < 4000, `timeout should fire fast, elapsed=${elapsed}ms`);
    assertEqual(result.entries.length, 0, "hung shell should yield zero entries");
  }
} else {
  console.log("  [info] tests 3-6 skipped on win32 (production probe also skips win32)");
}

// --- Test 7: real probe on this host (smoke test, not asserted strictly) ------
{
  const probe = makeProbe()();
  if (process.platform === "win32") {
    assert(probe.skipped === true, "real run on win32 should be skipped");
    console.log("  [smoke] win32 — skipped as expected");
  } else {
    console.log(
      `  [smoke] platform=${process.platform} shell=${probe.shell} method=${probe.method ?? "<none>"} entries=${probe.entries.length}`,
    );
    if (probe.entries.length === 0) {
      console.log(`  [smoke] note: probe returned 0 entries (error=${probe.error ?? "none"}). This is OK in CI.`);
    }
  }
}

// --- Consistency check — production source still mirrors this implementation --
{
  const productionSource = readFileSync(
    resolve(here, "..", "src", "commands", "publishViaMcp.ts"),
    "utf8",
  );
  const requiredMarkers = [
    "function probeLoginShellPath(",
    "execFileSync(shell",
    `args: ["-ilc", "env"], method: "interactive-login"`,
    `args: ["-lc", "env"], method: "login"`,
    "method: \"fish-interactive-login\"",
    "method: \"fish-login\"",
    "/^PATH=/",
    "timeout: 3000",
    `stdio: ["ignore", "pipe", "ignore"]`,
  ];
  for (const marker of requiredMarkers) {
    assert(
      productionSource.includes(marker),
      `production source missing expected marker: ${marker}`,
    );
  }
}

console.log("shell-path-probe-check: ok");
