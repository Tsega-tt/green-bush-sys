/**
 * Browser-based receipt printing for thermal printers.
 * Fetches server-rendered PNG ticket images (with Amharic support via sharp + Nyala)
 * and prints them using the browser's print system on the cashier's local printer.
 */
import api from '../services/api';

/**
 * Fetch receipt images from the server and print them via browser.
 * The server renders each department ticket as a PNG image using sharp + Nyala font,
 * producing output identical to the local ESC/POS thermal printer.
 *
 * @param {Object} order - The order object (must have .id)
 * @returns {Promise<void>}
 */
export async function printOrderReceipt(order) {
  if (!order || !order.id) return;

  try {
    // Fetch server-rendered receipt images
    const resp = await api.orders.getReceiptImages(order.id);
    const images = resp?.data?.data?.images ?? [];
    const logo = resp?.data?.data?.logo ?? null;

    if (images.length === 0) {
      console.warn('No receipt images returned for order', order.id);
      return;
    }

    // Build print HTML with each ticket as a separate page
    const ticketPages = images.map((imgSrc, idx) => {
      const logoHtml = logo
        ? `<div style="text-align:center;margin-bottom:4px;"><img src="${logo}" style="max-width:300px;height:auto;" /></div>`
        : '';
      const pageBreak = idx < images.length - 1 ? 'page-break-after:always;' : '';
      return `<div style="width:80mm;padding:0;margin:0;${pageBreak}">
        ${logoHtml}
        <img src="${imgSrc}" style="width:100%;height:auto;display:block;" />
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Order #${order.id}</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  img {
    image-rendering: auto;
  }
  @media print {
    body { width: 80mm; }
  }
</style>
</head>
<body>${ticketPages}</body>
</html>`;

    await printHTML(html);
  } catch (e) {
    console.error('printOrderReceipt error:', e);
  }
}

/**
 * Print HTML content using a hidden iframe.
 */
function printHTML(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '80mm';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Browser print error:', e);
      }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (e) { /* already removed */ }
        resolve();
      }, 2000);
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for images to load then print
    iframe.contentWindow.onload = () => {
      // Extra delay for image rendering
      setTimeout(doPrint, 300);
    };

    // Fallback if onload doesn't fire within 3s
    setTimeout(doPrint, 3000);
  });
}

export default printOrderReceipt;
