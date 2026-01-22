// This file implements the user data storage for the application.
// ---
// Author: Ziad Malik
// Email: zmalik@ethz.ch
// ----

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "ramwiz-config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandConfig {
    pub colors: HashMap<u8, String>,
    #[serde(rename = "clockPeriods")]
    pub clock_periods: HashMap<u8, f32>
}

pub fn load_command_config<R: Runtime>(app: &AppHandle<R>) -> Result<Option<CommandConfig>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    
    if let Some(val) = store.get("commandConfig") {
        let config: CommandConfig = serde_json::from_value(val).map_err(|e| e.to_string())?;
        Ok(Some(config))
    } else {
        Ok(None)
    }
}
