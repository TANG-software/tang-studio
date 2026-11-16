/* POST /api/caption — transcribes an uploaded clip and returns timed segments.
 *
 * This function exists for one reason: to keep the transcription API key on the
 * server. The browser never sees it.
 *
 * Provider: Groq (whisper-large-v3-turbo). Fast, cheap, and accepts mp4/webm/
 * mp3 directly, so the client can post the original file without extracting
 * audio first. Swap the provider by editing callProvider() below.
 */

const MAX_BYTES = 24 * 1024 * 1024; // Groq's practical ceiling per request

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return json(500, { error: 'Transcription is not configured on the server.' });
  }

  // Netlify gives us base64 for binary bodies
  const isB64 = event.isBase64Encoded;
  const buf = Buffer.from(event.body || '', isB64 ? 'base64' : 'utf8');
  if (!buf.length) return json(400, { error: 'No audio was received.' });
  if (buf.length > MAX_BYTES) {
    return json(413, { error: 'That clip is too long for one request. Trim it below about 20 minutes.' });
  }

  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '');
  try {
    const form = await toFormData(buf, contentType);
    const result = await callProvider(key, form);
    return json(200, result);
  } catch (err) {
    console.error('[caption]', err && err.message);
    return json(502, { error: 'Transcription service could not process that clip.' });
  }
};

/* Pull the file part out of the incoming multipart body and rebuild it for the
   provider. Node 18+ has FormData/Blob globally, so no dependencies needed. */
async function toFormData(buf, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!boundaryMatch) throw new Error('Expected multipart form data');
  const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]).trim();

  const text = buf.toString('latin1');
  const parts = text.split(boundary).filter((p) => p.includes('name="file"'));
  if (!parts.length) throw new Error('No file part in request');

  const part = parts[0];
  const headerEnd = part.indexOf('\r\n\r\n');
  const head = part.slice(0, headerEnd);
  const mime = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || 'application/octet-stream';
  const name = (/filename="([^"]*)"/i.exec(head) || [])[1] || 'clip';

  const bodyStart = headerEnd + 4;
  const bodyEnd = part.lastIndexOf('\r\n');
  const raw = Buffer.from(part.slice(bodyStart, bodyEnd), 'latin1');

  const form = new FormData();
  form.append('file', new Blob([raw], { type: mime.trim() }), name);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  return form;
}

async function callProvider(key, form) {
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('provider ' + res.status + ' ' + t.slice(0, 200));
  }
  const data = await res.json();
  return {
    text: data.text || '',
    language: data.language || '',
    segments: (data.segments || []).map((s) => ({
      start: s.start, end: s.end, text: (s.text || '').trim(),
    })),
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
