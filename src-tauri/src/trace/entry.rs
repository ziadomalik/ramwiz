/// The file format implements utilities for parsing and managing the entries of a memory trace file.
/// An entry is a single trace event.
///
/// Layout:
/// The entry has a fixed width of 64 bytes.
/// All address fields (clk, channel, rank, bankgroup, bank, row, column) are
/// signed integers. Invalid address components are represented as -1.
///
/// +-------------+------+---------------------------------------------+
/// |    Name     | Size |                 Description                 |
/// +-------------+------+---------------------------------------------+
/// | clk         | 8B   | Clock cycle in which the event occurs       |
/// | req_arrive  | 8B   | Request arrival clock cycle                 |
/// | req_depart  | 8B   | Request departure clock cycle               |
/// | channel     | 2B   | Channel                                     |
/// | rank        | 2B   | Rank                                        |
/// | bankgroup   | 4B   | Bankgroup                                   |
/// | bank        | 4B   | Bank                                        |
/// | row         | 4B   | Row                                         |
/// | column      | 4B   | Column                                      |
/// | req_source  | 4B   | Request source ID                           |
/// | req_type    | 4B   | Request type ID                             |
/// | req_issue_duration | 4B | Request issue duration in cycles      |
/// | cmd_id      | 1B   | Command ID (index in the dictionary)        |
/// | reserved    | 7B   | Padding to align struct to 64 bytes         |
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
        serialize_with = "serialize_lei64",
        deserialize_with = "deserialize_lei64"
    )]
    pub req_arrive: LeI64,
    #[serde(
        serialize_with = "serialize_lei64",
        deserialize_with = "deserialize_lei64"
    )]
    pub req_depart: LeI64,
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
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub req_source_id: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub req_type_id: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub req_issue_duration: LeI32,
    pub cmd_id: u8,
    pub reserved: [u8; 7],
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

pub fn get_entry_range_bytes(entries: &[Entry], reference_time: i64) -> Vec<u8> {
    let n = entries.len();

    // Layout (SoA, 4-byte fields first for alignment):
    // [Start CLKs (N * 4B)][Rows (N * 4B)][Columns (N * 4B)]
    // [Cmd IDs (N * 1B)][Channels (N * 1B)][Bankgroups (N * 1B)][Banks (N * 1B)][Ranks (N * 1B)]
    // TODO(ziad): Finally pin a number on the minimum & maximum values for each field. currently assuming addr vec fields fit into 1 byte.
    // Total size: N * 17 bytes.
    //
    // Note: rank, row, column are only used CPU-side for hit-testing / tooltip display.
    // They are NOT fed to the GPU, so this does not affect rendering performance.
    //
    // CLK values are stored as offsets from `reference_time` to preserve f32 precision.
    // Without this, absolute clock values above ~16M lose sub-cycle precision in f32
    // (e.g. at 100M, neighboring f32 values are 8 apart).
    let mut bytes = vec![0u8; n * 17];

    // -- 4-byte fields (aligned) --
    for (i, entry) in entries.iter().enumerate() {
        let start_val = (entry.clk.get() - reference_time) as f32;
        let s_offset = i * 4;
        bytes[s_offset..s_offset + 4].copy_from_slice(&start_val.to_le_bytes());
    }

    let row_offset = n * 4;
    for (i, entry) in entries.iter().enumerate() {
        let r_offset = row_offset + i * 4;
        bytes[r_offset..r_offset + 4].copy_from_slice(&entry.row.get().to_le_bytes());
    }

    let column_offset = row_offset + n * 4;
    for (i, entry) in entries.iter().enumerate() {
        let c_offset = column_offset + i * 4;
        bytes[c_offset..c_offset + 4].copy_from_slice(&entry.column.get().to_le_bytes());
    }

    // -- 1-byte fields --
    let cmd_offset = column_offset + n * 4;
    for (i, entry) in entries.iter().enumerate() {
        bytes[cmd_offset + i] = entry.cmd_id;
    }

    let channel_offset = cmd_offset + n;
    for (i, entry) in entries.iter().enumerate() {
        bytes[channel_offset + i] = entry.channel.get() as u8;
    }

    let bankgroup_offset = channel_offset + n;
    for (i, entry) in entries.iter().enumerate() {
        bytes[bankgroup_offset + i] = entry.bankgroup.get() as u8;
    }

    let bank_offset = bankgroup_offset + n;
    for (i, entry) in entries.iter().enumerate() {
        bytes[bank_offset + i] = entry.bank.get() as u8;
    }

    let rank_offset = bank_offset + n;
    for (i, entry) in entries.iter().enumerate() {
        bytes[rank_offset + i] = entry.rank.get() as u8;
    }

    bytes
}

const _: [(); 64] = [(); std::mem::size_of::<Entry>()];
