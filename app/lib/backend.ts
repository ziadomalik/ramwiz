import type { FileInfo } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';

import { invoke } from '@tauri-apps/api/core';

export interface Header {
  magic: number[];
  version: number;
  num_commands: number;
  num_entries: number;
  dict_offset: number;
}

export interface Dictionary {
  commands: Record<number, string>;
}

// Loads a trace file and stores it in the backend session. 
export async function loadTraceHandler(path: string): Promise<Header> {
  return invoke<Header>('load_trace', { path });
}

// Loads the dictionary from the currently loaded trace in the backend session.
export async function loadDictionaryHandler(): Promise<Dictionary> {
  return invoke<Dictionary>('load_dictionary');
}

// Closes the current session and frees the memory-mapped file.
export async function closeSessionHandler(): Promise<void> {
  return invoke<void>('close_session');
}

// Gets the trace file header if a trace is currently loaded.
export async function getSessionInfoHandler(): Promise<Header | null> {
  return invoke<Header | null>('get_session_info');
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