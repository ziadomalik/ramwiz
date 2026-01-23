/// The file format implements utilities for parsing and managing the entries of a memory trace file.
/// An entry is a single trace event.
///
/// Layout:
/// The entry has a fixed width of 32 bytes.
/// All address fields (clk, channel, rank, bankgroup, bank, row, column) are
/// signed integers. Invalid address components are represented as -1.
///
/// +-------------+------+---------------------------------------------+
/// |    Name     | Size |                 Description                 |
/// +-------------+------+---------------------------------------------+
/// | clk         | 8B   | Clock cycle in which the event occurs       |
/// | channel     | 2B   | Channel                                     |
/// | rank        | 2B   | Rank                                        |
/// | bankgroup   | 4B   | Bankgroup                                   |
/// | bank        | 4B   | Bank                                        |
/// | row         | 4B   | Row                                         |
/// | column      | 4B   | Column                                      |
/// | cmd_id      | 1B   | Command ID (index in the dictionary)        |
/// | reserved    | 3B   | Padding to align struct to 32 bytes         |
/// +-------------+------+---------------------------------------------+
///  
/// We also add abstractions to transform the entry into a more WebGL-friendly Structure of Arrays format.
/// TODO(ziad): Implement
///
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
use std::error::Error;
use std::fmt;

use memmap2::Mmap;
use serde::{Deserialize, Serialize};
use zerocopy::{FromBytes, Immutable, KnownLayout, Unaligned};

use zerocopy::byteorder::little_endian::I16 as LeI16;
use zerocopy::byteorder::little_endian::I32 as LeI32;
use zerocopy::byteorder::little_endian::I64 as LeI64;

use std::collections::HashMap;

use crate::user_data::CommandConfig;

use crate::trace::header::Header;

use crate::trace::serialize::{
    deserialize_lei16, deserialize_lei32, deserialize_lei64, serialize_lei16, serialize_lei32,
    serialize_lei64,
};

#[derive(
    FromBytes, Unaligned, KnownLayout, Immutable, Debug, Copy, Clone, Serialize, Deserialize,
)]
#[repr(C)]
pub struct Entry {
    #[serde(
        serialize_with = "serialize_lei64",
        deserialize_with = "deserialize_lei64"
    )]
    pub clk: LeI64,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub channel: LeI16,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub rank: LeI16,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub bankgroup: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub bank: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub row: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub column: LeI32,
    pub cmd_id: u8,
    pub reserved: [u8; 3],
}

impl Entry {
    pub fn cmd_id(&self) -> u8 {
        self.cmd_id
    }
}

#[derive(Debug)]
pub enum EntryError {
    InvalidCmdId,
    InvalidIndex,
}

impl Error for EntryError {}

impl fmt::Display for EntryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EntryError::InvalidCmdId => write!(f, "invalid command id"),
            EntryError::InvalidIndex => write!(f, "invalid index"),
        }
    }
}

impl From<EntryError> for std::io::Error {
    fn from(err: EntryError) -> Self {
        std::io::Error::new(std::io::ErrorKind::InvalidData, err.to_string())
    }
}

pub fn parse(mmap: &Mmap, header: &Header, index: u64) -> Result<Entry, EntryError> {
    if index >= header.num_entries() {
        return Err(EntryError::InvalidIndex);
    }

    let offset = std::mem::size_of::<Header>() + (index as usize * std::mem::size_of::<Entry>());
    let slice = mmap.get(offset..).ok_or(EntryError::InvalidIndex)?;

    let (entry, _) =
        zerocopy::Ref::<&[u8], Entry>::from_prefix(slice).map_err(|_| EntryError::InvalidCmdId)?;

    if entry.cmd_id() >= header.num_commands() {
        return Err(EntryError::InvalidCmdId);
    }

    Ok(*entry)
}

pub fn get_entry_range_bytes(entries: &[Entry], config: &CommandConfig) -> Vec<u8> {
    let n = entries.len();

    // Get all possible colors and precompute the RGB values from the hex strings.
    let mut color_lut = HashMap::new();
    for (&cmd, hex) in &config.colors {
        let (r, g, b) = parse_color(hex);
        color_lut.insert(cmd, (r, g, b));
    }

    // The resulting buffer is 24 bytes:
    // 1 start (4B) + 1 duration (4B) + 1 row (4B) + 3 colors (4*3B)
    let buffer_size = n * 24;
    let mut bytes = vec![0u8; buffer_size];

    let start_offset = 0;
    let dur_offset = n * 4;
    let row_offset = n * 8;
    let color_offset = n * 12;

    for (i, entry) in entries.iter().enumerate() {
        let cmd = entry.cmd_id();

        let start_val = entry.clk.get() as f32;
        let start_idx = start_offset + i * 4;
        bytes[start_idx..start_idx + 4].copy_from_slice(&start_val.to_le_bytes());

        let duration_val = config.clock_periods.get(&cmd).copied().unwrap_or(10.0);
        let duration_idx = dur_offset + i * 4;
        bytes[duration_idx..duration_idx + 4].copy_from_slice(&duration_val.to_le_bytes());

        // TODO(ziad): Force all events to row 0 until I figure out how to render them correctly.
        let row_val = 0.0 as f32; 
        let row_idx = row_offset + i * 4;
        bytes[row_idx..row_idx + 4].copy_from_slice(&row_val.to_le_bytes());

        let (r, g, b) = color_lut.get(&cmd).copied().unwrap_or((0.5, 0.5, 0.5));
        let color_idx = color_offset + i * 12;
        bytes[color_idx..color_idx + 4].copy_from_slice(&r.to_le_bytes());
        bytes[color_idx + 4..color_idx + 8].copy_from_slice(&g.to_le_bytes());
        bytes[color_idx + 8..color_idx + 12].copy_from_slice(&b.to_le_bytes());
    }

    bytes
}

fn parse_color(hex: &str) -> (f32, f32, f32) {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return (0.5, 0.5, 0.5);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32 / 255.0;
    (r, g, b)
}
