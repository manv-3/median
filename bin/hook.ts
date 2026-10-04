#!/usr/bin/env node
/// <reference types="node" />
import {
    handleStopHook,
    handlePostInvocationHook,
    StopHookPayload,
    PostInvocationPayload
} from '../src/hook-handler.js';

async function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        inputData += chunk;
    }

    let payload: any = {};
    if (inputData.trim()) {
        try {
            payload = JSON.parse(inputData);
        } catch {
            // If json is malformed, use empty object
        }
    }

    const isPostInvocation = process.argv.includes('PostInvocation') ||
                             process.argv.includes('--early') ||
                             ('invocationNum' in payload);

    if (isPostInvocation) {
        const response = await handlePostInvocationHook(payload as PostInvocationPayload);
        process.stdout.write(JSON.stringify(response));
    } else {
        const response = await handleStopHook(payload as StopHookPayload);
        process.stdout.write(JSON.stringify(response));
    }
}

main().catch(err => {
    // If an error occurs in the hook itself, fallback gracefully so the agent is not blocked
    const isPostInvocation = process.argv.includes('PostInvocation') || process.argv.includes('--early');
    if (isPostInvocation) {
        process.stdout.write(JSON.stringify({}));
    } else {
        process.stdout.write(JSON.stringify({
            decision: 'allow',
            reason: `Median hook error: ${err.message || String(err)}`
        }));
    }
    process.exit(0);
});
