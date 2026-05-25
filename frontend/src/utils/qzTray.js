let _connectPromise = null;
let _securityPromise = null;

function getApiBaseUrl() {
  try {
    const raw = process.env.REACT_APP_API_BASE_URL || '/api';
    const s = String(raw || '').trim();
    return (s || '/api').replace(/\/+$/, '');
  } catch (e) {
    return '/api';
  }
}

function getQzSignatureAlgorithm() {
  try {
    const raw = String(process.env.REACT_APP_QZ_SIGNATURE_ALGORITHM || 'SHA512').trim().toUpperCase();
    if (raw === 'SHA1' || raw === 'SHA256' || raw === 'SHA512') return raw;
    return 'SHA512';
  } catch (e) {
    return 'SHA512';
  }
}

function parseApiJsonResponse(json) {
  const j = json || {};
  const status = j.status || j.success;
  const data = j.data || {};
  return { ok: status === 'success' || status === true, data, raw: j };
}

function getQz() {
  try {
    if (typeof window === 'undefined') return null;
    return window.qz || null;
  } catch (e) {
    return null;
  }
}

function normalizeQzConnectError(err) {
  const msg = err?.message ? String(err.message) : String(err || '');
  if (msg.includes('sendData') || msg.toLowerCase().includes('cannot read properties')) {
    const e = new Error('QZ_TRAY_NOT_RUNNING_OR_BLOCKED');
    e.cause = err;
    return e;
  }
  return err;
}

async function ensureQzSecurityConfigured() {
  const qz = getQz();
  if (!qz) throw new Error('QZ_NOT_LOADED');
  if (!qz.security) return;

  if (_securityPromise) return _securityPromise;

  const base = getApiBaseUrl();
  const signatureAlgorithm = getQzSignatureAlgorithm();

  _securityPromise = (async () => {
    if (typeof qz.security.setSignatureAlgorithm === 'function') {
      try {
        qz.security.setSignatureAlgorithm(signatureAlgorithm);
      } catch (e) {
        // ignore
      }
    }

    if (typeof qz.security.setCertificatePromise === 'function') {
      qz.security.setCertificatePromise((resolve, reject) => {
        fetch(`${base}/qz/certificate`, { credentials: 'same-origin', cache: 'no-store' })
          .then((resp) => resp.text())
          .then((txt) => {
            try {
              const json = JSON.parse(txt);
              const parsed = parseApiJsonResponse(json);
              const certificate = parsed?.data?.certificate || parsed?.raw?.certificate || '';
              if (!parsed.ok || !certificate) {
                throw new Error(parsed?.raw?.message || 'QZ_CERTIFICATE_UNAVAILABLE');
              }
              resolve(String(certificate));
              return;
            } catch (e) {
              if (txt && txt.includes('BEGIN CERTIFICATE')) {
                resolve(String(txt));
                return;
              }
              reject(e);
            }
          })
          .catch(reject);
      });
    }

    if (typeof qz.security.setSignaturePromise === 'function') {
      qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
        fetch(`${base}/qz/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ toSign: String(toSign) })
        })
          .then((resp) => resp.json())
          .then((json) => {
            const parsed = parseApiJsonResponse(json);
            const signature = parsed?.data?.signature || parsed?.raw?.signature || '';
            if (!parsed.ok || !signature) {
              throw new Error(parsed?.raw?.message || 'QZ_SIGNATURE_UNAVAILABLE');
            }
            resolve(String(signature));
          })
          .catch(reject);
      });
    }
  })();

  return _securityPromise;
}

async function ensureQzConnected() {
  const qz = getQz();
  if (!qz) throw new Error('QZ_NOT_LOADED');

  try {
    if (qz.websocket && typeof qz.websocket.isActive === 'function' && qz.websocket.isActive()) {
      return;
    }
  } catch (e) {
    // ignore
  }

  if (!_connectPromise) {
    _connectPromise = (async () => {
      await ensureQzSecurityConfigured();
      return qz.websocket.connect();
    })().catch((e) => {
      const msg = e && e.message ? String(e.message) : '';
      if (msg.toLowerCase().includes('already exists')) {
        return;
      }
      _connectPromise = null;
      throw normalizeQzConnectError(e);
    });
  }
  await _connectPromise;
}

export async function qzPrintEscPosBase64(payloadBase64, printerName) {
  if (!payloadBase64) throw new Error('EMPTY_PAYLOAD');
  await ensureQzConnected();

  const qz = getQz();
  if (!qz) throw new Error('QZ_NOT_LOADED');

  let printer = null;
  const name = String(printerName || '').trim();

  try {
    if (name) {
      printer = await qz.printers.find(name);
    } else if (qz.printers && typeof qz.printers.getDefault === 'function') {
      printer = await qz.printers.getDefault();
    } else {
      throw new Error('QZ_PRINTER_NAME_REQUIRED');
    }
  } catch (e) {
    throw normalizeQzConnectError(e);
  }

  const config = qz.configs.create(printer, { forceRaw: true });
  const data = [
    {
      type: 'raw',
      format: 'command',
      flavor: 'base64',
      data: String(payloadBase64)
    }
  ];

  try {
    await qz.print(config, data);
  } catch (e) {
    throw normalizeQzConnectError(e);
  }
}
