/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Extracts the user prompt / goal from an Antigravity transcript file.
 */
export async function extractGoalFromTranscript(transcriptPath?: string): Promise<string> {
    if (!transcriptPath) {
        return 'Verify project tests and code quality';
    }

    try {
        const content = await readFile(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');

        let lastPrompt = '';

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'USER_INPUT' && entry.content) {
                    lastPrompt = entry.content;
                }
            } catch {
                // Ignore malformed json lines
            }
        }

        if (!lastPrompt) {
            return 'Verify project tests and code quality';
        }

        const match = lastPrompt.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (match?.[1]) {
            return match[1].trim();
        }

        return lastPrompt.trim();
    } catch {
        return 'Verify project tests and code quality';
    }
}

/**
 * Resolves the primary project directory referenced in the transcript.
 */
export async function extractActiveProjectFromTranscript(
    transcriptPath?: string,
    workspacePath?: string
): Promise<string | undefined> {
    if (!transcriptPath || !workspacePath) return undefined;
    try {
        const content = await readFile(transcriptPath, 'utf8');
        const escaped = workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${escaped}/([a-zA-Z0-9_\\-\\.]+)`, 'g');
        const projectCounts = new Map<string, number>();

        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const subName = match[1];
            if (!subName.startsWith('.')) {
                projectCounts.set(subName, (projectCounts.get(subName) || 0) + 1);
            }
        }

        const sorted = Array.from(projectCounts.entries()).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
            return path.join(workspacePath, sorted[0][0]);
        }
    } catch {
        // Fall back
    }
    return undefined;
}
