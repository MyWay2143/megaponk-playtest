(() => {
  const packs = JSON.parse(document.querySelector('#battle-catalog').textContent).packs;
  const panel = document.querySelector('#battle-loading');
  const meter = panel.querySelector('progress');
  const caption = panel.querySelector('output');
  const total = packs.reduce((n, p) => n + p.bytes, 0);
  let state = 0, url = '', loaded = 0;
  function progress(bytes) {
    meter.value = Math.min(99, Math.floor((loaded + bytes) * 100 / total));
    caption.value = meter.value + '%';
  }
  async function fetchPack(index, retry) {
    state = 0;
    const pack = packs[index];
    const controller = new AbortController();
    let timer;
    function armTimeout() {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), 45000);
    }
    try {
      await window.MegaPonkLoading.opened;
      armTimeout();
      const response = await fetch(pack.file, {
        cache: retry ? 'reload' : 'force-cache', signal: controller.signal
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const reader = response.body.getReader();
      const compressed = new Uint8Array(pack.bytes);
      let bytes = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        armTimeout();
        bytes += part.value.length;
        if (bytes > pack.bytes) throw Error('Invalid pack size');
        compressed.set(part.value, bytes - part.value.length);
        progress(bytes);
      }
      if (bytes !== pack.bytes) throw Error('Incomplete pack');
      const digest = await crypto.subtle.digest('SHA-256', compressed);
      if ('sha256-' + btoa(String.fromCharCode(...new Uint8Array(digest))) !== pack.integrity)
        throw Error('Pack checksum mismatch');
      if (typeof DecompressionStream === 'function') {
        const source = new Response(compressed).body;
        const raw = await new Response(source.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        url = URL.createObjectURL(new Blob([raw]));
        state = 1;
      } else {
        url = URL.createObjectURL(new Blob([compressed]));
        state = 2;
      }
    } catch (e) {
      controller.abort();
      console.warn('Battle pack', pack.file, e.message);
      state = -1;
    } finally { clearTimeout(timer); }
  }
  window.MegaPonkBattle = {
    packs, fetchPack, get state() { return state; }, get url() { return url; },
    release(index, accepted) {
      if (url) URL.revokeObjectURL(url);
      url = ''; state = 0;
      if (accepted) loaded += packs[index].bytes;
      progress(0);
    },
    waiting(show) { panel.hidden = !show; if (show) progress(0); }
  };
})();
