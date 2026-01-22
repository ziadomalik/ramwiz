///  
/// Some serialization helpers for making zerocopy and serde work.
/// Used for the header and entry structs and needed for Tauri commands.
/// ----
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
///
///
use serde::Deserialize;
use zerocopy::byteorder::little_endian::I16 as LeI16;

pub fn serialize_lei16<S>(value: &LeI16, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_i16(value.get())
}

pub fn deserialize_lei16<'de, D>(deserializer: D) -> Result<LeI16, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = i16::deserialize(deserializer)?;
    Ok(LeI16::new(value))
}

use zerocopy::byteorder::little_endian::I32 as LeI32;

pub fn serialize_lei32<S>(value: &LeI32, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_i32(value.get())
}

pub fn deserialize_lei32<'de, D>(deserializer: D) -> Result<LeI32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = i32::deserialize(deserializer)?;
    Ok(LeI32::new(value))
}

use zerocopy::byteorder::little_endian::I64 as LeI64;

pub fn serialize_lei64<S>(value: &LeI64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_i64(value.get())
}

pub fn deserialize_lei64<'de, D>(deserializer: D) -> Result<LeI64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = i64::deserialize(deserializer)?;
    Ok(LeI64::new(value))
}

use zerocopy::byteorder::little_endian::U64 as LeU64;

pub fn serialize_leu64<S>(value: &LeU64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_u64(value.get())
}

pub fn deserialize_leu64<'de, D>(deserializer: D) -> Result<LeU64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = u64::deserialize(deserializer)?;
    Ok(LeU64::new(value))
}
