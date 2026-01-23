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
pub mod entry;
pub mod header;
pub mod serialize;

pub use dictionary::Dictionary;
pub use entry::Entry;
pub use header::Header;

use zerocopy::Ref;

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

    pub fn load_entry(&self, index: u64) -> Result<Entry, std::io::Error> {
        entry::parse(&self.mmap, &self.header, index).map_err(Into::into)
    }

    pub fn load_entry_slice(&self, start: u64, count: usize) -> Result<&[Entry], std::io::Error> {
        let start_offset =
            std::mem::size_of::<Header>() + (start as usize * std::mem::size_of::<Entry>());
        let end_offset = start_offset + (count * std::mem::size_of::<Entry>());

        if end_offset > self.mmap.len() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "Out of bounds",
            ));
        }

        let slice = &self.mmap[start_offset..end_offset];

        let (entries, _) = Ref::<&[u8], [Entry]>::from_prefix_with_elems(slice, count)
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Cast failed"))?;

        Ok(Ref::into_ref(entries))
    }

    // Since the clk's aren't spaced evenly, we need to rely on index lookup and yet, the whole UI only makes sense in terms of time.
    // So we look for an entry with a given clk using binary search and obtain the index.
    // TODO(ziad): This is horrible. There's got to be a better way to do this.
    pub fn find_index_for_time(&self, target_clk: i64) -> Result<u64, std::io::Error> {
        let num_entries = self.header.num_entries();
        if num_entries == 0 {
            return Ok(0);
        }

        let mut low = 0;
        let mut high = num_entries - 1;
        let mut result = num_entries;

        while low <= high {
            let mid = low + (high - low) / 2;
            let entry = self.load_entry(mid)?;

            if entry.clk.get() >= target_clk {
                result = mid;
                if mid == 0 {
                    break;
                }
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        Ok(result)
    }
}
