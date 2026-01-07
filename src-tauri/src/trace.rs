// -----
// This module is responsible for parsing & processing a trace file. It handles:
// - parsing the CSV trace file, memory map it and read it into a struct.
// - transforming the trace into a flat array for communication with the frontend.
// A trace file follows the following CSV format:
// <clk>, <command>, <channel>, <rank>, <bankgroup>, <bank>, <row>, <column>
// -----
// Author: Ziad Malik <zmalik@ethz.ch>
// License: MIT
// -----

use std::fs::File;
use std::path::PathBuf;

use memchr::memchr_iter;
use memmap2::Mmap;

#[derive(Debug, Clone, serde::Serialize)]
pub struct TraceMetadata {
    pub time_range: (u64, u64), // (min_clk, max_clk)
    pub total_events: u64,
    pub file_size: u64,
}

pub struct TraceLoader {
    /// Path to the CSV file
    path: PathBuf,
    /// Memory mapped file handle
    mmap: Option<Mmap>,
    /// Byte offset index for fast seeking (every N events)
    /// index[i] = byte offset of event i * INDEX_STRIDE
    line_index: Vec<u64>,
    /// Cached metadata
    metadata: Option<TraceMetadata>,
}

/// We index every 10k lines for more memory efficient seeking.
const INDEX_STRIDE: u64 = 10_000;

impl TraceLoader {
    pub fn new() -> Self {
        Self {
            path: PathBuf::new(),
            mmap: None,
            line_index: Vec::new(),
            metadata: None,
        }
    }

    pub fn open(&mut self, path: String) -> Result<TraceMetadata, std::io::Error> {
        let file_path = PathBuf::from(path);

        let file = File::open(&file_path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        let file_size = mmap.len() as u64;

        let mut index = vec![0u64];
        let mut line_count = 0u64;

        for pos in memchr_iter(b'\n', &mmap) {
            line_count += 1;
            if line_count.is_multiple_of(INDEX_STRIDE) {
                index.push((pos + 1) as u64);
            }
        }

        self.path = file_path;
        self.mmap = Some(mmap);
        self.line_index = index;

        let meta = TraceMetadata {
            total_events: line_count.saturating_sub(1), // -1 for header row
            time_range: (0, 0), // TODO: Scan first and last line to get the range.
            file_size,
        };

        self.metadata = Some(meta.clone());
        Ok(meta)
    }
}
