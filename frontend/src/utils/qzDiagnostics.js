/**
 * QZ Tray Diagnostics Utility
 * Helps identify why QZ Tray printing isn't working
 */

export async function runQzDiagnostics() {
  const results = {
    qzLoaded: false,
    qzVersion: null,
    websocketAvailable: false,
    connected: false,
    printers: [],
    defaultPrinter: null,
    error: null
  };

  try {
    // Check if QZ Tray is loaded
    if (typeof window === 'undefined' || !window.qz) {
      results.error = 'QZ_NOT_LOADED: QZ Tray JavaScript library not loaded. Check if qz-tray.js is included in index.html';
      return results;
    }

    results.qzLoaded = true;

    // Get QZ version
    try {
      results.qzVersion = window.qz.version || 'unknown';
    } catch (e) {
      results.qzVersion = 'error getting version';
    }

    // Check websocket availability
    if (!window.qz.websocket) {
      results.error = 'QZ_WEBSOCKET_UNAVAILABLE: QZ Tray websocket not available';
      return results;
    }

    results.websocketAvailable = true;

    // Check if already connected
    try {
      if (window.qz.websocket.isActive && window.qz.websocket.isActive()) {
        results.connected = true;
      }
    } catch (e) {
      // Not connected yet
    }

    // Try to get printers list
    if (results.connected) {
      try {
        const printerList = await window.qz.printers.find();
        results.printers = Array.isArray(printerList) ? printerList : [];
      } catch (e) {
        results.error = `PRINTERS_LIST_ERROR: ${e.message}`;
      }

      // Try to get default printer
      try {
        if (window.qz.printers.getDefault) {
          results.defaultPrinter = await window.qz.printers.getDefault();
        }
      } catch (e) {
        // No default printer or error
      }
    } else {
      results.error = 'QZ_NOT_CONNECTED: QZ Tray application is not running or not connected. Please start QZ Tray.';
    }

  } catch (e) {
    results.error = `DIAGNOSTIC_ERROR: ${e.message}`;
  }

  return results;
}

export function formatDiagnosticResults(results) {
  const lines = [];
  lines.push('=== QZ Tray Diagnostics ===');
  lines.push(`QZ Loaded: ${results.qzLoaded ? '✓' : '✗'}`);
  lines.push(`QZ Version: ${results.qzVersion || 'N/A'}`);
  lines.push(`Websocket Available: ${results.websocketAvailable ? '✓' : '✗'}`);
  lines.push(`Connected: ${results.connected ? '✓' : '✗'}`);
  lines.push(`Default Printer: ${results.defaultPrinter || 'None'}`);
  lines.push(`Available Printers (${results.printers.length}):`);
  
  if (results.printers.length > 0) {
    results.printers.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p}`);
    });
  } else {
    lines.push('  (No printers found or not connected)');
  }

  if (results.error) {
    lines.push(`\n⚠️ Error: ${results.error}`);
  }

  return lines.join('\n');
}
