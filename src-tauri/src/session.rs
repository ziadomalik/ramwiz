/// This file implements:
/// - User data storage for the application.
/// - Runtime session management (i.e. info about the currently loaded trace)
/// ---
/// Author: Ziad Malik
/// Email: zmalik@ethz.ch
/// ----
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{App, AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::trace::TraceLoader;

const STORE_PATH: &str = "ramwiz-config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandConfig {
    pub colors: HashMap<u8, String>,
    #[serde(rename = "clockPeriods")]
    pub clock_periods: HashMap<u8, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryLayout {
    #[serde(rename = "numChannels")]
    pub num_channels: u8,
    #[serde(rename = "numBankgroups")]
    pub num_bankgroups: u8,
    #[serde(rename = "numBanks")]
    pub num_banks: u8,
}

pub struct SessionState {
    pub loader: Mutex<Option<TraceLoader>>,
    pub config: Mutex<Option<CommandConfig>>,
    pub memory: Mutex<Option<MemoryLayout>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            loader: Mutex::new(None),
            config: Mutex::new(None),
            memory: Mutex::new(None),
        }
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn load_command_config<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<CommandConfig>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    if let Some(val) = store.get("commandConfig") {
        let config: CommandConfig = serde_json::from_value(val).map_err(|e| e.to_string())?;
        Ok(Some(config))
    } else {
        Ok(None)
    }
}

pub fn load_memory_layout<R: Runtime>(app: &AppHandle<R>) -> Result<Option<MemoryLayout>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    if let Some(val) = store.get("memoryLayout") {
        let config: MemoryLayout = serde_json::from_value(val).map_err(|e| e.to_string())?;
        Ok(Some(config))
    } else {
        Ok(None)
    }
}

pub fn set_command_config<R: Runtime>(
    app: &AppHandle<R>,
    session: &SessionState,
    command_config: CommandConfig,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let command_config_value =
        serde_json::to_value(command_config.clone()).map_err(|e| e.to_string())?;

    store.set("commandConfig", command_config_value);

    let mut guard = session.config.lock().map_err(|e| e.to_string())?;
    *guard = Some(command_config);

    Ok(())
}

pub fn set_memory_layout<R: Runtime>(
    app: &AppHandle<R>,
    session: &SessionState,
    memory_layout: MemoryLayout,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let memory_layout_value =
        serde_json::to_value(memory_layout.clone()).map_err(|e| e.to_string())?;

    store.set("memoryLayout", memory_layout_value);

    let mut guard = session.memory.lock().map_err(|e| e.to_string())?;

    *guard = Some(memory_layout);

    Ok(())
}
