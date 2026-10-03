import { execa } from 'execa';
import { AgyResult } from '../types/index.js';

export function classifyFailure(err: any): 'environment' | 'timeout' | 'code_bug' {
    if (err.timedOut) {
        return 'timeout';
    }

    if (err.code === 'ENOENT') {
        return 'environment';
    }

    if (
        err.message &&
        (
            err.message.toLowerCase().includes('command not found') ||
            err.message.toLowerCase().includes('is not recognized')
        )
    ) {
        return 'environment';
    }

    if (
        err.stderr &&
        err.stderr.toLowerCase().includes('is not recognized')
    ) {
        return 'environment';
    }

    return 'code_bug';
}

export async function runAgy(prompt: string): Promise<AgyResult> {
    try {
        const { stdout, stderr, exitCode } = await execa(
            'agy',
            ['--print', prompt, '--output-format', 'text'],
            {
                timeout: 120000
            }
        );

        return {
            stdout,
            stderr,
            exitCode: exitCode ?? 0
        };
    } catch (err: any) {
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || err.message || '',
            exitCode: err.exitCode ?? 1,
            failureClass: classifyFailure(err)
        };
    }
}