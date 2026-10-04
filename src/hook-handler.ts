/// <reference types="node" />
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execa } from 'execa';
import { extractGoalFromTranscript, extractActiveProjectFromTranscript } from './transcript.js';
import { runChecks, getWorkspaceDiff } from '../wrapper/checks.js';
import { evaluateTier0 } from '../decision/tier0.js';
import { tier1Judge } from '../decision/tier1.js';
import type { StatePayload } from '../types/index.js';

export interface StopHookPayload {
    executionNum?: number;
    terminationReason?: string;
    error?: string;
    fullyIdle?: boolean;
    conversationId?: string;
    workspacePaths?: string[];
    transcriptPath?: string;
    artifactDirectoryPath?: string;
    modelName?: string;
}

export interface StopHookResponse {
    decision: 'continue' | 'allow';
    reason?: string;
}

export const MAX_HOOK_ITERATIONS = 4;

async function pathExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Resolves the active project directory within the workspace.
 * If the workspace root is not a git repo or project, checks immediate subdirectories.
 */
export async function resolveTargetWorkspace(
    workspacePath: string,
    transcriptPath?: string
): Promise<string> {
    if (await pathExists(path.join(workspacePath, 'package.json')) || await pathExists(path.join(workspacePath, '.git'))) {
        return workspacePath;
    }

    // 1. Prioritize project referenced in transcript tool calls
    const fromTranscript = await extractActiveProjectFromTranscript(transcriptPath, workspacePath);
    if (fromTranscript && (await pathExists(path.join(fromTranscript, '.git')) || await pathExists(path.join(fromTranscript, 'package.json')))) {
        return fromTranscript;
    }

    // 2. Scan immediate subdirectories
    try {
        const entries = await fs.readdir(workspacePath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const sub = path.join(workspacePath, entry.name);
                if (await pathExists(path.join(sub, '.git')) || await pathExists(path.join(sub, 'package.json'))) {
                    const diff = await getWorkspaceDiff(sub);
                    if (diff.trim()) {
                        return sub;
                    }
                }
            }
        }
    } catch {
        // Fall back to workspacePath
    }

    return workspacePath;
}

/**
 * Checks whether a user request is an informational question rather than a code generation task.
 */
export function isInformationalGoal(goal: string): boolean {
    const trimmed = goal.trim().toLowerCase();
    if (trimmed.endsWith('?')) return true;
    return /^(what|how|why|who|where|when|can you explain|explain|is there|are there|status|show|tell me)\b/i.test(trimmed);
}

export async function handleStopHook(payload: StopHookPayload): Promise<StopHookResponse> {
    const iteration = (payload.executionNum ?? 0) + 1;

    // Safety circuit breaker: Never block the agent indefinitely
    if (iteration > MAX_HOOK_ITERATIONS) {
        return {
            decision: 'allow',
            reason: `Median Quality Gate reached max iterations limit (${MAX_HOOK_ITERATIONS}). Allowing stop.`
        };
    }

    // 0. Manual bypass checks
    // (a) Environment variables: MEDIAN_DISABLED=1, MEDIAN_SKIP=1, or MEDIAN_ENABLE=0
    if (process.env.MEDIAN_DISABLED === '1' || process.env.MEDIAN_SKIP === '1' || process.env.MEDIAN_ENABLE === '0') {
        return {
            decision: 'allow',
            reason: 'Median bypassed via environment variable (MEDIAN_DISABLED=1).'
        };
    }

    const rawWorkspace = payload.workspacePaths?.[0] || process.cwd();
    const workspacePath = await resolveTargetWorkspace(rawWorkspace, payload.transcriptPath);

    // (b) Workspace file flag: .nomedian or .median-disable
    if (await pathExists(path.join(workspacePath, '.nomedian')) || await pathExists(path.join(workspacePath, '.median-disable'))) {
        return {
            decision: 'allow',
            reason: 'Median bypassed via workspace flag file (.nomedian).'
        };
    }

    // 1. Extract goal from transcript
    const goal = await extractGoalFromTranscript(payload.transcriptPath);

    // (c) Prompt flag: --no-median, [skip-median], (no-median), or no-median
    if (/(?:^|\s)(?:--no-median|--skip-median|\[no-median\]|\[skip-median\]|\(no-median\)|@no-median|no-median)(?:\s|$)/i.test(goal)) {
        return {
            decision: 'allow',
            reason: 'Median bypassed via prompt flag.'
        };
    }

    // 2. Run deterministic checks in the target workspace
    const checks = await runChecks(workspacePath);
    const diff = await getWorkspaceDiff(workspacePath);

    // 3. If no code was modified, all checks are clean, and the request was informational, allow stop
    if (diff.trim() === '' && checks.buildOk && checks.tests.total === 0 && isInformationalGoal(goal)) {
        return {
            decision: 'allow'
        };
    }

    // 4. If the goal requested pushing commits, and commits were created, but push requires interactive authentication:
    if (/\bpush\b/i.test(goal) && checks.buildOk && checks.tests.failed === 0) {
        try {
            const { stdout: unpushed } = await execa('git', ['rev-list', 'origin/Main..HEAD'], { cwd: workspacePath });
            if (unpushed.trim().split('\n').filter(Boolean).length > 0) {
                try {
                    await execa('git', ['push', '--dry-run'], {
                        cwd: workspacePath,
                        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
                    });
                } catch {
                    return {
                        decision: 'allow',
                        reason: 'Commits are partitioned and verified locally; awaiting user interactive credentials to push.'
                    };
                }
            }
        } catch {
            // ignore
        }
    }

    // 4. Assemble state payload
    const statePayload: StatePayload = {
        goal,
        iterationCount: iteration,
        currentCodeState: diff,
        executionErrors: [],
        errorSignature: checks.buildOk ? '' : 'build_failed',
        previousErrorSignature: '',
        checks,
        verifiedRequirements: []
    };

    // 5. Tier 0 evaluation
    let decision = evaluateTier0(statePayload);

    // 6. Tier 1 semantic evaluation if Tier 0 is ambiguous
    if (decision.ambiguous) {
        decision = await tier1Judge(statePayload, decision);
    }

    // 7. Return hook decision
    if (decision.phase === 'done') {
        return {
            decision: 'allow'
        };
    }

    const instruction = decision.fixInstruction || decision.reasons.join(', ');
    return {
        decision: 'continue',
        reason: `[Median Quality Gate Failed - Attempt ${iteration}/${MAX_HOOK_ITERATIONS}]\n${instruction}\nPlease correct the code and ensure all tests pass before completing.`
    };
}
