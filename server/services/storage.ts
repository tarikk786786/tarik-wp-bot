import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { emitLog } from './socket.js';

let storage: Storage | null = null;
let bucketName: string | null = null;
let isConfigured = false;
let backupInProgress = false;

export function initStorage() {
    try {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const bucket = process.env.GOOGLE_CLOUD_BUCKET;
        let credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (!projectId || !bucket) {
            emitLog('GCS Backup: Not configured (missing GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_BUCKET)', 'info');
            return false;
        }

        bucketName = bucket;

        const options: any = { projectId };
        
        // If credentials is a JSON string, parse it
        if (credentials) {
            if (credentials.trim().startsWith('{')) {
                try {
                    options.credentials = JSON.parse(credentials);
                } catch (e) {
                    emitLog('GCS Backup: Failed to parse GOOGLE_APPLICATION_CREDENTIALS as JSON', 'error');
                }
            } else {
                options.keyFilename = credentials;
            }
        }

        storage = new Storage(options);
        isConfigured = true;
        emitLog(`GCS Backup: Configured for bucket ${bucket}`, 'info');
        return true;
    } catch (error: any) {
        emitLog(`GCS Backup: Initialization failed - ${error.message}`, 'error');
        return false;
    }
}

export async function backupSession(sessionPath: string): Promise<boolean> {
    if (!isConfigured || !storage || !bucketName) return false;
    
    // If a backup is already in progress, we don't want to skip entirely if this is a critical update.
    // However, WhatsApp updates creds frequently, so skipping concurrent ones is mostly fine.
    // To strictly satisfy requirements, we'll wait for the current one to finish.
    while (backupInProgress) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    backupInProgress = true;
    try {
        if (!fs.existsSync(sessionPath)) {
            emitLog('GCS Backup: Local session path does not exist, nothing to backup', 'warn');
            return false;
        }

        const files = fs.readdirSync(sessionPath);
        const bucket = storage.bucket(bucketName);

        // emitLog(`GCS Backup: Starting backup of ${files.length} files...`, 'info');

        const uploadPromises = files.map(async (file) => {
            const filePath = path.join(sessionPath, file);
            const destination = `whatsapp_session/${file}`;
            
            // Check if local file is actually newer than GCS
            const localStat = fs.statSync(filePath);
            const gcsFile = bucket.file(destination);
            
            try {
                const [exists] = await gcsFile.exists();
                if (exists) {
                    const [metadata] = await gcsFile.getMetadata();
                    const gcsTime = new Date(metadata.updated || 0).getTime();
                    // If GCS has a strictly newer file, do not overwrite it.
                    if (gcsTime > localStat.mtimeMs) {
                        return; // Skip this file
                    }
                }
            } catch (e) {
                // Ignore metadata fetch errors, just proceed with upload
            }

            // Retry logic
            let retries = 3;
            let backoff = 1000;
            
            while (retries > 0) {
                try {
                    await bucket.upload(filePath, {
                        destination,
                        metadata: {
                            cacheControl: 'no-cache',
                        },
                    });
                    break;
                } catch (err: any) {
                    retries--;
                    if (retries === 0) {
                        emitLog(`GCS Backup: Failed to upload ${file} - ${err.message}`, 'error');
                        throw err;
                    }
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    backoff *= 2;
                }
            }
        });

        await Promise.all(uploadPromises);
        // emitLog('GCS Backup: Backup completed successfully', 'info');
        return true;
    } catch (error: any) {
        emitLog(`GCS Backup: Backup failed - ${error.message}`, 'error');
        return false;
    } finally {
        backupInProgress = false;
    }
}

export async function sessionExistsOnGCS(): Promise<boolean> {
    if (!isConfigured || !storage || !bucketName) return false;
    try {
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: 'whatsapp_session/creds.json' });
        return files.length > 0;
    } catch (error: any) {
        emitLog(`GCS Backup: Failed to check if session exists - ${error.message}`, 'error');
        return false;
    }
}

export async function restoreSession(sessionPath: string): Promise<boolean> {
    if (!isConfigured || !storage || !bucketName) return false;

    try {
        emitLog('GCS Backup: Attempting to restore session from GCS...', 'info');
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: 'whatsapp_session/' });

        if (files.length === 0) {
            emitLog('GCS Backup: No session found on GCS', 'info');
            return false;
        }

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const downloadPromises = files.map(async (file) => {
            const fileName = file.name.replace('whatsapp_session/', '');
            if (!fileName) return; // Skip directory itself if it exists

            const destination = path.join(sessionPath, fileName);
            
            let retries = 3;
            let backoff = 1000;
            
            while (retries > 0) {
                try {
                    await file.download({ destination });
                    break;
                } catch (err: any) {
                    retries--;
                    if (retries === 0) {
                        emitLog(`GCS Backup: Failed to download ${fileName} - ${err.message}`, 'error');
                        throw err;
                    }
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    backoff *= 2;
                }
            }
        });

        await Promise.all(downloadPromises);
        emitLog('GCS Backup: Session restored successfully from GCS', 'info');
        return true;
    } catch (error: any) {
        emitLog(`GCS Backup: Failed to restore session - ${error.message}`, 'error');
        return false;
    }
}

export async function deleteExpiredBackups(): Promise<boolean> {
    if (!isConfigured || !storage || !bucketName) return false;
    try {
        emitLog('GCS Backup: Deleting old session backups...', 'info');
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: 'whatsapp_session/' });
        
        const deletePromises = files.map(file => file.delete());
        await Promise.all(deletePromises);
        
        emitLog('GCS Backup: Old backups deleted successfully', 'info');
        return true;
    } catch (error: any) {
        emitLog(`GCS Backup: Failed to delete backups - ${error.message}`, 'error');
        return false;
    }
}
