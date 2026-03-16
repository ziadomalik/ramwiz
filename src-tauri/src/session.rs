/// Runtime session state for the currently loaded trace and UI settings.
use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::trace::TraceLoader;

const STORE_PATH: &str = "ramwiz-config.json";
const COMMAND_COLORS_KEY: &str = "commandColors";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandColorConfig {
    pub colors: HashMap<u8, String>,
}

pub struct SessionState {
    pub loader: Mutex<Option<TraceLoader>>,
    pub colors: Mutex<Option<CommandColorConfig>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            loader: Mutex::new(None),
            colors: Mutex::new(None),
        }
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn load_command_colors<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<CommandColorConfig>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;

    if let Some(val) = store.get(COMMAND_COLORS_KEY) {
        let config: CommandColorConfig = serde_json::from_value(val).map_err(|e| e.to_string())?;
        Ok(Some(config))
    } else {
        Ok(None)
    }
}

pub fn set_command_colors<R: Runtime>(
    app: &AppHandle<R>,
    session: &SessionState,
    command_colors: CommandColorConfig,
) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    let command_colors_value =
        serde_json::to_value(command_colors.clone()).map_err(|e| e.to_string())?;

    store.set(COMMAND_COLORS_KEY, command_colors_value);

    let mut guard = session.colors.lock().map_err(|e| e.to_string())?;
    *guard = Some(command_colors);

    Ok(())
}
