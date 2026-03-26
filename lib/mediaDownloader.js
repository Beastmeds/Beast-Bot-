// Replacement wrappers for removed @neelegirl/downloader
// Uses rahad-all-downloader (multi-platform) and api-dylux (YouTube audio)

const { alldl } = require('rahad-all-downloader');
const fg = require('api-dylux');

// Helper to extract a usable media url from mixed response shapes
function pickUrl(data) {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (data.videoUrl) return data.videoUrl;
  if (data.url) return data.url;
  if (data.download_url) return data.download_url;
  if (data.hd) return data.hd;
  if (data.sd) return data.sd;
  return null;
}

async function ytdl(url) {
  const res = await alldl(url);
  const videoUrl = pickUrl(res?.data) || (Array.isArray(res?.data) ? pickUrl(res.data[0]) : null);
  return { videoUrl, title: res?.data?.title || url };
}

async function ytdown(url) {
  // Prefer api-dylux for dedicated audio endpoint; fall back to alldl
  try {
    const audio = await fg.ytmp3(url);
    const audioUrl = audio?.result || audio?.audio || audio?.dl_link || audio?.download || audio?.link;
    if (audioUrl) return { data: { audio: audioUrl } };
  } catch (_) {
    // ignore and fall back
  }
  const res = await alldl(url);
  const audioUrl = res?.data?.audio || res?.data?.mp3 || pickUrl(res?.data);
  return { data: { audio: audioUrl } };
}

async function ttdl(url) {
  const res = await alldl(url);
  const link = pickUrl(res?.data) || (Array.isArray(res?.data) ? pickUrl(res.data[0]) : null);
  return { video1: link };
}

async function igdl(url) {
  const res = await alldl(url);
  if (Array.isArray(res?.data)) {
    return res.data.map(item => ({ url: pickUrl(item) })).filter(x => x.url);
  }
  const single = pickUrl(res?.data);
  return single ? [{ url: single }] : [];
}

async function instagram(url) {
  return igdl(url);
}

async function fbdl(url) {
  const res = await alldl(url);
  const hd = res?.data?.hd || pickUrl(res?.data) || (Array.isArray(res?.data) ? pickUrl(res.data[0]) : null);
  return { hd };
}

async function twdl(url) {
  const res = await alldl(url);
  const link = pickUrl(res?.data) || (Array.isArray(res?.data) ? pickUrl(res.data[0]) : null);
  return { HD: link, SD: link };
}

module.exports = { ytdl, ytdown, ttdl, igdl, instagram, fbdl, twdl };
