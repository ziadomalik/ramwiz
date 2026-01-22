/// This file implements a trace loader for the memory trace file format.
/// It defines the API for interacting with the trace file to be used by Tauri commands.
/// Currently, we only support the custom binary trace file format defined in this repository:
/// https://github.com/ziadomalik/ramulator2/blob/mtrc/src/dram_controller/impl/plugin/mtrc/mtrc.h
///
/// Layout of a trace file:
///
/// +----------------+
/// |  Header (24B)  |
/// +----------------+
/// | Entry #1 (32B) |
/// +----------------+
/// | Entry #2 (32B) |
/// +----------------+
/// | ...            |
/// +----------------+
/// | Dictionary (v) |
/// +----------------+
///
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----

use memmap2::Mmap;
use std::fs::File;
use std::path::PathBuf;

pub mod dictionary;
pub mod header;

pub use dictionary::Dictionary;
pub use header::Header;

pub struct TraceLoader {
    mmap: Mmap,
    header: Header,
}

impl TraceLoader {
    pub fn new(path: PathBuf) -> Result<Self, std::io::Error> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        let header = header::parse(&mmap)?;

        Ok(Self { mmap, header })
    }

    pub fn header(&self) -> &Header {
        &self.header
    }

    pub fn load_dictionary(&self) -> Result<Dictionary, std::io::Error> {
        dictionary::parse(
            &self.mmap,
            self.header.dict_offset(),
            self.header.num_commands,
        )
        .map_err(Into::into)
    }
}
