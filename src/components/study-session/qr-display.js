/* ============================================================
   qr-display.js — QR code generation for study pack sharing

   Uses qr-code-styling (already installed) to render a styled
   QR code with the Berean gold accent colour scheme.
   ============================================================ */

let _QRCodeStyling = null;

async function _loadQR() {
  if (_QRCodeStyling) return _QRCodeStyling;
  // qr-code-styling ships UMD — Vite's CJS interop may not create a default export.
  // Import the whole namespace and pull the constructor from wherever Vite puts it.
  const mod = await import('qr-code-styling');
  _QRCodeStyling = mod.default ?? mod.QRCodeStyling ?? mod;
  return _QRCodeStyling;
}

/**
 * Render a QR code + copy-URL button into the given container.
 * @param {HTMLElement} container
 * @param {string} url — The share URL to encode
 */
export async function renderQrCode(container, url) {
  if (!container || !url) return;

  container.innerHTML = `
    <div class="ss-qr">
      <div class="ss-qr__canvas" id="ss-qr-canvas"></div>
      <p class="ss-qr__hint">Scan to join the study session</p>
      <div class="ss-qr__url-row">
        <input type="text" class="ss-qr__url" id="ss-qr-url"
               value="${_esc(url)}" readonly />
        <button class="ss-qr__copy" id="ss-qr-copy" title="Copy link">Copy</button>
      </div>
      <p class="ss-qr__copied" id="ss-qr-copied" hidden>Copied!</p>
    </div>`;

  // Render QR code (may fail if URL is too long for QR capacity)
  const canvas = document.getElementById('ss-qr-canvas');
  try {
    const QRCodeStyling = await _loadQR();
    const qr = new QRCodeStyling({
      width:  220,
      height: 220,
      data:   url,
      type:   'svg',
      dotsOptions: {
        color: '#D4AF37',
        type:  'rounded',
      },
      backgroundOptions: {
        color: '#1E1E1E',
      },
      cornersSquareOptions: {
        color: '#D4AF37',
        type:  'extra-rounded',
      },
      cornersDotOptions: {
        color: '#D4AF37',
      },
    });
    if (canvas) qr.append(canvas);
  } catch (err) {
    // URL too long for QR — show message instead
    if (canvas) canvas.innerHTML = '<p style="color:#6B675F;font-size:.8125rem;">URL too long for QR code. Use the link below instead.</p>';
  }

  // Copy button
  document.getElementById('ss-qr-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      const copied = document.getElementById('ss-qr-copied');
      if (copied) {
        copied.hidden = false;
        setTimeout(() => { copied.hidden = true; }, 2000);
      }
    } catch {
      // Fallback: select the input
      const input = document.getElementById('ss-qr-url');
      input?.select();
    }
  });
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
