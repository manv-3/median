/// <reference types="node" />
import { execa } from 'execa';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { Checks } from '../types/index.js';

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function ranCleanly(
    command: string,
    args: string[] = [],
    cwd?: string
): Promise<boolean> {
    try {
        await execa(command, args, { cwd });
        return true;
    } catch {
        return false;
    }
}

async function runTests(cwd: string = process.cwd()): Promise<Checks['tests']> {
    const reportPath = path.join(cwd, '.vitest/json/output.json');
    const pkgPath = path.join(cwd, 'package.json');

    const hasPkg = await fileExists(pkgPath);
    if (!hasPkg) {
        return { passed: 0, failed: 0, total: 0 };
    }

    try {
        const pkgContent = await readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgContent);

        if (!pkg.scripts?.test) {
            return { passed: 0, failed: 0, total: 0 };
        }

        // Try running tests
        const { stdout, stderr } = await execa('npm', ['test'], { cwd });
        const output = `${stdout}\n${stderr}`;

        // Try reading vitest report if generated
        if (await fileExists(reportPath)) {
            const report = await readFile(reportPath, 'utf8');
            const data = JSON.parse(report);
            return {
                passed: data.numPassedTests ?? 1,
                failed: data.numFailedTests ?? 0,
                total: data.numTotalTests ?? 1
            };
        }

        // Parse common test summary patterns if available
        const passedMatch = output.match(/(\d+)\s+passed/i);
        const failedMatch = output.match(/(\d+)\s+failed/i);

        const passed = passedMatch ? parseInt(passedMatch[1], 10) : 1;
        const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

        return {
            passed,
            failed,
            total: passed + failed
        };
    } catch (err: any) {
        if (await fileExists(reportPath)) {
            try {
                const report = await readFile(reportPath, 'utf8');
                const data = JSON.parse(report);
                return {
                    passed: data.numPassedTests ?? 0,
                    failed: data.numFailedTests ?? 1,
                    total: data.numTotalTests ?? 1
                };
            } catch {
                // fall through
            }
        }

        return {
            passed: 0,
            failed: 1,
            total: 1
        };
    }
}

async function countIssues(
    command: string,
    args: string[],
    cwd?: string
): Promise<number> {
    try {
        await execa(command, args, { cwd });
        return 0;
    } catch (error: any) {
        const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;

        if (!output.trim()) {
            return 1;
        }

        return output
            .split('\n')
            .filter(line => /error/i.test(line))
            .length;
    }
}

export async function getWorkspaceDiff(cwd: string = process.cwd()): Promise<string> {
    try {
        const { stdout } = await execa('git', ['diff', 'HEAD'], { cwd });
        if (stdout.trim()) {
            return stdout;
        }

        // Also check unstaged untracked or status
        const { stdout: status } = await execa('git', ['status', '--short'], { cwd });
        if (status.trim()) {
            return status;
        }

        // If working directory is clean, inspect recent unpushed commits
        try {
            const { stdout: unpushedLog } = await execa('git', ['log', '-p', '-n', '8'], { cwd });
            if (unpushedLog.trim()) {
                return unpushedLog.slice(0, 10000);
            }
        } catch {
            // ignore
        }

        return '';
    } catch {
        return '';
    }
}

export async function runChecks(cwd: string = process.cwd()): Promise<Checks> {
    const pkgPath = path.join(cwd, 'package.json');
    const tsconfigPath = path.join(cwd, 'tsconfig.json');

    let buildOk = true;

    if (await fileExists(pkgPath)) {
        try {
            const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
            if (pkg.scripts?.build) {
                buildOk = await ranCleanly('npm', ['run', 'build'], cwd);
            }
        } catch {
            buildOk = false;
        }
    } else if (await fileExists(tsconfigPath)) {
        buildOk = await ranCleanly('npx', ['tsc', '--noEmit'], cwd);
    }

    const tests = await runTests(cwd);
    const lintErrors = 0;

    let typeErrors = 0;
    if (await fileExists(tsconfigPath)) {
        typeErrors = await countIssues('npx', ['tsc', '--noEmit'], cwd);
    }

    return {
        buildOk,
        tests,
        lintErrors,
        typeErrors
    };
}