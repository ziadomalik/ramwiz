// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod trace;

#[tauri::command]
async fn load_trace(path: String) -> Result<u64, String> {
    let result = tokio::task::spawn_blocking(move || {
        println!("Loading trace from {}", path);
        let mut trace_loader = trace::TraceLoader::new();
        trace_loader.open(path).map(|meta| meta.total_events)
    })
    .await
    .map_err(|e| e.to_string())?;

    result.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_trace])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
