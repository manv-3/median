import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStopHook, MAX_HOOK_ITERATIONS } from './hook-handler.js';
import * as checksModule from '../wrapper/checks.js';
import * as transcriptModule from './transcript.js';

vi.mock('../wrapper/checks.js', () => ({
    runChecks: vi.fn(),
    getWorkspaceDiff: vi.fn()
}));

vi.mock('./transcript.js', () => ({
    extractGoalFromTranscript: vi.fn()
}));

const mockRunChecks = checksModule.runChecks as unknown as ReturnType<typeof vi.fn>;
const mockGetWorkspaceDiff = checksModule.getWorkspaceDiff as unknown as ReturnType<typeof vi.fn>;
const mockExtractGoal = transcriptModule.extractGoalFromTranscript as unknown as ReturnType<typeof vi.fn>;

describe('handleStopHook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExtractGoal.mockResolvedValue('Write a palindrome function');
        mockGetWorkspaceDiff.mockResolvedValue('diff --git a/file.ts');
    });

    it('allows stop when max iterations are exceeded', async () => {
        const response = await handleStopHook({
            executionNum: MAX_HOOK_ITERATIONS,
            terminationReason: 'model_stop'
        });

        expect(response.decision).toBe('allow');
        expect(response.reason).toContain('max iterations limit');
    });

    it('rejects stop when build fails', async () => {
        mockRunChecks.mockResolvedValueOnce({
            buildOk: false,
            tests: { passed: 0, failed: 0, total: 0 },
            lintErrors: 0,
            typeErrors: 0
        });

        const response = await handleStopHook({
            executionNum: 1,
            terminationReason: 'model_stop'
        });

        expect(response.decision).toBe('continue');
        expect(response.reason).toContain('Median Quality Gate Failed');
        expect(response.reason).toContain('Build failed');
    });

    it('rejects stop when tests fail', async () => {
        mockRunChecks.mockResolvedValueOnce({
            buildOk: true,
            tests: { passed: 2, failed: 1, total: 3 },
            lintErrors: 0,
            typeErrors: 0
        });

        const response = await handleStopHook({
            executionNum: 2,
            terminationReason: 'model_stop'
        });

        expect(response.decision).toBe('continue');
        expect(response.reason).toContain('Tests failed (1 of 3 failing)');
    });

    it('allows stop when all checks pass and tests exist', async () => {
        mockRunChecks.mockResolvedValueOnce({
            buildOk: true,
            tests: { passed: 3, failed: 0, total: 3 },
            lintErrors: 0,
            typeErrors: 0
        });

        const response = await handleStopHook({
            executionNum: 1,
            terminationReason: 'model_stop'
        });

        expect(response.decision).toBe('allow');
    });

    it('allows stop for informational queries with no code changes', async () => {
        mockExtractGoal.mockResolvedValueOnce('How can I integrate this in my plugin?');
        mockGetWorkspaceDiff.mockResolvedValueOnce('');
        mockRunChecks.mockResolvedValueOnce({
            buildOk: true,
            tests: { passed: 0, failed: 0, total: 0 },
            lintErrors: 0,
            typeErrors: 0
        });

        const response = await handleStopHook({
            executionNum: 1,
            terminationReason: 'model_stop'
        });

        expect(response.decision).toBe('allow');
    });

    it('bypasses when MEDIAN_DISABLED=1 is set', async () => {
        process.env.MEDIAN_DISABLED = '1';
        try {
            const response = await handleStopHook({
                executionNum: 1,
                terminationReason: 'model_stop'
            });
            expect(response.decision).toBe('allow');
            expect(response.reason).toContain('MEDIAN_DISABLED=1');
        } finally {
            delete process.env.MEDIAN_DISABLED;
        }
    });

    it('bypasses when prompt includes --no-median', async () => {
        mockExtractGoal.mockResolvedValueOnce('Refactor components --no-median');
        const response = await handleStopHook({
            executionNum: 1,
            terminationReason: 'model_stop'
        });
        expect(response.decision).toBe('allow');
        expect(response.reason).toContain('prompt flag');
    });
});
