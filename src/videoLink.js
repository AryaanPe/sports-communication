// Turns a pasted link into addresses a video element can try.
// Each candidate is { url, cors }. cors true asks the server to allow reading the picture
// (needed for the clock and score reading), and false only plays it.

const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'];

export function parseVideoLink(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'Paste a link first.' };

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (e) {
    return { ok: false, error: "That doesn't look like a link." };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'The link has to start with http or https.' };
  }

  const host = url.hostname.toLowerCase();

  // browsers are lenient about what they call an address, so check the host looks like a real one
  const looksReal = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host === 'localhost' || /^\[[0-9a-f:]+\]$/.test(host);
  if (!looksReal) return { ok: false, error: "That doesn't look like a link." };

  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
    return { ok: false, error: "YouTube links can't be used here. Download the video and upload it, or use a Google Drive link." };
  }

  if (DRIVE_HOSTS.includes(host)) {
    if (/\/folders\/|\/folderview|\/drive\/(u\/\d+\/)?(my-drive|shared-with-me|recent|starred)/.test(url.pathname)) {
      return { ok: false, error: 'That is a folder link. Open the video in Drive, click Share, and paste that link instead.' };
    }
    const fromPath = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
    const fromQuery = url.searchParams.get('id');
    const id = fromPath ? fromPath[1] : fromQuery && /^[\w-]{10,}$/.test(fromQuery) ? fromQuery : '';
    if (!id) return { ok: false, error: "Couldn't find a file in that Google Drive link." };

    const resourceKey = url.searchParams.get('resourcekey');
    const rk = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : '';
    const direct = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t${rk}`;
    const older = `https://drive.google.com/uc?export=download&id=${id}&confirm=t${rk}`;
    return {
      ok: true,
      kind: 'drive',
      key: `drive:${id}`,
      name: `drive-${id.slice(0, 8)}`,
      candidates: [
        { url: direct, cors: true },
        { url: direct, cors: false },
        { url: older, cors: true },
        { url: older, cors: false },
      ],
    };
  }

  // any other address is used as it is
  url.hash = '';
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
  const name = (last.replace(/\.[^/.]+$/, '') || host).replace(/[^\w.-]+/g, '-');
  return {
    ok: true,
    kind: 'url',
    key: `url:${url.href}`,
    name,
    candidates: [
      { url: url.href, cors: true },
      { url: url.href, cors: false },
    ],
  };
}
