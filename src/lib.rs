use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Size, Position};

#[tauri::command]
fn toggle_mini_mode(app: AppHandle, mini: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if mini {
            // 1. Get primary monitor dimensions to calculate the top-right corner
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let screen_size = monitor.size();
                
                let mini_width = 220;
                let mini_height = 42;
                let padding = 16; // Margin from the edge of the screen

                // Calculate top-right position
                let x_pos = (screen_size.width as i32) - mini_width - padding;
                let y_pos = padding;

                // 2. Resize and reposition the window
                let _ = window.set_size(Size::Physical(PhysicalSize {
                    width: mini_width as u32,
                    height: mini_height as u32,
                }));

                let _ = window.set_position(Position::Physical(PhysicalPosition {
                    x: x_pos,
                    y: y_pos,
                }));
            }
        } else {
            // Restore standard app size (width: 360, height: 520)
            let _ = window.set_size(Size::Physical(PhysicalSize {
                width: 360,
                height: 520,
            }));

            // Optional: Re-center the window when expanding back
            let _ = window.center();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![toggle_mini_mode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}