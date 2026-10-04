#!/usr/bin/env node
/// <reference types="node" />
import { handleStopHook, StopHookPayload } from '../src/hook-handler.js';

async function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        inputData += chunk;
    }

    let payload: StopHookPayload = {};
    if (inputData.trim()) {
        try {
            payload = JSON.parse(inputData);
        } catch {
            // If json is malformed, use empty object
        }
    }

    const response = await handleStopHook(payload);
    process.stdout.write(JSON.stringify(response));
}

main().catch(err => {
    // If an error occurs in the hook itself, fallback gracefully so the agent is not blocked
    process.stdout.write(JSON.stringify({
        decision: 'allow',
        reason: `Median hook error: ${err.message || String(err)}`
    }));
    process.exit(0);
});
