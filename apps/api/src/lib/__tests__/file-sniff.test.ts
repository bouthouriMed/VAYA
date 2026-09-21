import { describe, it, expect } from 'vitest';
import { isRecognisedUploadContent, sniffFileFormat } from '../storage/file-sniff.js';

// VAYA-SEC-010: relayed uploads are validated on their real bytes, not on the
// client-declared MIME type / extension.
describe('sniffFileFormat', () => {
  it('recognises the accepted formats by magic bytes', () => {
    expect(sniffFileFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('jpeg');
    expect(sniffFileFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffFileFormat(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')]))).toBe('webp');
    expect(sniffFileFormat(Buffer.from('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffFileFormat(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]))).toBe('heic');
  });

  it('rejects HTML, SVG and script content even when named like an image', () => {
    for (const payload of [
      '<!doctype html><script>alert(1)</script>',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      '<?xml version="1.0"?><svg/>',
      'GIF89a<script>',
      '#!/bin/sh\nrm -rf /',
      '',
    ]) {
      expect(isRecognisedUploadContent(Buffer.from(payload)), payload).toBe(false);
    }
  });

  it('rejects RIFF containers that are not WEBP, and non-HEIC ISO-BMFF', () => {
    expect(sniffFileFormat(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WAVEfmt ')]))).toBeNull();
    expect(sniffFileFormat(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8)]))).toBeNull();
  });

  it('does not throw on tiny buffers', () => {
    expect(sniffFileFormat(Buffer.alloc(0))).toBeNull();
    expect(sniffFileFormat(Buffer.from([0xff]))).toBeNull();
  });
});
