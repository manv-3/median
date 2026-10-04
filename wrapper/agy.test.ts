import { describe, it, expect, vi } from 'vitest';
import { runAgy, classifyFailure } from './agy.js';
import * as execaModule from 'execa';

// Mock execa to avoid actually running processes during tests
vi.mock('execa', () => ({
    execa: vi.fn()
}));

const execaMock = execaModule.execa as unknown as ReturnType<typeof vi.fn>;

describe('classifyFailure', () => {
    it('identifies timeout', () => {
        expect(classifyFailure({ timedOut: true })).toBe('timeout');
    });

    it('identifies environment ENOENT', () => {
        expect(classifyFailure({ code: 'ENOENT' })).toBe('environment');
    });

    it('identifies environment command not found in message', () => {
        expect(classifyFailure({ message: 'bash: agy: command not found' })).toBe('environment');
    });

    it('defaults to code_bug', () => {
        expect(classifyFailure({ exitCode: 1, message: 'some error' })).toBe('code_bug');
    });
});

describe('runAgy', () => {
    it('returns successful execution data', async () => {
        execaMock.mockResolvedValueOnce({
            stdout: 'success output',
            stderr: '',
            exitCode: 0,
        });

        const result = await runAgy('my prompt');

        expect(execaMock).toHaveBeenCalledWith('agy', [
            '--print', 'my prompt',
            '--output-format', 'text',
            '--dangerously-skip-permissions'
        ], { timeout: 120000 });
        expect(result).toStrictEqual({
            stdout: 'success output',
            stderr: '',
            exitCode: 0,
        });
    });

    it('normalizes fenced markdown output into plain text', async () => {
        execaMock.mockResolvedValueOnce({
            stdout: '```python\ndef greet(name: str = "World") -> str:\n    return f"Hello, {name}!"\n```',
            stderr: '',
            exitCode: 0,
        });

        const result = await runAgy('make a greeting function');

        expect(result.stdout).toBe('def greet(name: str = "World") -> str:\n    return f"Hello, {name}!"');
    });

    it('catches non-zero exit code and classifies as code_bug', async () => {
        const execaError = new Error('Command failed') as any;
        execaError.stdout = 'part of output';
        execaError.stderr = 'syntax error';
        execaError.exitCode = 1;

        execaMock.mockRejectedValueOnce(execaError);

        const result = await runAgy('bad prompt');

        expect(result).toStrictEqual({
            stdout: 'part of output',
            stderr: 'syntax error',
            exitCode: 1,
            failureClass: 'code_bug',
        });
    });

    it('returns environment failure classification for ENOENT', async () => {
        const execaError = new Error('spawn ENOENT') as any;
        execaError.code = 'ENOENT';

        execaMock.mockRejectedValueOnce(execaError);

        const result = await runAgy('test');

        expect(result.failureClass).toBe('environment');
        expect(result.exitCode).toBe(1);
    });

    it('detects timeout', async () => {
        const execaError = new Error('Command timed out') as any;
        execaError.timedOut = true;
        execaError.stdout = 'slow output';

        execaMock.mockRejectedValueOnce(execaError);

        const result = await runAgy('test');

        expect(result.failureClass).toBe('timeout');
        expect(result.stdout).toBe('slow output');
    });
});
