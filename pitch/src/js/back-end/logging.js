
export const FirebaseWriteLogger = (() => {
    const STORAGE_KEY = 'FIREBASE_WRITE_LOGS';
    const MAX_ENTRIES = 1000;
    let buffer = [];

    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        buffer = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(buffer)) buffer = [];
      } catch (_) {
        buffer = [];
      }
    }

    function persist() {
      try {
        if (buffer.length > MAX_ENTRIES) {
          buffer = buffer.slice(buffer.length - MAX_ENTRIES);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
      } catch (_) {
        // ignore storage failures
      }
    }

    load();

    return {
      log(action, path, meta = {}, resultId = null, error = null) {
        const entry = {
          ts: new Date().toISOString(),
          action, // addDoc | updateDoc | deleteDoc | setDoc
          path,   // e.g., users/uid or friendRequests
          meta: (() => { try { return JSON.parse(JSON.stringify(meta)); } catch { return {}; } })(),
          resultId,
          ok: !error,
          error: error ? { message: String(error?.message || error), code: error?.code || null } : null,
        };
        buffer.push(entry);
        persist();
        return entry;
      },
      exportAsText() {
        const lines = buffer.map(e => {
          return `[${e.ts}] ${e.ok ? 'OK' : 'ERR'} ${e.action} ${e.path} ${e.resultId ? `id=${e.resultId}` : ''} ${e.error ? `error=${e.error.message}` : ''} meta=${JSON.stringify(e.meta)}`.trim();
        });
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `firebase-writes-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      clear() {
        buffer = [];
        persist();
      },
      getAll() { return [...buffer]; }
    };
  })();

export async function wrapWrite(promise, action, path, meta) {
    const start = Date.now();
    try {
      const result = await promise;
      const durationMs = Date.now() - start;
      const resultId = result?.id || null;
      FirebaseWriteLogger.log(action, path, { ...meta, durationMs }, resultId, null);
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      FirebaseWriteLogger.log(action, path, { ...meta, durationMs }, null, error);
      throw error;
    }
  }

export async function wrapRead(promise, action, path, meta) {
    const start = Date.now();
    try {
      const result = await promise;
      const durationMs = Date.now() - start;
      const size = (result?.size !== undefined) ? result.size : (Array.isArray(result?.docs) ? result.docs.length : undefined);
      FirebaseWriteLogger.log(action, path, { ...meta, durationMs, size }, null, null);
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      FirebaseWriteLogger.log(action, path, { ...meta, durationMs }, null, error);
      throw error;
    }
  }
