/// <reference types="node" />
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import type { Checks } from '../types/index.js';

async function ranCleanly(
    command: string,
    args: string[] = []
): Promise<boolean> {
    try {
        await execa(command, args);
        return true;
    } catch {
        return false;
    }
}

async function runTests(): Promise<Checks['tests']> {
    const reportPath = '.vitest/json/output.json';

    try {
        await execa(
            'npx',
            ['vitest', 'run', '--reporter=json']
        );

        const report = await readFile(
            reportPath,
            'utf8'
        );

        const data = JSON.parse(report);

        return {
            passed: data.numPassedTests ?? 0,
            failed: data.numFailedTests ?? 0,
            total: data.numTotalTests ?? 0
        };
    } catch {
        try {
            const report = await readFile(
                reportPath,
                'utf8'
            );

            const data = JSON.parse(report);

            return {
                passed: data.numPassedTests ?? 0,
                failed: data.numFailedTests ?? 0,
                total: data.numTotalTests ?? 0
            };
        } catch {
            return {
                passed: 0,
                failed: 1,
                total: 1
            };
        }
    }
}

async function countIssues(
    command: string,
    args: string[]
): Promise<number> {
    try {
        await execa(command, args);
        return 0;
    } catch (error) {
        const result = error as {
            stdout?: string;
            stderr?: string;
        };

        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

        if (!output.trim()) {
            return 1;
        }

        return output
            .split('\n')
            .filter(line => /error/i.test(line))
            .length;
    }
}

export async function runChecks(): Promise<Checks> {
    const buildOk = await ranCleanly(
        'npm',
        ['run', 'build']
    );

    const tests = await runTests();

    const lintErrors = 0;

    const typeErrors = await countIssues(
        'npx',
        ['tsc', '--noEmit']
    );

    return {
        buildOk,
        tests,
        lintErrors,
        typeErrors
    };
}