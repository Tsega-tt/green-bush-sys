#!/usr/bin/env node

/**
 * Local Print Agent for Cashier's PC
 * 
 * This script runs on the cashier's Windows computer and:
 * 1. Polls the deployed server for unprinted orders every 5 seconds
 * 2. Downloads raw ESC/POS binary data (with logo, Amharic bitmap, paper cuts)
 * 3. Sends it directly to the thermal printer via USB port
 * 4. Marks the order as printed on the server
 * 
 * Usage:
 *   node print-agent.js
 * 
 * Configuration:
 *   Set SERVER_URL below to your deployed server URL
 *   Set PRINTER_PORT to your printer's USB port (default: USB001)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ============================================================
// CONFIGURATION - Change these to match your setup
// ============================================================
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const PRINTER_PORT = process.env.PRINTER_PORT || 'USB001';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000', 10);
// ============================================================

const printing = new Set();

function log(msg) {
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

function fetchJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = SERVER_URL + urlPath;
    const lib = fullUrl.startsWith('https') ? https : http;
    lib.get(fullUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + data.slice(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

function fetchBinary(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = SERVER_URL + urlPath;
    const lib = fullUrl.startsWith('https') ? https : http;
    lib.get(fullUrl, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function postJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = SERVER_URL + urlPath;
    const url = new URL(fullUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end('{}');
  });
}

function sendToUSBPrinter(binaryBuffer) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `receipt_${Date.now()}_${Math.random().toString(16).slice(2)}.bin`
    );

    fs.writeFile(tmpFile, binaryBuffer, (err) => {
      if (err) return reject(err);

      const portTarget = PRINTER_PORT.endsWith(':') ? PRINTER_PORT : `${PRINTER_PORT}:`;
      const isDosCopyPort = /^(usb\d+|lpt\d+|com\d+):$/i.test(portTarget);

      if (isDosCopyPort) {
        // Direct copy to port (USB001, LPT1, COM1, etc.)
        const cmd = `copy /b "${tmpFile}" ${portTarget}`;
        execFile('cmd.exe', ['/c', cmd], { windowsHide: true }, (err, stdout, stderr) => {
          fs.unlink(tmpFile, () => {});
          if (err) {
            reject(new Error(`copy /b failed: ${err.message} ${stderr || ''}`));
          } else {
            resolve();
          }
        });
      } else {
        // Try using printer name via PowerShell RAW spooler
        const safePrinter = PRINTER_PORT.replace(/'/g, "''");
        const safeFile = tmpFile.replace(/'/g, "''");
        const psCmd = `
$printer = '${safePrinter}'
$file = '${safeFile}'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "ESC_POS_RAW";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) return false;
      try {
        if (!StartPagePrinter(hPrinter)) return false;
        try {
          int dwWritten = 0;
          IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
          bool ok = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
          Marshal.FreeCoTaskMem(pUnmanagedBytes);
          return ok && (dwWritten == bytes.Length);
        } finally { EndPagePrinter(hPrinter); }
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
  }
}
"@ -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($file)
$ok = [RawPrinterHelper]::SendBytes($printer, $bytes)
if (-not $ok) { throw 'RAW_PRINT_FAILED' }
`;
        execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], { windowsHide: true }, (err, stdout, stderr) => {
          fs.unlink(tmpFile, () => {});
          if (err) {
            reject(new Error(`RAW spooler failed: ${err.message} ${stderr || ''}`));
          } else {
            resolve();
          }
        });
      }
    });
  });
}

async function pollAndPrint() {
  try {
    const resp = await fetchJSON('/api/orders/unprinted');
    const orders = resp?.data?.orders ?? resp?.orders ?? [];

    for (const order of orders) {
      if (printing.has(order.id)) continue;
      printing.add(order.id);

      try {
        // Fetch raw ESC/POS binary from server
        log(`📥 Fetching ESC/POS data for Order #${order.id}...`);
        const escposData = await fetchBinary(`/api/orders/${order.id}/receipt-escpos`);

        if (!escposData || escposData.length === 0) {
          log(`⚠️  Empty ESC/POS data for Order #${order.id}, skipping`);
          printing.delete(order.id);
          continue;
        }

        // Send to thermal printer
        log(`🖨️  Printing Order #${order.id} (${escposData.length} bytes) to ${PRINTER_PORT}...`);
        await sendToUSBPrinter(escposData);
        log(`✅ Order #${order.id} printed successfully!`);

        // Mark as printed on server
        await postJSON(`/api/orders/${order.id}/print`);
        log(`✅ Order #${order.id} marked as printed on server`);

      } catch (err) {
        log(`❌ Failed to print Order #${order.id}: ${err.message}`);
        printing.delete(order.id);
      }
    }
  } catch (err) {
    // Silently retry on connection errors
    if (err.message && !err.message.includes('ECONNREFUSED')) {
      log(`⚠️  Poll error: ${err.message}`);
    }
  }
}

// ============================================================
// START
// ============================================================
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║       🖨️  CASHIER PRINT AGENT               ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║  Server:  ${SERVER_URL.padEnd(34)}║`);
console.log(`║  Printer: ${PRINTER_PORT.padEnd(34)}║`);
console.log(`║  Poll:    Every ${(POLL_INTERVAL / 1000)}s${' '.repeat(28 - String(POLL_INTERVAL / 1000).length)}║`);
console.log('╠══════════════════════════════════════════════╣');
console.log('║  Waiting for new orders...                   ║');
console.log('║  Press Ctrl+C to stop                        ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

// Initial poll
pollAndPrint();

// Start polling interval
const interval = setInterval(pollAndPrint, POLL_INTERVAL);

process.on('SIGINT', () => {
  console.log('\n🛑 Print agent stopped.');
  clearInterval(interval);
  process.exit(0);
});
