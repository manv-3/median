import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tier1Judge, queryClef, RAW_DONE_THRESHOLD } from './tier1.js';
import { DecisionResult, StatePayload } from '../types/index.js';

describe('tier1Judge (Cloudflare Clef Decision Model)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.fetch = vi.fn();
        delete process.env.CLEF_ENDPOINT;
        delete process.env.CLOUDFLARE_ACCOUNT_ID;
        delete process.env.CLOUDFLARE_API_TOKEN;
    });

    const basePayload: StatePayload = {
        goal: 'Implement user pagination',
        iterationCount: 1,
        currentCodeState: '+ export function paginate() { ... }',
        executionErrors: [],
        errorSignature: '',
        previousErrorSignature: '',
        checks: {
            buildOk: true,
            tests: { passed: 2, failed: 0, total: 2 },
            lintErrors: 0,
            typeErrors: 0
        },
        verifiedRequirements: ['users API exists']
    };

    const ambiguousTier0: DecisionResult = {
        phase: 'refine',
        score: 0.85,
        ambiguous: true,
        reasons: ['Tier 0 marked ambiguous']
    };

    it('works with a local Hugging Face server (CLEF_ENDPOINT) without Cloudflare keys', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                answers: {
                    satisfied: {
                        type: 'noul',
                        noul: 0.96
                    }
                },
                model: 'local-clef-hf'
            })
        });

        const result = await tier1Judge(basePayload, ambiguousTier0, {
            endpoint: 'http://localhost:8000/run'
        });

        expect(result.phase).toBe('done');
        expect(result.passingProbability).toBe(0.96);
        expect(result.ambiguous).toBe(false);
        expect(result.reasons.some(r => r.includes('tier1 (Clef: local-clef-hf): noul=0.960'))).toBe(true);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            'http://localhost:8000/run',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
        );
    });

    it('works with Cloudflare Workers AI credentials', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                result: {
                    answers: {
                        satisfied: {
                            type: 'noul',
                            noul: 0.95
                        }
                    }
                },
                success: true
            })
        });

        const result = await tier1Judge(basePayload, ambiguousTier0, {
            accountId: 'test-account-id',
            apiToken: 'test-api-token'
        });

        expect(result.phase).toBe('done');
        expect(result.passingProbability).toBe(0.95);
        expect(result.ambiguous).toBe(false);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://api.cloudflare.com/client/v4/accounts/test-account-id/ai/run/@cf/cloudflare/clef-flash',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-token'
                })
            })
        );
    });

    it('returns refine with targeted fix instruction when Clef noul score is <= 0.90', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                result: {
                    answers: {
                        satisfied: {
                            type: 'noul',
                            noul: 0.42
                        }
                    }
                },
                success: true
            })
        });

        const result = await tier1Judge(basePayload, ambiguousTier0, {
            accountId: 'test-account-id',
            apiToken: 'test-api-token'
        });

        expect(result.phase).toBe('refine');
        expect(result.passingProbability).toBe(0.42);
        expect(result.ambiguous).toBe(false);
        expect(result.fixInstruction).toContain('semantic verification via Clef failed (confidence: 0.42)');
    });

    it('handles Clef API HTTP error gracefully without throwing', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal server error'
        });

        const result = await tier1Judge(basePayload, ambiguousTier0, {
            endpoint: 'http://localhost:8000/run'
        });

        expect(result.phase).toBe('done');
        expect(result.ambiguous).toBe(false);
        expect(result.reasons.some(r => r.includes('tier1 (Clef) execution failed'))).toBe(true);
    });

    it('handles unconfigured endpoints/credentials gracefully', async () => {
        const result = await tier1Judge(basePayload, ambiguousTier0, { endpoint: '', accountId: '', apiToken: '' });

        expect(result.phase).toBe('done');
        expect(result.ambiguous).toBe(false);
        expect(result.reasons.some(r => r.includes('neither local CLEF_ENDPOINT nor Cloudflare credentials configured'))).toBe(true);
    });
});
