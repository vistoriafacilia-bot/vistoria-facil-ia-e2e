import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';
const BUCKET = 'inspection-photos';

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ENV_FILE);
  if (!existsSync(path)) {
    return { values: {}, loadedValues: [] };
  }

  const values = {};
  const loadedValues = [];
  const text = readFileSync(path, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
    if (value) loadedValues.push(value);
  }

  return { values, loadedValues };
}

function redact(message, loadedValues) {
  let safeMessage = String(message || 'unknown error');
  for (const value of loadedValues) {
    if (value && value.length >= 4) {
      safeMessage = safeMessage.split(value).join('[redacted]');
    }
  }
  return safeMessage;
}

function statusLine(status, message) {
  console.log(`${status}: ${message}`);
}

function blocked(message, loadedValues = []) {
  statusLine('BLOCKED', redact(message, loadedValues));
  process.exitCode = 2;
}

function fail(message, loadedValues = []) {
  statusLine('FAIL', redact(message, loadedValues));
  process.exitCode = 1;
}

function hasEmailConfirmationError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('email not confirmed')
    || message.includes('email confirmation')
    || message.includes('confirm');
}

function isInvalidCredentials(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('invalid login credentials')
    || message.includes('invalid credentials');
}

async function authenticate(supabase, email, password, loadedValues) {
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signedIn.error && signedIn.data?.session && signedIn.data?.user) {
    return signedIn.data.user;
  }

  if (signedIn.error && hasEmailConfirmationError(signedIn.error)) {
    throw new Error('email confirmation required');
  }

  if (signedIn.error && !isInvalidCredentials(signedIn.error)) {
    throw new Error(`Supabase Auth signInWithPassword: ${redact(signedIn.error.message, loadedValues)}`);
  }

  const signedUp = await supabase.auth.signUp({ email, password });
  if (signedUp.error) {
    if (hasEmailConfirmationError(signedUp.error)) {
      throw new Error('email confirmation required');
    }
    throw new Error(`Supabase Auth signUp: ${redact(signedUp.error.message, loadedValues)}`);
  }

  if (!signedUp.data?.session || !signedUp.data?.user) {
    throw new Error('email confirmation required');
  }

  return signedUp.data.user;
}

async function blobSize(data) {
  if (!data) return 0;
  if (typeof data.arrayBuffer === 'function') {
    return (await data.arrayBuffer()).byteLength;
  }
  if (Buffer.isBuffer(data)) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return 0;
}

async function main() {
  const { values, loadedValues } = loadDotEnvLocal();

  const requiredConfig = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const missingConfig = requiredConfig.filter((key) => !values[key]);
  if (missingConfig.length) {
    blocked(`missing ${missingConfig.join(' and ')} in ${ENV_FILE}`, loadedValues);
    return;
  }

  const requiredE2E = ['SUPABASE_E2E_EMAIL', 'SUPABASE_E2E_PASSWORD'];
  const missingE2E = requiredE2E.filter((key) => !values[key]);
  if (missingE2E.length) {
    blocked(`missing ${missingE2E.join(' and ')} in ${ENV_FILE}`, loadedValues);
    return;
  }

  const supabase = createClient(values.VITE_SUPABASE_URL, values.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let uploadedPath = null;
  let cleanupConfirmed = false;

  try {
    const user = await authenticate(
      supabase,
      values.SUPABASE_E2E_EMAIL,
      values.SUPABASE_E2E_PASSWORD,
      loadedValues,
    );

    if (!user?.id) {
      blocked('Supabase Auth did not return an authenticated user', loadedValues);
      return;
    }

    const testRunId = `storage-auth-${Date.now()}-${randomUUID()}`;
    const objectPath = `${user.id}/photos/${testRunId}/probe.jpg`;
    const testImage = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
    const bucket = supabase.storage.from(BUCKET);

    const uploaded = await bucket.upload(objectPath, testImage, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) {
      blocked(`Supabase Storage upload: ${uploaded.error.message}`, loadedValues);
      return;
    }
    uploadedPath = objectPath;

    const downloaded = await bucket.download(objectPath);
    if (downloaded.error) {
      blocked(`Supabase Storage download: ${downloaded.error.message}`, loadedValues);
      return;
    }
    const downloadedSize = await blobSize(downloaded.data);
    if (downloadedSize <= 0) {
      fail('Supabase Storage download returned an empty object', loadedValues);
      return;
    }

    const removed = await bucket.remove([objectPath]);
    if (removed.error) {
      blocked(`Supabase Storage delete: ${removed.error.message}`, loadedValues);
      return;
    }

    const verifyDeleted = await bucket.download(objectPath);
    cleanupConfirmed = Boolean(verifyDeleted.error);
    if (!cleanupConfirmed) {
      fail('Supabase Storage cleanup verification failed: object is still downloadable', loadedValues);
      return;
    }

    statusLine('PASS', 'Supabase authenticated storage upload/download/delete cleanup validated');
  } catch (error) {
    const message = redact(error?.message || error, loadedValues);
    if (message === 'email confirmation required') {
      blocked('email confirmation required', loadedValues);
      return;
    }
    blocked(message, loadedValues);
  } finally {
    if (uploadedPath && !cleanupConfirmed) {
      const retryClient = createClient(values.VITE_SUPABASE_URL, values.VITE_SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      await retryClient.auth.signInWithPassword({
        email: values.SUPABASE_E2E_EMAIL,
        password: values.SUPABASE_E2E_PASSWORD,
      });
      await retryClient.storage.from(BUCKET).remove([uploadedPath]);
    }
  }
}

main().catch((error) => {
  blocked(error?.message || error);
});
