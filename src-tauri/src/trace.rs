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

use crate::csv::CSVLine;

#[derive(Debug, Clone, serde::Serialize)]
pub struct TraceMetadata {
    // (min_clk, max_clk)
    pub clk_range: (u64, u64),
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
            total_events: line_count,
            clk_range: self.get_clk_range().unwrap_or((0, 0)),
            file_size,
        };

        self.metadata = Some(meta.clone());
        Ok(meta)
    }

    /// Get the byte slice for a line starting at 'start' offset.
    /// Returns bytes up to (but not including) the newline.
    fn get_line_bytes(&self, start: usize) -> Option<&[u8]> {
        let mmap = self.mmap.as_ref()?;
        if start >= mmap.len() {
            return None;
        }
        let remaining = &mmap[start..];
        let end = remaining
            .iter()
            .position(|&b| b == b'\n')
            .unwrap_or(remaining.len());
        Some(&remaining[..end])
    }

    /// Get a CSVLine view starting at byte offset.
    fn get_line_at(&self, start: usize) -> Option<CSVLine<'_>> {
        self.get_line_bytes(start).map(CSVLine::new)
    }

    fn find_last_line_start(&self) -> Option<usize> {
        let mmap = self.mmap.as_ref()?;
        if mmap.is_empty() {
            return None;
        }

        let mut pos = mmap.len() - 1;

        // Skip trailing newline
        if mmap[pos] == b'\n' {
            pos = pos.saturating_sub(1);
        }

        // Scan backwards to previous newline
        while pos > 0 && mmap[pos] != b'\n' {
            pos -= 1;
        }

        Some(if mmap[pos] == b'\n' { pos + 1 } else { 0 })
    }

    fn get_clk_range(&self) -> Option<(u64, u64)> {
        let last_line_start = self.find_last_line_start()?;
        let last_line = self.get_line_at(last_line_start)?;
        let last_clk = last_line.get_field::<u64>(0)?;

        let first_line_start = self.line_index[0] as usize;
        let first_line = self.get_line_at(first_line_start)?;
        let first_clk = first_line.get_field::<u64>(0)?;

        Some((first_clk, last_clk))
    }
}
