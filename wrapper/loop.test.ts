import { describe, it, expect, vi } from 'vitest';
import { MAX_ITERATIONS, runClosedLoop } from './loop.js';
import { AgyResult } from '../types/index.js';

describe('runClosedLoop', () => {
    it('returns success on the first non-empty agy response', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: 'export function ok() {}',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const result = await runClosedLoop('Build an ok function', { runAgy });

        expect(result.success).toBe(true);
        expect(result.reason).toBe('done');
        expect(result.iterations).toBe(1);
        expect(result.finalOutput).toBe('export function ok() {}');
        expect(runAgy).toHaveBeenCalledTimes(1);
    });

    it('retries when agy returns an empty result and escalates after the limit', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: '',
            exitCode: 0
        } as AgyResult);

        const result = await runClosedLoop('Write a greeting', { runAgy });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('max_iterations');
        expect(result.iterations).toBe(MAX_ITERATIONS);
        expect(result.escalationReport).toBeDefined();
        expect(result.escalationReport?.history).toHaveLength(MAX_ITERATIONS);
        expect(runAgy).toHaveBeenCalledTimes(MAX_ITERATIONS);
        expect(result.trace[1].promptSent).toContain('The previous attempt was not good enough.');
    });

    it('stops immediately on environment failures', async () => {
        const runAgy = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: 'agy: command not found',
            exitCode: 127,
            failureClass: 'environment'
        } as AgyResult);

        const result = await runClosedLoop('Do something', { runAgy });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('environment_error');
        expect(result.iterations).toBe(1);
        expect(result.escalationReport).toBeDefined();
        expect(runAgy).toHaveBeenCalledTimes(1);
    });
});
