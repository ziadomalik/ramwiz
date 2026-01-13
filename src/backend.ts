// -----
// The vision for this trace visualizer is not limited to being a standalone desktop application, it should be integrated into Ramulator 2 for more advanced capabilities.
// I chose Tauri for the prototype because it allows for usage of frontend frameworks like Vue.js, which don't tie us to a specific backend.
// This file defines wrapper functions around the Tauri backend, such that whenever we want to migrate away from Tauri, we only need to change this file. (Hopefully...)
// -----
// Author: Ziad Malik <zmalik@ethz.ch>
// License: MIT
// -----

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// Opens a file dialog for selecting a trace file.
// @returns the path of the selected file or null if no file was selected.
export const openFileDialogForTraceFiles = async (): Promise<string | null> => {
  return await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Trace Files", extensions: ["*"] }],
  });
}

export interface TraceMetadata {
  total_events: number;
  time_range: [number, number];
  file_size: number;
};

// Tell the backend to load a trace file and return the metadata.
export const loadTrace = async (path: string): Promise<TraceMetadata> => {
  return invoke<TraceMetadata>("load_trace", { path });
}