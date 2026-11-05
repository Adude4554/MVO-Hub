import { test, expect } from '@playwright/test';

/**
 * Validates the *actual* media files, not just the DOM wiring.
 *
 * Two things matter:
 *  1. Browser can decode the container/codec the files claim to be.
 *  2. The declared MIME (`video/webm`) matches the real container — a
 *     mismatch is silently tolerated by Chromium (sniffing) but rejected by
 *     strict WebViews and by the OS media stack.
 */

const ASSETS = ['hero-bg.webm', 'startup.webm'] as const;

test.describe('media asset integrity', () => {
  for (const file of ASSETS) {
    test(`${file} decodes in the browser`, async ({ page }) => {
      await page.goto('/?page=dashboard');
      await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

      const result = await page.evaluate(async (name) => {
        const res = await fetch(`/assets/${name}`);
        if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
        const buf = await res.arrayBuffer();

        // Container sniffing
        const b = new Uint8Array(buf.slice(0, 16));
        const isEbml = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
        const isMp4 = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // 'ftyp'

        // Can the engine actually decode it?
        const v = document.createElement('video');
        v.muted = true;
        v.src = URL.createObjectURL(new Blob([buf], { type: isMp4 ? 'video/mp4' : 'video/webm' }));
        const decodable = await new Promise<boolean>((resolve) => {
          v.onloadeddata = () => resolve(v.videoWidth > 0);
          v.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 10000);
        });

        return {
          ok: decodable,
          bytes: buf.byteLength,
          container: isEbml ? 'webm' : isMp4 ? 'mp4' : 'unknown',
          declaredExt: name.split('.').pop(),
          width: v.videoWidth,
          height: v.videoHeight,
          duration: Math.round((v.duration || 0) * 100) / 100,
        };
      }, file);

      console.log(file, JSON.stringify(result));

      // Hard requirement: the file must actually decode.
      expect(result.ok, `${file} failed to decode`).toBe(true);
    });
  }

  test('declared container matches file extension', async ({ page }) => {
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

    const mismatches: string[] = [];
    for (const file of ASSETS) {
      const container = await page.evaluate(async (name) => {
        const res = await fetch(`/assets/${name}`);
        const b = new Uint8Array((await res.arrayBuffer()).slice(0, 16));
        const isEbml = b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
        const isMp4 = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
        return isEbml ? 'webm' : isMp4 ? 'mp4' : 'unknown';
      }, file);

      const ext = file.split('.').pop();
      if (container !== ext) mismatches.push(`${file}: extension ".${ext}" but container is "${container}"`);
    }

    expect(mismatches, `Container/extension mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  test('assets use a WebM-native codec (VP8/VP9/AV1)', async ({ page }) => {
    await page.goto('/?page=dashboard');
    await page.waitForFunction(() => Boolean(window.__MVO_TEST__));

    const report: Array<{ file: string; codec: string; ok: boolean }> = [];

    for (const file of ASSETS) {
      const info = await page.evaluate(async (name) => {
        const res = await fetch(`/assets/${name}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        const text = new TextDecoder('latin1').decode(buf);

        // WebM stores codec IDs in the `CodecID` element, e.g. "V_VP9".
        const match = text.match(/V_(VP8|VP9|AV1|THEORA)/);
        // MP4/H.264 indicators that must NOT appear in a real WebM.
        const hasAvc = text.includes('avcC') || text.includes('avc1');

        return {
          codec: match ? `V_${match[1]}` : hasAvc ? 'H.264 (avcC)' : 'unknown',
          hasAvc,
        };
      }, file);

      report.push({ file, codec: info.codec, ok: !info.hasAvc && info.codec.startsWith('V_') });
    }

    console.table(report.map((r) => ({ file: r.file, codec: r.codec, pass: r.ok })));

    const bad = report.filter((r) => !r.ok);
    expect(bad, `Non-WebM codecs found: ${bad.map((b) => `${b.file}=${b.codec}`).join(', ')}`).toEqual([]);
  });
});
