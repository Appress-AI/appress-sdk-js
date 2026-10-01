import { openAsBlob } from 'node:fs';
import { basename } from 'node:path';
import type { FileInput } from '../types.js';

/** `FileInput`'u multipart'a eklenecek `Blob` + dosya adına çevirir. */
export async function toUploadable(input: FileInput): Promise<{ blob: Blob; fileName: string }> {
  if (typeof input === 'string') {
    // Dosya belleğe okunmaz; Blob diskten talep edildikçe akıtılır.
    const blob = await openAsBlob(input, { type: contentTypeFor(input) });
    return { blob, fileName: basename(input) };
  }
  if (input instanceof Blob) {
    const name = (input as { name?: unknown }).name;
    if (typeof name !== 'string' || !name) {
      throw new TypeError('Blob girdisinin adı yok; { data, fileName } biçimini kullan');
    }
    return { blob: input, fileName: name };
  }
  const { data, fileName, contentType } = input;
  const type = contentType ?? contentTypeFor(fileName);
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  return { blob, fileName };
}

const CONTENT_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
};

function contentTypeFor(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
