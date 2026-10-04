import { DecisionResult, StatePayload } from '../types/index.js';
import type { ClefResponse, ClefNoulQuestion } from '../types/clef.js';

export const RAW_DONE_THRESHOLD = 0.90;
export const DEFAULT_CLEF_MODEL = '@cf/cloudflare/clef-flash';
export const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:8000/v1/systemone';
export const LOCAL_HEALTH_URL = 'http://127.0.0.1:8000/health';

/**
 * Checks if a local Clef System One server is currently running and healthy.
 */
export async function isLocalClefRunning(healthUrl: string = LOCAL_HEALTH_URL): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300);
        const res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timeout);
        return res?.ok === true;
    } catch {
        return false;
    }
}

export interface ClefConfig {
    accountId?: string;
    apiToken?: string;
    model?: string;
    endpoint?: string;
}

/**
 * Invokes the Clef decision model via a local Hugging Face server OR Cloudflare Workers AI.
 */
export async function queryClef(
    state: Record<string, any>,
    questions: Record<string, ClefNoulQuestion | any>,
    config?: ClefConfig
): Promise<ClefResponse> {
    let endpoint = config?.endpoint || process.env.CLEF_ENDPOINT;
    const accountId = config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = config?.apiToken || process.env.CLOUDFLARE_API_TOKEN;
    const model = config?.model || process.env.CLEF_MODEL || DEFAULT_CLEF_MODEL;

    if (!endpoint && !accountId && (await isLocalClefRunning())) {
        endpoint = DEFAULT_LOCAL_ENDPOINT;
    }

    // Use local endpoint if provided, otherwise route to Cloudflare Workers AI
    let url = endpoint || (accountId ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}` : undefined);

    if (url) {
        try {
            const parsed = new URL(url);
            if (parsed.pathname === '/' || parsed.pathname === '') {
                parsed.pathname = '/v1/systemone';
                url = parsed.toString();
            }
        } catch {
            // Keep URL as provided
        }
    }

    if (!url) {
        throw new Error('Clef endpoint not configured: set CLEF_ENDPOINT (for local System One model) or set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            state,
            questions
        })
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Clef API error (${res.status}): ${errorText}`);
    }

    const data: any = await res.json();
    const answers = data.result?.answers || data.answers;

    if (!answers) {
        throw new Error(`Clef API returned unexpected response: ${JSON.stringify(data)}`);
    }

    return {
        answers,
        model: data.model || model,
        usage: data.usage
    };
}

/**
 * Tier 1 Semantic Judge backed by Clef.
 * Invoked when Tier 0 returns ambiguous: true.
 */
export async function tier1Judge(
    payload: StatePayload,
    tier0: DecisionResult,
    config?: ClefConfig
): Promise<DecisionResult> {
    const reasons = [...tier0.reasons];

    let endpoint = config?.endpoint || process.env.CLEF_ENDPOINT;
    const accountId = config?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = config?.apiToken || process.env.CLOUDFLARE_API_TOKEN;

    if (!endpoint && !accountId && (await isLocalClefRunning())) {
        endpoint = DEFAULT_LOCAL_ENDPOINT;
    }

    const isConfigured = Boolean(endpoint || (accountId && apiToken));

    if (!isConfigured) {
        reasons.push('tier1 (Clef): Skipped (neither local CLEF_ENDPOINT nor Cloudflare credentials configured). Falling back to Tier 0 clean verdict.');
        return {
            phase: 'done',
            score: tier0.score,
            ambiguous: false,
            reasons
        };
    }

    try {
        const state = {
            goal: payload.goal,
            diff: payload.currentCodeState,
            verifiedRequirements: payload.verifiedRequirements
        };

        const questions: Record<string, ClefNoulQuestion> = {
            satisfied: {
                type: 'noul',
                instructions: 'Determine whether the code diff genuinely implements the stated goal. Answer false if the goal describes behavior that the diff does not actually implement or if it is merely an empty stub.',
                criteria: {
                    true: 'The code diff correctly satisfies and implements the requested goal.',
                    false: 'The code diff does not implement the requested goal or only partially implements it.'
                }
            }
        };

        const result = await queryClef(state, questions, config);
        const noul = (result?.answers?.satisfied as any)?.noul ?? 0;
        const passed = noul > RAW_DONE_THRESHOLD;

        const modelName = result.model || (endpoint ? 'local-clef' : DEFAULT_CLEF_MODEL);
        reasons.push(`tier1 (Clef: ${modelName}): noul=${noul.toFixed(3)} (threshold=${RAW_DONE_THRESHOLD})`);

        if (passed) {
            return {
                phase: 'done',
                score: tier0.score,
                ambiguous: false,
                passingProbability: noul,
                reasons
            };
        } else {
            return {
                phase: 'refine',
                score: tier0.score,
                ambiguous: false,
                passingProbability: noul,
                reasons,
                fixInstruction: `The code passed mechanical checks but semantic verification via Clef failed (confidence: ${noul.toFixed(2)}). Please ensure the implementation genuinely and completely satisfies the goal: "${payload.goal}".`
            };
        }
    } catch (err: any) {
        reasons.push(`tier1 (Clef) execution failed: ${err.message || String(err)}. Falling back to Tier 0.`);
        return {
            phase: 'done',
            score: tier0.score,
            ambiguous: false,
            reasons
        };
    }
}
