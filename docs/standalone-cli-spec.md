# Standalone AGY CLI Spec

## Goal
Build a small standalone CLI around `agy` that takes one goal, runs `agy` in its native non-interactive mode, checks the result, and either returns the result or writes an escalation report.

## What it is not
- It is not a plugin inside `agy`.
- It is not a new `agy` subcommand.
- It is not a general agent framework.

## User flow
1. The user runs the CLI with a task goal.
2. The CLI calls `agy --print "<goal>" --output-format text`.
3. The CLI runs local checks on the output.
4. If the result looks good, the CLI prints the final code.
5. If the result is broken, the CLI retries with a focused fix instruction.
6. After a small retry limit, the CLI writes an escalation report instead of guessing.

## Core behavior
- Use `agy` as the code generator.
- Keep the command-line interface minimal.
- Keep verification local and deterministic where possible.
- Make failures visible and recoverable.
- Prefer clear exit codes over hidden side effects.

## Initial scope
- One goal in, one verified result out.
- Verbose mode for debugging.
- Escalation output when retries fail.
- A simple test suite for the wrapper behavior.

## Future options
- Add smarter checks.
- Add richer retry instructions.
- Add benchmarking later, after the CLI is stable.
