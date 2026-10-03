/// <reference types="node" />
import { runAgy } from './agy.js';
import { runChecks } from './checks.js';
import { runClosedLoop } from './loop.js';
import { writeEscalationReport } from './escalation.js';
import { evaluateTier0 } from '../decision/tier0.js';
import { tier1Judge } from '../decision/tier1.js';

async function main() {
    const args = process.argv.slice(2);
    const verbose = args.includes('--verbose');
    const goalArgIndex = process.argv.findIndex((arg, i) => i >= 2 && !arg.startsWith('--'));

    if (goalArgIndex === -1) {
        console.error('Error: Please provide a goal as a command-line argument.');
        process.exit(1);
    }

    const goal = process.argv[goalArgIndex];

    const deps = {
        runAgy,
        runChecks: (code: string) => runChecks(),
        evaluateTier0,
        tier1Judge
    };

    if (verbose) {
        console.log(`Starting loop with goal: "${goal}"`);
    }

    try {
        const result = await runClosedLoop(goal, deps);

        if (verbose) {
            console.log(`Loop finished. Success: ${result.success}, Reason: ${result.reason}`);
            console.log(`Iterations: ${result.iterations}, Best Score: ${result.bestScore}`);
        }

        if (result.success) {
            if (result.finalCode) {
                console.log(result.finalCode);
            } else if (result.bestCode) {
                console.log(result.bestCode);
            } else {
                console.log('Success');
            }
        } else {
            console.error(`Failed with reason: ${result.reason}`);
            if (result.escalationReport) {
                await writeEscalationReport(result.escalationReport);
                if (verbose) {
                    console.error('Escalation report written.');
                }
            }
            process.exit(1); // unsuccesful, exit code 1
        }
    } catch (err: any) {
        console.error(`Unexpected error: ${err.message || String(err)}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
