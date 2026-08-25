use std::fs::{File, OpenOptions};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde_json::json;

struct TraceState {
    started_at: Instant,
    previous_at: Instant,
    enabled: bool,
    file: Option<File>,
}

static TRACE_STATE: OnceLock<Mutex<TraceState>> = OnceLock::new();

fn trace_state() -> &'static Mutex<TraceState> {
    TRACE_STATE.get_or_init(|| {
        let started_at = Instant::now();
        let enabled = std::env::var("CODEY_PERF_TRACE").ok().is_some_and(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes"
            )
        });
        let file = if enabled {
            std::env::var_os("CODEY_PERF_TRACE_FILE")
                .and_then(|path| OpenOptions::new().create(true).append(true).open(path).ok())
        } else {
            None
        };
        Mutex::new(TraceState {
            started_at,
            previous_at: started_at,
            enabled,
            file,
        })
    })
}

pub(crate) fn enabled() -> bool {
    trace_state()
        .lock()
        .map(|state| state.enabled)
        .unwrap_or(false)
}

pub(crate) fn start() {
    mark("process_start");
}

pub(crate) fn mark(stage: &str) {
    let Ok(mut state) = trace_state().lock() else {
        return;
    };
    if !state.enabled {
        return;
    }

    let now = Instant::now();
    let elapsed_ms = now.duration_since(state.started_at).as_secs_f64() * 1_000.0;
    let since_previous_ms = now.duration_since(state.previous_at).as_secs_f64() * 1_000.0;
    state.previous_at = now;
    let line = json!({
        "stage": stage,
        "elapsedMs": elapsed_ms,
        "sincePreviousMs": since_previous_ms,
    })
    .to_string();

    eprintln!("CODEY_PERF_TRACE {line}");
    if let Some(file) = state.file.as_mut() {
        let _ = writeln!(file, "{line}");
        let _ = file.flush();
    }
}
