/// The file format implements utilities for parsing and managing the dictionary of a memory trace file.
/// The dictionary is a mapping of integers to memory command strings. The idea is to not have to store
/// the strings of the commands for each entry in the trace file, of which there can be literally millions.
/// The 'command id' referenced everywhere else refers to the index of the command in the dictionary.
///
///  Layout:
/// +-------------+---------------+-------------+
/// | Length (1B) | String Bytes  | Latency (4B)| <- Has command id 0
/// +-------------+---------------+-------------+
/// | Length (1B) | String Bytes  | Latency (4B)| <- Has command id 1
/// +-------------+---------------+-------------+
/// | ...         | ...           | <- Has command id 2, 3, ...
/// +-------------+---------------+-------------+
///  
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
use std::error::Error;
use std::fmt;

use memmap2::Mmap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dictionary {
    pub commands: std::collections::HashMap<u8, String>,
    pub latencies: std::collections::HashMap<u8, i32>,
}

#[derive(Debug)]
pub enum DictionaryError {
    OffsetOutOfBounds,
    InvalidFormat,
    Utf8Error(std::str::Utf8Error),
}

impl Error for DictionaryError {}

impl fmt::Display for DictionaryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DictionaryError::OffsetOutOfBounds => write!(f, "dictionary offset out of bounds"),
            DictionaryError::InvalidFormat => write!(f, "invalid dictionary format"),
            DictionaryError::Utf8Error(e) => write!(f, "UTF-8 error: {}", e),
        }
    }
}

impl From<DictionaryError> for std::io::Error {
    fn from(err: DictionaryError) -> Self {
        std::io::Error::new(std::io::ErrorKind::InvalidData, err.to_string())
    }
}

/// Parses the dictionary from a memory mapped trace file.
/// We obtain dict_offset and num_commands from the header.
pub fn parse(
    mmap: &Mmap,
    dict_offset: u64,
    num_commands: u8,
) -> Result<Dictionary, DictionaryError> {
    let data = mmap.as_ref();
    let offset = dict_offset as usize;

    if offset >= data.len() {
        return Err(DictionaryError::OffsetOutOfBounds);
    }

    let mut commands = std::collections::HashMap::with_capacity(num_commands as usize);
    let mut latencies = std::collections::HashMap::with_capacity(num_commands as usize);
    let mut pos = offset;

    for cmd_id in 0..num_commands {
        if pos >= data.len() {
            return Err(DictionaryError::OffsetOutOfBounds);
        }

        let str_len = data[pos] as usize;
        pos += 1;

        if pos + str_len > data.len() {
            return Err(DictionaryError::OffsetOutOfBounds);
        }

        let name = std::str::from_utf8(&data[pos..pos + str_len])
            .map_err(DictionaryError::Utf8Error)?
            .to_string();
        pos += str_len;

        if pos + std::mem::size_of::<i32>() > data.len() {
            return Err(DictionaryError::OffsetOutOfBounds);
        }

        let mut latency_bytes = [0u8; std::mem::size_of::<i32>()];
        latency_bytes.copy_from_slice(&data[pos..pos + std::mem::size_of::<i32>()]);
        let latency = i32::from_le_bytes(latency_bytes);
        pos += std::mem::size_of::<i32>();

        commands.insert(cmd_id, name);
        latencies.insert(cmd_id, latency);
    }

    Ok(Dictionary {
        commands,
        latencies,
    })
}
