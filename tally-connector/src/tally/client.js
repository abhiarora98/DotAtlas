/**
 * Thin HTTP client for TallyPrime's local XML server. Tally speaks plain
 * HTTP (not HTTPS) on localhost, so we use Node's http module directly and
 * keep the dependency surface minimal.
 */

const http = require('http');
const { XMLParser } = require('fast-xml-parser');
const requests = require('./requests');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false, // keep everything as strings; we coerce in parse.js
  trimValues: true,
});

// POST a raw XML envelope to Tally and return the parsed JS object.
function postXml(host, port, xml, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(xml, 'utf-8');
    const req = http.request(
      {
        host,
        port,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'text/xml; charset=utf-16',
          'Content-Length': body.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Tally returned HTTP ${res.statusCode}`));
          }
          if (/<LINEERROR>/i.test(data)) {
            const m = data.match(/<LINEERROR>(.*?)<\/LINEERROR>/i);
            return reject(new Error('Tally TDL error: ' + (m ? m[1] : 'unknown')));
          }
          try {
            resolve({ raw: data, json: parser.parse(data) });
          } catch (e) {
            reject(new Error('Could not parse Tally XML: ' + e.message));
          }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('Tally connection timed out')));
    req.on('error', (err) => {
      // ECONNREFUSED is the classic "Tally not running / HTTP not enabled".
      if (err.code === 'ECONNREFUSED') {
        return reject(new Error(
          `Could not reach Tally at ${host}:${port}. Is TallyPrime running with HTTP enabled on that port?`
        ));
      }
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

// Returns the list of company names currently open in Tally.
// Company name is exported as the NAME attribute (@_NAME) or a child tag.
async function listCompanies(host, port) {
  const { json } = await postXml(host, port, requests.companies());
  const coll = json?.ENVELOPE?.BODY?.DATA?.COLLECTION;
  let comps = coll?.COMPANY || [];
  if (!Array.isArray(comps)) comps = comps ? [comps] : [];
  return comps
    .map((c) => {
      if (typeof c === 'string') return c;
      const n = c['@_NAME'] !== undefined ? c['@_NAME'] : c.NAME;
      return typeof n === 'object' && n ? n['#text'] : n;
    })
    .filter(Boolean);
}

module.exports = { postXml, listCompanies };
