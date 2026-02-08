import type { FileInfo } from '@tauri-apps/plugin-fs';
import { stat } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

//-------------//
// FILE DIALOG //
//-------------//

export type FileMetadata = FileInfo & { name: string, path: string };

export async function openFileDialog(): Promise<FileMetadata | null> {
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

// --------------------------- //
// Header & Dictionary Loading //
// --------------------------- //

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

// Loads a trace file, creating a session and returns the parsed header. 
async function startSession(path: string): Promise<Header> {
  return invoke<Header>('load_trace', { path });
}

// Gets the trace file header if a trace is currently loaded.
async function getHeader(): Promise<Header | null> {
  return invoke<Header | null>('get_session_info');
}

// Gets the dictionary from the currently loaded trace in the backend session.
async function getDictionary(): Promise<Dictionary> {
  return invoke<Dictionary>('load_dictionary');
}

// Closes the current session and frees the memory-mapped file.
async function closeSession(): Promise<void> {
  return invoke<void>('close_session');
}

//------------//
// TRACE VIEW //
//------------//

export interface CommandConfig {
  colors: Record<number, string>;
  clockPeriods: Record<number, number | undefined>;
}

// Get a number of trace entries starting at a specific CLK
async function getEntries(start: number, count: number): Promise<Uint8Array> {
  return invoke<Uint8Array>('get_trace_view', { start, count });
}

/// Given a CLK, get the index of the entry at that specific CLK
async function getEntryIndexByTime(time: number): Promise<number> {
  return invoke<number>('get_entry_index_by_time', { time: Math.floor(time) });
}

//-----------//
// USER DATA //
//-----------//

export interface CommandConfig {
  colors: Record<number, string>;
  clockPeriods: Record<number, number | undefined>;
}

export interface MemoryLayout {
  numChannels: number;
  numBankgroups: number;
  numBanks: number;
}

async function getCommandConfig(): Promise<CommandConfig | null> {
  return invoke<CommandConfig | null>('get_command_config');
}

async function setCommandConfig(config: CommandConfig): Promise<void> {
  return invoke<void>('set_command_config', { config });
}

async function getMemoryLayout(): Promise<MemoryLayout | null> {
  return invoke<MemoryLayout | null>('get_memory_layout');
}

async function setMemoryLayout(layout: MemoryLayout): Promise<void> {
  return invoke<void>('set_memory_layout', { layout });
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
      getEntryIndexByTime
    },
    store: {
      getCommandConfig,
      setCommandConfig,
      getMemoryLayout,
      setMemoryLayout,
    },
  } 
}