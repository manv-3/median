/// <reference types="node" />
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EscalationReport } from '../types/index.js';

export function toMarkdown(report: EscalationReport): string {
    return [
        '# Escalation Report',
        '',
        `## Goal`,
        report.goal,
        '',
        `## Iterations`,
        String(report.iterations),
        '',
        `## Best Attempt Score`,
        String(report.bestAttemptScore),
        '',
        `## Best Code State`,
        '```',
        report.bestCodeState,
        '```',
        '',
        `## History`,
        ...report.history.map(entry => `- ${entry}`),
        ''
    ].join('\n');
}

export async function writeEscalationReport(
    report: EscalationReport,
    outDir = 'escalation'
): Promise<void> {
    await mkdir(outDir, { recursive: true });

    await writeFile(
        path.join(outDir, 'report.json'),
        JSON.stringify(report, null, 2),
        'utf8'
    );

    await writeFile(
        path.join(outDir, 'report.md'),
        toMarkdown(report),
        'utf8'
    );

    await writeFile(
        path.join(outDir, 'best-attempt.txt'),
        report.bestCodeState,
        'utf8'
    );
}