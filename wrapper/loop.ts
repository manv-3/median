import { AgyResult, EscalationReport } from '../types/index.js';

export const MAX_ITERATIONS = 4;

export interface LoopDeps {
    runAgy: (prompt: string) => Promise<AgyResult>;
    onProgress?: (message: string) => void;
}

export interface IterationLog {
    iteration: number;
    promptSent: string;
    agyResult: AgyResult;
    accepted: boolean;
    reason: string;
}

export type ExitReason = 'done' | 'max_iterations' | 'environment_error';

export interface LoopResult {
    success: boolean;
    reason: ExitReason;
    finalOutput?: string;
    iterations: number;
    bestScore: number;
    bestOutput: string;
    escalationReport?: EscalationReport;
    trace: IterationLog[];
}

function buildRetryPrompt(goal: string, agyResult: AgyResult): string {
    const stderr = agyResult.stderr.trim();
    const stdout = agyResult.stdout.trim();

    const parts = [
        `The previous attempt was not good enough.`,
        `Goal: ${goal}`
    ];

    if (stderr) {
        parts.push(`Error:\n${stderr}`);
    }

    if (stdout) {
        parts.push(`Previous output:\n${stdout}`);
    }

    parts.push('Try again and return only the result.');

    return parts.join('\n\n');
}

function makeHistory(trace: IterationLog[]): string[] {
    return trace.map(entry => {
        const status = entry.accepted ? 'accepted' : 'retry';
        return `[iter ${entry.iteration}] ${status}: ${entry.reason}`;
    });
}

/**
 * Executes the standalone agy retry workflow.
 */
export async function runClosedLoop(goal: string, deps: LoopDeps): Promise<LoopResult> {
    const trace: IterationLog[] = [];
    let currentPrompt = goal;
    let bestOutput = '';

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        deps.onProgress?.(`[Iteration ${iteration}/${MAX_ITERATIONS}] Querying agy...`);
        const agyResult = await deps.runAgy(currentPrompt);
        const output = agyResult.stdout.trim();

        if (output.length > bestOutput.trim().length) {
            bestOutput = agyResult.stdout;
        }

        if (agyResult.failureClass === 'environment') {
            trace.push({
                iteration,
                promptSent: currentPrompt,
                agyResult,
                accepted: false,
                reason: agyResult.stderr || 'Environment error'
            });

            return {
                success: false,
                reason: 'environment_error',
                iterations: iteration,
                bestScore: bestOutput.trim().length > 0 ? 1 : 0,
                bestOutput,
                escalationReport: {
                    goal,
                    iterations: iteration,
                    bestAttemptScore: bestOutput.trim().length > 0 ? 1 : 0,
                    bestCodeState: bestOutput,
                    history: makeHistory(trace)
                },
                trace
            };
        }

        const accepted = agyResult.exitCode === 0 && output.length > 0;
        const reason = accepted
            ? 'agy returned a non-empty result'
            : (output.length === 0 ? 'agy returned an empty result' : (agyResult.stderr || 'agy returned a non-zero exit code'));

        trace.push({
            iteration,
            promptSent: currentPrompt,
            agyResult,
            accepted,
            reason
        });

        if (accepted) {
            return {
                success: true,
                reason: 'done',
                finalOutput: agyResult.stdout,
                iterations: iteration,
                bestScore: 1,
                bestOutput: agyResult.stdout,
                trace
            };
        }

        if (iteration < MAX_ITERATIONS) {
            currentPrompt = buildRetryPrompt(goal, agyResult);
        }
    }

    return {
        success: false,
        reason: 'max_iterations',
        iterations: MAX_ITERATIONS,
        bestScore: bestOutput.trim().length > 0 ? 1 : 0,
        bestOutput,
        escalationReport: {
            goal,
            iterations: MAX_ITERATIONS,
            bestAttemptScore: bestOutput.trim().length > 0 ? 1 : 0,
            bestCodeState: bestOutput,
            history: makeHistory(trace)
        },
        trace
    };
}
