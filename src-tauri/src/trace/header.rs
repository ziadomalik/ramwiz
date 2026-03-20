/// The file format implements utilities for parsing and managing the header of a memory trace file.
///
///  Layout:
///  The header has a fixed width of 40 bytes.
///  
///  +---------------------+------+-----------------------------------------------+
///  |        Name         | Size |                 Description                   |
///  +---------------------+------+-----------------------------------------------+
///  | magic               | 5B   | "RAM2\0" (null-terminated)                    |
///  | version             | 1B   | Major version of the file format              |
///  | num_commands        | 1B   | Number of unique command strings              |
///  | reserved            | 1B   | Padding to align next field to 8B             |
///  | num_entries         | 8B   | Number of entries / trace events              |
///  | dict_offset         | 8B   | Byte offset where dictionary starts           |
///  | ncl                 | 4B   | nCL in cycles (RD cmd->data delay)            |
///  | ncwl                | 4B   | nCWL in cycles (WR cmd->data delay)           |
///  | max_channel_id      | 2B   | Maximum channel ID in the trace               |
///  | max_rank_id         | 2B   | Maximum rank ID in the trace                  |
///  | max_bankgroup_id    | 2B   | Maximum bankgroup ID in the trace             |
///  | max_bank_id         | 2B   | Maximum bank ID in the trace                  |
///  +---------------------+------+-----------------------------------------------+
///  
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
use std::error::Error;
use std::fmt;

use memmap2::Mmap;
use serde::{Deserialize, Serialize};
use zerocopy::byteorder::little_endian::I16 as LeI16;
use zerocopy::byteorder::little_endian::I32 as LeI32;
use zerocopy::byteorder::little_endian::U64 as LeU64;
use zerocopy::{FromBytes, Immutable, KnownLayout, Unaligned};

use crate::trace::serialize::{
    deserialize_lei16, deserialize_lei32, deserialize_leu64, serialize_lei16, serialize_lei32,
    serialize_leu64,
};

const SUPPORTED_VERSIONS: [u8; 3] = [3, 4, 5];
const MAGIC: [u8; 5] = *b"RAM2\0";

#[derive(
    FromBytes, Unaligned, KnownLayout, Immutable, Debug, Copy, Clone, Serialize, Deserialize,
)]
#[repr(C)]
pub struct Header {
    pub magic: [u8; 5],
    pub version: u8,
    pub num_commands: u8,
    pub reserved: u8,
    #[serde(
        serialize_with = "serialize_leu64",
        deserialize_with = "deserialize_leu64"
    )]
    pub num_entries: LeU64,
    #[serde(
        serialize_with = "serialize_leu64",
        deserialize_with = "deserialize_leu64"
    )]
    pub dict_offset: LeU64,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub ncl: LeI32,
    #[serde(
        serialize_with = "serialize_lei32",
        deserialize_with = "deserialize_lei32"
    )]
    pub ncwl: LeI32,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub max_channel_id: LeI16,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub max_rank_id: LeI16,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub max_bankgroup_id: LeI16,
    #[serde(
        serialize_with = "serialize_lei16",
        deserialize_with = "deserialize_lei16"
    )]
    pub max_bank_id: LeI16,
}

impl Header {
    pub fn num_commands(&self) -> u8 {
        self.num_commands
    }

    pub fn num_entries(&self) -> u64 {
        self.num_entries.get()
    }

    pub fn dict_offset(&self) -> u64 {
        self.dict_offset.get()
    }

    pub fn is_valid_magic(&self) -> bool {
        self.magic == MAGIC
    }

    pub fn is_supported_version(&self) -> bool {
        SUPPORTED_VERSIONS.contains(&self.version)
    }
}

#[derive(Debug)]
pub enum HeaderError {
    FileTooShort,
    InvalidMagic,
    UnsupportedVersion,
}

impl Error for HeaderError {}

impl fmt::Display for HeaderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HeaderError::FileTooShort => write!(f, "file too short"),
            HeaderError::InvalidMagic => write!(f, "invalid magic number"),
            HeaderError::UnsupportedVersion => write!(f, "unsupported version"),
        }
    }
}
impl From<HeaderError> for std::io::Error {
    fn from(err: HeaderError) -> Self {
        std::io::Error::new(std::io::ErrorKind::InvalidData, err.to_string())
    }
}

/// Parses the header from a memory mapped trace file.
pub fn parse(mmap: &Mmap) -> Result<Header, HeaderError> {
    let (header, _) = zerocopy::Ref::<&[u8], Header>::from_prefix(mmap.as_ref())
        .map_err(|_| HeaderError::FileTooShort)?;

    if !header.is_valid_magic() {
        return Err(HeaderError::InvalidMagic);
    }

    if !header.is_supported_version() {
        return Err(HeaderError::UnsupportedVersion);
    }

    Ok(*header)
}

const _: [(); 40] = [(); std::mem::size_of::<Header>()];
