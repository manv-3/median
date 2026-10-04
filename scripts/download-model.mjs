#!/usr/bin/env node
/**
 * Cross-platform model downloader for Cloudflare Clef-Flash GGUF.
 * Zero external dependencies (uses native Node.js).
 * Works on Windows, Linux, and macOS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ID = 'ggml-org/Clef-Flash-GGUF';
const FILENAME = 'Clef-Flash-Q4_K_M.gguf';
const DOWNLOAD_URL = `https://huggingface.co/${REPO_ID}/resolve/main/${FILENAME}`;
const MODELS_DIR = path.resolve(__dirname, '..', 'models');
const TARGET_FILE = path.join(MODELS_DIR, FILENAME);
const PART_FILE = `${TARGET_FILE}.part`;
const MIN_EXPECTED_SIZE = 6_400_000_000; // ~6.48 GB

function formatBytes(bytes) {
    return (bytes / 1e9).toFixed(2) + ' GB';
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

function downloadStream(finalUrl, startOffset, totalExpectedSize) {
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
            const outStream = fs.createWriteStream(PART_FILE, { flags: startOffset > 0 ? 'a' : 'w' });

            let downloadedBytes = startOffset;
            let lastReportTime = Date.now();
            let lastBytes = downloadedBytes;

            console.log(`\nStarting download: ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);

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

async function main() {
    if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    if (fs.existsSync(TARGET_FILE)) {
        const stats = fs.statSync(TARGET_FILE);
        if (stats.size >= MIN_EXPECTED_SIZE) {
            console.log(`[ok] Clef-Flash model is already present at:\n     ${TARGET_FILE}`);
            console.log(`     Size: ${formatBytes(stats.size)}`);
            return;
        }
    }

    console.log('='.repeat(65));
    console.log('Cloudflare Clef-Flash GGUF Downloader');
    console.log(`Repository: ${REPO_ID}`);
    console.log(`File:       ${FILENAME} (~6.48 GB)`);
    console.log(`Target:     ${TARGET_FILE}`);
    console.log('='.repeat(65));

    let startOffset = 0;
    if (fs.existsSync(PART_FILE)) {
        const partStats = fs.statSync(PART_FILE);
        startOffset = partStats.size;
        console.log(`Found partial download (${formatBytes(startOffset)}). Resuming...`);
    }

    try {
        console.log('Resolving download CDN URL...');
        const finalUrl = await getRedirectUrl(DOWNLOAD_URL);

        await downloadStream(finalUrl, startOffset, MIN_EXPECTED_SIZE);

        fs.renameSync(PART_FILE, TARGET_FILE);
        console.log(`[ok] Download complete: ${TARGET_FILE}`);
    } catch (err) {
        console.error(`\n[error] Download failed: ${err.message}`);
        console.error('You can resume the download by re-running: npm run download:model');
        process.exit(1);
    }
}

main();
