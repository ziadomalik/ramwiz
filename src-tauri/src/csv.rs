// -----
// Some utilities for parsing memory mapped CSV files.
// -----
// Author: Ziad Malik <zmalik@ethz.ch>
// License: MIT
// -----

use std::str::FromStr;

// Represents a line in a CSV file.
pub struct CSVLine<'a> {
    data: &'a [u8],
}

impl<'a> CSVLine<'a> {
    /// NOTE: the byte slice we create the CSVLine from should not include the newline character.
    /// TODO: Enforce this at some point.
    pub fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    /// Get the raw bytes of the i-th field
    pub fn get_field_bytes(&self, index: usize) -> Option<&'a [u8]> {
        self.data.split(|&b| b == b',').nth(index)
    }

    pub fn get_field_str(&self, index: usize) -> Option<&'a str> {
        self.get_field_bytes(index)
            .and_then(|b| std::str::from_utf8(b).ok())
            .map(|s| s.trim())
    }

    // Parse field into any type that implements FromStr
    pub fn get_field<T: FromStr>(&self, index: usize) -> Option<T> {
        self.get_field_str(index)?.parse().ok()
    }

    // pub fn fields(&self) -> impl Iterator<Item = &'a str> {
    //     self.data
    //         .split(|&b| b == b',')
    //         .filter_map(|b| std::str::from_utf8(b).ok())
    //         .map(|s| s.trim())
    // }
}
