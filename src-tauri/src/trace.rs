/// This file contains the code for parsing a fixed-width binary memory trace file.
/// The file format is defined here:
/// https://github.com/ziadomalik/ramulator2/blob/mtrc/src/dram_controller/impl/plugin/mtrc/mtrc.h
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
use memmap2::Mmap;
use std::fs::File;
use std::path::PathBuf;

use std::error::Error;
use std::fmt;

use serde::{Deserialize, Serialize};
use zerocopy::byteorder::little_endian::U64 as LeU64;
use zerocopy::{FromBytes, Immutable, KnownLayout, Unaligned};

const SUPPORTED_VERSION: u8 = 1;
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
}

fn serialize_leu64<S>(value: &LeU64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_u64(value.get())
}

fn deserialize_leu64<'de, D>(deserializer: D) -> Result<LeU64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = u64::deserialize(deserializer)?;
    Ok(LeU64::new(value))
}

impl Header {
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
        self.version == SUPPORTED_VERSION
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

// Total header size is 24 bytes:
// 5 (magic) + 1 (ver) + 1 (cmd) + 1 (res) + 8 (entries) + 8 (offset)
fn parse(mmap: &Mmap) -> Result<Header, HeaderError> {
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

/// Dictionary maps command IDs to their string names.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dictionary {
    pub commands: std::collections::HashMap<u8, String>,
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

/// Parses the dictionary section from the mmap.
/// Dictionary format: [num_commands: u8] then for each command: [len: u8][name: bytes] starting from dict_offset
fn parse_dictionary(
    mmap: &Mmap,
    dict_offset: u64,
    num_commands: u8,
) -> Result<Dictionary, DictionaryError> {
    let data = mmap.as_ref();
    let offset = dict_offset as usize;

    if offset >= data.len() {
        return Err(DictionaryError::OffsetOutOfBounds);
    }

    let mut commands = std::collections::HashMap::new();
    let mut pos = offset;

    for cmd_id in 0..num_commands {
        if pos >= data.len() {
            return Err(DictionaryError::OffsetOutOfBounds);
        }

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

        commands.insert(cmd_id, name);
    }

    Ok(Dictionary { commands })
}

pub struct TraceLoader {
    mmap: Mmap,
    header: Header,
}

impl TraceLoader {
    pub fn new(path: PathBuf) -> Result<Self, std::io::Error> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        let header = parse(&mmap)?;

        Ok(Self { mmap, header })
    }

    pub fn header(&self) -> &Header {
        &self.header
    }

    pub fn parse_dictionary(&self) -> Result<Dictionary, std::io::Error> {
        parse_dictionary(
            &self.mmap,
            self.header.dict_offset(),
            self.header.num_commands,
        )
        .map_err(Into::into)
    }

    pub fn data(&self) -> &[u8] {
        self.mmap.as_ref()
    }
}
