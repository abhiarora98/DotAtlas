// Ports of the formatters used by the dashboard (public/index.html lines
// 3537, 3538, 3584) so WhatsApp replies match what the user sees on the web.

function inr(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e7) return (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + ' K';
  return String(n);
}

function daysSince(s) {
  if (!s) return null;
  const str = String(s).trim();
  let d;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
    d = new Date(str);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) {
    const [dd, mm, yyyy] = str.split('/');
    d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } else {
    d = new Date(str);
  }
  if (!d || isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

module.exports = { inr, compact, daysSince };
