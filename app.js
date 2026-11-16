/* TANG Studio — editor logic.
   Everything here runs in the browser. The only server call is /api/caption,
   which exists purely to keep the transcription API key off the client. */

'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  media: [],          // {id, name, kind, url, file, duration, thumb}
  active: null,       // selected media object
  clips: [],          // [{id, mediaId, start, end}] on the single video track
  captions: [],       // [{start, end, text}]
  playing: false,
  pixelsPerSecond: 40,
};

/* ---------------------------------------------------------------- helpers */
const fmt = (t) => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
};
const srtTime = (t) => {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------------------------------------------------------------- import */
$('#importZone').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach(addMedia);
  e.target.value = '';
});

['dragover', 'dragenter'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  Array.from(e.dataTransfer.files || []).forEach(addMedia);
});

function addMedia(file) {
  const kind = file.type.startsWith('video') ? 'video'
    : file.type.startsWith('audio') ? 'audio'
    : file.type.startsWith('image') ? 'image' : null;
  if (!kind) { toast('That file type is not supported.'); return; }

  const url = URL.createObjectURL(file);
  const item = { id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6), name: file.name, kind, url, file, duration: 0, thumb: '' };

  const finish = () => {
    state.media.push(item);
    renderMedia();
    selectMedia(item.id);
    if (state.clips.length === 0 && item.duration) addClipFromMedia(item);
  };

  if (kind === 'image') { item.duration = 5; finish(); return; }

  const probe = document.createElement('video');
  probe.preload = 'metadata';
  probe.src = url;
  probe.onloadedmetadata = () => {
    item.duration = probe.duration || 0;
    // grab a thumbnail
    try {
      probe.currentTime = Math.min(0.5, (item.duration || 1) / 2);
      probe.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = 160; c.height = 90;
        c.getContext('2d').drawImage(probe, 0, 0, c.width, c.height);
        item.thumb = c.toDataURL('image/jpeg', 0.7);
        finish();
      };
    } catch (err) { finish(); }
  };
  probe.onerror = finish;
}

function renderMedia() {
  const list = $('#mediaList');
  list.innerHTML = '';
  state.media.forEach((m) => {
    const el = document.createElement('div');
    el.className = 'media-item' + (state.active && state.active.id === m.id ? ' active' : '');
    el.innerHTML = `
      ${m.thumb ? `<img class="thumb" src="${m.thumb}" alt="">` : `<div class="thumb"></div>`}
      <div class="media-meta"><b>${escapeHtml(m.name)}</b><span>${m.kind} · ${fmt(m.duration)}</span></div>`;
    el.addEventListener('click', () => selectMedia(m.id));
    list.appendChild(el);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectMedia(id) {
  const m = state.media.find((x) => x.id === id);
  if (!m) return;
  state.active = m;
  renderMedia();

  const video = $('#video');
  const img = $('#previewImg');
  $('#emptyHint').hidden = true;

  if (m.kind === 'image') {
    video.hidden = true; img.hidden = false; img.src = m.url;
    $('#timecode').textContent = `00:00.0 / ${fmt(m.duration)}`;
  } else {
    img.hidden = true; video.hidden = false;
    video.src = m.url;
    video.load();
  }
  renderTimeline();
  updateCaptionOverlay();
}

/* ---------------------------------------------------------------- clips */
function addClipFromMedia(m) {
  state.clips = [{ id: 'c' + Date.now(), mediaId: m.id, start: 0, end: m.duration || 0 }];
  renderTimeline();
}

function activeClip() {
  return state.clips[0] || null;
}

function renderTimeline() {
  const clip = activeClip();
  const el = $('#clip');
  const hint = $('#tlHint');
  if (!clip) {
    el.hidden = true;
    hint.textContent = 'No clip on the timeline';
    return;
  }
  const m = state.media.find((x) => x.id === clip.mediaId);
  const total = (m && m.duration) || 1;
  const left = clip.start * state.pixelsPerSecond;
  const width = Math.max(24, (clip.end - clip.start) * state.pixelsPerSecond);
  el.hidden = false;
  el.style.left = left + 'px';
  el.style.width = width + 'px';
  $('#clipLabel').textContent = m ? m.name : 'clip';
  hint.textContent = `${fmt(clip.end - clip.start)} selected of ${fmt(total)}`;
  renderRuler(total);
}

function renderRuler(total) {
  const r = $('#ruler');
  r.innerHTML = '';
  r.style.width = Math.max(300, (total || 10) * state.pixelsPerSecond) + 'px';
  const step = total > 120 ? 30 : total > 60 ? 15 : 5;
  for (let t = 0; t <= (total || 10); t += step) {
    const i = document.createElement('i');
    i.style.left = t * state.pixelsPerSecond + 'px';
    i.textContent = fmt(t).slice(0, 5);
    r.appendChild(i);
  }
}

/* trim handles */
let dragging = null;
['handleL', 'handleR'].forEach((id) => {
  const h = $('#' + id);
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const clip = activeClip();
    if (!clip) return;
    dragging = { side: id === 'handleL' ? 'l' : 'r', x: e.clientX, start: clip.start, end: clip.end };
    h.setPointerCapture(e.pointerId);
  });
});
document.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const clip = activeClip();
  if (!clip) return;
  const delta = (e.clientX - dragging.x) / state.pixelsPerSecond;
  const m = state.media.find((x) => x.id === clip.mediaId);
  const total = (m && m.duration) || 0;
  if (dragging.side === 'l') {
    clip.start = Math.max(0, Math.min(dragging.end - 0.3, dragging.start + delta));
  } else {
    clip.end = Math.max(dragging.start + 0.3, Math.min(total, dragging.end + delta));
  }
  renderTimeline();
});
document.addEventListener('pointerup', () => { dragging = null; });

$('#splitBtn').addEventListener('click', () => {
  const clip = activeClip();
  if (!clip) { toast('Nothing on the timeline to split.'); return; }
  const t = $('#video').currentTime || 0;
  if (t <= clip.start + 0.2 || t >= clip.end - 0.2) { toast('Move the playhead inside the clip first.'); return; }
  const second = { ...clip, id: 'c' + Date.now(), start: t };
  clip.end = t;
  state.clips.push(second);
  toast('Split. This MVP edits one clip at a time — multi-clip is next.');
  renderTimeline();
});

$('#deleteClipBtn').addEventListener('click', () => {
  state.clips = [];
  renderTimeline();
  $('#video').pause();
  toast('Clip removed from the timeline.');
});

/* ---------------------------------------------------------------- playback */
$('#playBtn').addEventListener('click', () => {
  const v = $('#video');
  if (v.hidden) return;
  if (v.paused) { v.play(); } else { v.pause(); }
});

$('#video').addEventListener('play', () => { state.playing = true; $('#playBtn').textContent = '❚❚'; });
$('#video').addEventListener('pause', () => { state.playing = false; $('#playBtn').textContent = '▶'; });

$('#video').addEventListener('timeupdate', () => {
  const v = $('#video');
  const clip = activeClip();
  const m = state.active;
  const total = (m && m.duration) || v.duration || 0;

  // clamp playback to the trimmed range
  if (clip && v.currentTime >= clip.end) { v.pause(); v.currentTime = clip.start; }
  if (clip && v.currentTime < clip.start) v.currentTime = clip.start;

  $('#timecode').textContent = `${fmt(v.currentTime)} / ${fmt(total)}`;
  $('#playhead').style.left = (v.currentTime * state.pixelsPerSecond) + 'px';
  updateCaptionOverlay();
});

function updateCaptionOverlay() {
  const v = $('#video');
  const t = v.hidden ? 0 : (v.currentTime || 0);
  const active = state.captions.find((c) => t >= c.start && t < c.end);
  const box = $('#capOverlay');
  if (active) {
    box.hidden = false;
    box.querySelector('span').textContent = active.text;
  } else {
    box.hidden = true;
  }
  // highlight the matching row
  $$('.cap-row').forEach((row, i) => {
    row.classList.toggle('active', !!(active && state.captions[i] === active));
  });
}

/* ---------------------------------------------------------------- captions */
$('#autoCaptionBtn').addEventListener('click', async () => {
  const m = state.active;
  if (!m) { toast('Import and select a clip first.'); return; }
  if (m.kind === 'image') { toast('Auto Caption needs video or audio.'); return; }

  const btn = $('#autoCaptionBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Transcribing…';
  $('#capHint').textContent = 'Working through the audio. Longer clips take a little longer.';

  try {
    const fd = new FormData();
    fd.append('file', m.file);
    fd.append('language', 'auto');

    const res = await fetch('/api/caption', { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || ('Transcription failed (' + res.status + ')'));
    }
    const data = await res.json();
    const segments = (data.segments || []).map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || '').trim(),
    })).filter((s) => s.text);

    if (!segments.length) throw new Error('No speech found in that clip.');
    state.captions = segments;
    renderCaptions();
    $('#capHint').textContent = `${segments.length} lines captured. Click any line to fix a word.`;
    toast('Captions ready — check the wording before exporting.');
  } catch (err) {
    $('#capHint').textContent = 'Auto Caption did not finish.';
    toast(err.message || 'Auto Caption failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Auto Caption';
  }
});

$('#clearCapsBtn').addEventListener('click', () => {
  state.captions = [];
  renderCaptions();
  updateCaptionOverlay();
  $('#capHint').textContent = 'Captions cleared.';
});

function renderCaptions() {
  const list = $('#capList');
  list.innerHTML = '';
  state.captions.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cap-row';
    row.innerHTML = `
      <div class="cap-time"><span>${fmt(c.start)} → ${fmt(c.end)}</span><span>#${i + 1}</span></div>
      <textarea class="cap-text" rows="2" spellcheck="true"></textarea>`;
    const ta = row.querySelector('textarea');
    ta.value = c.text;
    ta.addEventListener('input', () => { state.captions[i].text = ta.value; updateCaptionOverlay(); });
    ta.addEventListener('focus', () => {
      const v = $('#video');
      if (!v.hidden && isFinite(c.start)) v.currentTime = c.start;
      updateCaptionOverlay();
    });
    list.appendChild(row);
  });
}

/* ---------------------------------------------------------------- export */
$('#exportBtn').addEventListener('click', () => {
  if (!state.captions.length) { toast('There are no captions to export yet.'); return; }
  const srt = state.captions.map((c, i) =>
    `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (($('#projName').value || 'captions').replace(/[^\w\-]+/g, '-')) + '.srt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Captions exported as .srt');
});

$('#exportVideoBtn').addEventListener('click', () => {
  toast('Video export with burned-in captions is the next build step — see the roadmap in README.', 4200);
});

/* ---------------------------------------------------------------- misc */
$('#projName').addEventListener('change', () => {
  try { localStorage.setItem('tang_studio_project', $('#projName').value); } catch (e) {}
});
try {
  const saved = localStorage.getItem('tang_studio_project');
  if (saved) $('#projName').value = saved;
} catch (e) {}

window.addEventListener('beforeunload', (e) => {
  if (state.media.length) { e.preventDefault(); e.returnValue = ''; }
});

renderTimeline();
renderRuler(10);
