---
name: median-verify
description: Autonomous two-tier quality gate and verification tool. Validates that current workspace code builds cleanly, passes all unit tests, has zero type errors, and satisfies the user's task goals before marking work as complete.
---

# Median Verification Skill

This skill provides autonomous verification of code changes in the active workspace.

## When to use

Activate or consult this skill when:
- You have completed making code modifications and are preparing to conclude the task.
- You need to verify whether the workspace passes deterministic tests, builds cleanly, and is free of type errors.
- The Median Stop Hook has reported test failures or unfulfilled goals and prompted you to refine the code.

## Verification Principles

Median enforces a two-tier evaluation standard:
1. **Tier 0 (Deterministic Quality Gate)**:
   - **Build**: The project must compile or build with zero exit errors (`npm run build`, `tsc --noEmit`, etc.).
   - **Tests**: All automated tests must pass. A pass rate below 100% will cause Median to reject the completion.
   - **Types & Lint**: No TypeScript compilation errors or linter breaks.
2. **Tier 1 (Semantic Requirement Verification)**:
   - Passing tests is necessary, but not always sufficient if changes are just no-ops, mock stubs, or ignore edge cases.
   - All criteria specified in the user's prompt must be genuinely implemented in the modified files.

## Workflow on Refinement Request

If Median rejects completion with a fix instruction:
1. Carefully review the failing test output or error signatures provided in the rejection message.
2. Inspect the relevant files and implement the necessary logic corrections.
3. Run the tests in the workspace terminal to verify they now pass.
4. Conclude the response cleanly once all checks pass.
