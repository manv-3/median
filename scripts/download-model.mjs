#!/usr/bin/env node
/**
 * Cross-platform model downloader with interactive model selection.
 * Supports Cloudflare Clef-Flash and Clef model variants.
 * Zero external dependencies (uses native Node.js).
 * Works on Windows, Linux, and macOS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AVAILABLE_MODELS = [
    {
        id: '1',
        tag: 'clef-flash-q4',
        name: 'Clef-Flash 9B [Q4_K_M]',
        repo: 'ggml-org/Clef-Flash-GGUF',
        file: 'Clef-Flash-Q4_K_M.gguf',
        size: '~6.48 GB',
        vram: '~5.2 GB',
        desc: 'Recommended (Runs on 6GB+ GPUs, Laptops, CPU)',
        minBytes: 6_400_000_000
    },
    {
        id: '2',
        tag: 'clef-flash-q8',
        name: 'Clef-Flash 9B [Q8_0]',
        repo: 'ggml-org/Clef-Flash-GGUF',
        file: 'Clef-Flash-Q8_0.gguf',
        size: '~9.80 GB',
        vram: '~9.5 GB',
        desc: 'High precision 8-bit (Requires 12GB+ GPU VRAM)',
        minBytes: 9_700_000_000
    },
    {
        id: '3',
        tag: 'clef-27b-q4',
        name: 'Clef 27B [Q4_K_M]',
        repo: 'ggml-org/Clef-GGUF',
        file: 'Clef-Q4_K_M.gguf',
        size: '~17.2 GB',
        vram: '~18.0 GB',
        desc: 'Deep reasoning model (Requires 24GB+ GPU VRAM)',
        minBytes: 17_000_000_000
    },
    {
        id: '4',
        tag: 'clef-flash-bf16',
        name: 'Clef-Flash 9B [BF16]',
        repo: 'ggml-org/Clef-Flash-GGUF',
        file: 'Clef-Flash-BF16.gguf',
        size: '~18.5 GB',
        vram: '~19.5 GB',
        desc: 'Unquantized weights (Requires 24GB+ GPU VRAM)',
        minBytes: 18_000_000_000
    }
];

const MODELS_DIR = path.resolve(__dirname, '..', 'models');

function formatBytes(bytes) {
    return (bytes / 1e9).toFixed(2) + ' GB';
}

function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(query, (ans) => {
            rl.close();
            resolve(ans.trim());
        });
    });
}

function getRedirectUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(res.headers.location);
            } else if (res.statusCode === 200) {
                resolve(url);
            } else {
                reject(new Error(`Failed to resolve download URL (HTTP ${res.statusCode})`));
            }
        }).on('error', reject);
    });
}

function downloadStream(finalUrl, partFile, startOffset, totalExpectedSize) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (startOffset > 0) {
            headers['Range'] = `bytes=${startOffset}-`;
        }

        const req = https.get(finalUrl, { headers }, (res) => {
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                reject(new Error(`Download failed with HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }

            const totalBytes = totalExpectedSize || (startOffset + parseInt(res.headers['content-length'] || '0', 10));
            const outStream = fs.createWriteStream(partFile, { flags: startOffset > 0 ? 'a' : 'w' });

            let downloadedBytes = startOffset;
            let lastReportTime = Date.now();
            let lastBytes = downloadedBytes;

            console.log(`Starting transfer: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                outStream.write(chunk);

                const now = Date.now();
                if (now - lastReportTime >= 1000) {
                    const elapsedSec = (now - lastReportTime) / 1000;
                    const speed = (downloadedBytes - lastBytes) / elapsedSec / (1024 * 1024); // MB/s
                    const percent = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '?';
                    process.stdout.write(`\rProgress: ${percent}% | ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} | ${speed.toFixed(1)} MB/s `);
                    lastReportTime = now;
                    lastBytes = downloadedBytes;
                }
            });

            res.on('end', () => {
                outStream.end(() => {
                    process.stdout.write('\n');
                    resolve();
                });
            });

            res.on('error', (err) => {
                outStream.close();
                reject(err);
            });
        });

        req.on('error', reject);
    });
}

function resolveModelChoice(arg) {
    if (!arg) return null;
    const lower = arg.toLowerCase();
    return AVAILABLE_MODELS.find(m =>
        m.id === lower ||
        m.tag.toLowerCase() === lower ||
        m.file.toLowerCase() === lower ||
        m.name.toLowerCase().includes(lower)
    ) || null;
}

async function selectModel() {
    // Check CLI argument
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--list') {
            console.log('\nAvailable Models:');
            AVAILABLE_MODELS.forEach(m => {
                console.log(`  [${m.id}] ${m.name.padEnd(25)} Size: ${m.size.padEnd(10)} VRAM: ${m.vram.padEnd(9)} ${m.desc}`);
            });
            process.exit(0);
        }
        if (args[i] === '--model' || args[i] === '-m') {
            const found = resolveModelChoice(args[i + 1]);
            if (found) return found;
        }
        const directlyFound = resolveModelChoice(args[i]);
        if (directlyFound) return directlyFound;
    }

    if (process.env.CLEF_MODEL_CHOICE) {
        const found = resolveModelChoice(process.env.CLEF_MODEL_CHOICE);
        if (found) return found;
    }

    // If interactive terminal, show options menu
    if (process.stdin.isTTY) {
        console.log('\n' + '='.repeat(70));
        console.log('              Select Clef Decision Model to Download');
        console.log('='.repeat(70));
        AVAILABLE_MODELS.forEach(m => {
            console.log(`  [${m.id}] ${m.name.padEnd(25)} (${m.size}, ${m.vram} VRAM)`);
            console.log(`      └─ ${m.desc}`);
        });
        console.log('='.repeat(70));

        const answer = await promptUser('Enter choice [1-4, default: 1]: ');
        const selected = resolveModelChoice(answer || '1');
        if (selected) return selected;
        console.log('Invalid selection, falling back to default option [1].');
    }

    // Default option
    return AVAILABLE_MODELS[0];
}

async function main() {
    if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    const model = await selectModel();
    const downloadUrl = `https://huggingface.co/${model.repo}/resolve/main/${model.file}`;
    const targetFile = path.join(MODELS_DIR, model.file);
    const partFile = `${targetFile}.part`;

    console.log(`\nSelected Model: ${model.name}`);
    console.log(`File:           ${model.file} (${model.size})`);
    console.log(`Target:         ${targetFile}`);

    if (fs.existsSync(targetFile)) {
        const stats = fs.statSync(targetFile);
        if (stats.size >= model.minBytes) {
            console.log(`\n[ok] Model is already present and verified:\n     ${targetFile}`);
            console.log(`     Size: ${formatBytes(stats.size)}`);
            return;
        }
    }

    let startOffset = 0;
    if (fs.existsSync(partFile)) {
        const partStats = fs.statSync(partFile);
        startOffset = partStats.size;
        console.log(`Found partial download (${formatBytes(startOffset)}). Resuming...`);
    }

    try {
        console.log('Resolving CDN URL...');
        const finalUrl = await getRedirectUrl(downloadUrl);

        await downloadStream(finalUrl, partFile, startOffset, model.minBytes);

        fs.renameSync(partFile, targetFile);
        console.log(`\n[ok] Successfully downloaded and saved to: ${targetFile}`);
    } catch (err) {
        console.error(`\n[error] Download failed: ${err.message}`);
        console.error(`You can resume by running: npm run download:model -- --model ${model.id}`);
        process.exit(1);
    }
}

main();
