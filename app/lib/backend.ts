import type { FileInfo } from '@tauri-apps/plugin-fs';

import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';

export async function loadTraceHandler(filePath: string) {
  throw new Error('Not implemented');
}

export async function loadDictionaryHandler() {
  throw new Error('Not implemented');
}

export type FileMetadata = FileInfo & { name: string, path: string };
export async function loadTraceDialog(): Promise<FileMetadata | null> {
  const filePath = await open({
    filters: [
      { name: 'Ramulator Trace Files', extensions: ['mtrc'] },
    ],
    multiple: false,
    directory: false,
  });

  if (!filePath) {
    return null;
  }

  const path = filePath;
  const name = filePath.replace(/\\/g, '/').split('/').pop() ?? '';

  return { ...(await stat(filePath)), name, path };
}