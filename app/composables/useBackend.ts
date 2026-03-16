import type { FileInfo } from '@tauri-apps/plugin-fs';
import { stat } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export type FileMetadata = FileInfo & { name: string, path: string };

export interface Header {
  magic: number[];
  version: number;
  num_commands: number;
  num_entries: number;
  dict_offset: number;
  ncl: number;
  ncwl: number;
  num_channels: number;
  num_ranks: number;
  num_bankgroups: number;
  num_banks: number;
}

export interface Dictionary {
  commands: Record<number, string>;
  latencies: Record<number, number>;
}

export interface CommandConfig {
  colors: Record<number, string>;
  clockPeriods: Record<number, number | undefined>;
}

export interface MemoryLayout {
  numChannels: number;
  numRanks: number;
  numBankgroups: number;
  numBanks: number;
}

export async function openFileDialog(): Promise<FileMetadata | null> {
  const filePath = await open({
    filters: [{ name: 'Ramulator Trace Files', extensions: ['mtrc'] }],
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

async function startSession(path: string): Promise<Header> {
  return invoke<Header>('load_trace', { path });
}

async function getHeader(): Promise<Header | null> {
  return invoke<Header | null>('get_session_info');
}

async function getDictionary(): Promise<Dictionary> {
  return invoke<Dictionary>('load_dictionary');
}

async function closeSession(): Promise<void> {
  return invoke<void>('close_session');
}

async function getEntries(start: number, count: number, referenceTime: number): Promise<Uint8Array> {
  return invoke<Uint8Array>('get_trace_view', { start, count, referenceTime: Math.floor(referenceTime) });
}

async function getFirstEventTime(): Promise<number> {
  return invoke<number>('get_first_event_time');
}

async function getEntryIndexByTime(time: number): Promise<number> {
  return invoke<number>('get_entry_index_by_time', { time: Math.floor(time) });
}

async function getCommandColors(): Promise<Record<number, string> | null> {
  return invoke<Record<number, string> | null>('get_command_colors');
}

async function setCommandColors(colors: Record<number, string>): Promise<void> {
  return invoke<void>('set_command_colors', { colors });
}

export default function useBackend() {
  return {
    trace: {
      openFileDialog,
      startSession,
      closeSession,
      getHeader,
      getDictionary,
      getEntries,
      getFirstEventTime,
      getEntryIndexByTime,
      getCommandColors,
      setCommandColors,
    },
  };
}