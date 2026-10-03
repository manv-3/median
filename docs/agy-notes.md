# AGY CLI Notes

## Availability
- Executable: `agy` (`agy.exe`)
- Installed path: `C:\Users\mvs35\AppData\Local\agy\bin\agy.exe` (on PATH)
- Version: 1.2.16

## Invocation
- Exact command: `agy --print "<prompt>" --output-format text`
- Prompt flag: `--print` (aliases: `-p`, `--prompt`)
- Note: There is NO `agy run` subcommand. Invocation uses top-level flags.

## Non-interactive execution
- Supported: Yes, natively via `--print` / `-p` / `--prompt`.
- How confirmed: Executed live in terminal with prompt `agy --print "Reply with exactly: AGY_TEST_OK" --output-format text`. Exited cleanly and returned `AGY_TEST_OK` on stdout.

## Working directory
- Behavior: Inherits current working directory of child process (`execa` default).

## Output
- stdout: Formatted raw text when `--output-format text` is supplied.
- stderr: Captured as string on error.


## Exit codes
- Success: `0`
- Failure: `1` (e.g. invalid flags or execution failure).

## Timeout
- Native timeout: `--print-timeout` available (default 0s = wait until complete).
- Wrapper timeout: Handled via `execa` with `120000` ms (2 minutes).

## Real Test Execution
- Test prompt: `agy --print "Reply with exactly: AGY_TEST_OK" --output-format text`
- Result: Exited 0, returned response `AGY_TEST_OK`.
- Tested live via the CLI integration (`wrapper/cli.ts`) and unit tests natively.
