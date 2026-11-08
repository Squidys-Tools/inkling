#![windows_subsystem = "windows"]

use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{exit, Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy};
use tao::platform::run_return::EventLoopExtRunReturn;
use tao::platform::windows::{IconExtWindows, WindowExtWindows};
use tao::window::{Icon, Window, WindowBuilder};
use wry::{WebContext, WebViewBuilder};
use windows_sys::Win32::Foundation::{CloseHandle, HWND};
use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};
use windows_sys::Win32::System::Threading::{
    GetProcessIoCounters, IO_COUNTERS, OpenProcess, WaitForSingleObject,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

// pack.ts appends `[html][nsis][u64 htmlLen][u64 nsisLen][u64 installedBytes][magic]`.
const MAGIC: &[u8; 8] = b"INKSETUP";
const TRAILER_LEN: u64 = 32;
const DETACHED_PROCESS: u32 = 0x0000_0008;
const WAIT_OBJECT_0: u32 = 0;
const WAIT_TIMEOUT: u32 = 0x102;
const POLL_MS: u32 = 150;

enum UserEvent {
    Ipc(String),
    Progress(f64),
    Done,
    Failed(String),
}

struct Payload {
    html: String,
    nsis_offset: u64,
    nsis_len: u64,
    installed_bytes: u64,
}

#[derive(Clone)]
struct InstallJob {
    exe: PathBuf,
    nsis_offset: u64,
    nsis_len: u64,
    installed_bytes: u64,
    args: Arc<Vec<OsString>>,
    proxy: EventLoopProxy<UserEvent>,
    installing: Arc<AtomicBool>,
}

fn main() {
    exit(real_main());
}

fn real_main() -> i32 {
    let args: Vec<OsString> = env::args_os().skip(1).collect();
    let exe = match env::current_exe() {
        Ok(exe) => exe,
        Err(_) => return 1,
    };
    let payload = match read_payload(&exe) {
        Ok(payload) => payload,
        Err(_) => return 1,
    };
    let silent = args
        .iter()
        .any(|arg| arg.to_string_lossy().eq_ignore_ascii_case("/S"));
    if silent {
        return run_nsis(&exe, &payload, &args);
    }
    match gui(&exe, &payload, &args) {
        Ok(code) => code,
        // No WebView2 runtime or a dead window: hand off to the NSIS UI.
        Err(_) => run_nsis(&exe, &payload, &args),
    }
}

fn read_payload(exe: &Path) -> io::Result<Payload> {
    let mut file = File::open(exe)?;
    let file_len = file.metadata()?.len();
    if file_len < TRAILER_LEN {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "stub too small"));
    }
    file.seek(SeekFrom::End(-(TRAILER_LEN as i64)))?;
    let mut trailer = [0u8; TRAILER_LEN as usize];
    file.read_exact(&mut trailer)?;
    if trailer[24..32] != *MAGIC {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "bad magic"));
    }
    let html_len = u64::from_le_bytes(trailer[0..8].try_into().unwrap());
    let nsis_len = u64::from_le_bytes(trailer[8..16].try_into().unwrap());
    let installed_bytes = u64::from_le_bytes(trailer[16..24].try_into().unwrap());
    let nsis_offset = file_len
        .checked_sub(TRAILER_LEN)
        .and_then(|end| end.checked_sub(nsis_len))
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "bad nsis length"))?;
    let html_offset = nsis_offset
        .checked_sub(html_len)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "bad html length"))?;
    file.seek(SeekFrom::Start(html_offset))?;
    let mut html_bytes = vec![0u8; html_len as usize];
    file.read_exact(&mut html_bytes)?;
    let html = String::from_utf8(html_bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "html is not utf-8"))?;
    Ok(Payload {
        html,
        nsis_offset,
        nsis_len,
        installed_bytes,
    })
}

fn temp_dir() -> PathBuf {
    env::temp_dir().join(format!("inkling-setup-{}", std::process::id()))
}

fn extract_nsis(exe: &Path, nsis_offset: u64, nsis_len: u64) -> io::Result<PathBuf> {
    let dir = temp_dir();
    fs::create_dir_all(&dir)?;
    let nsis_path = dir.join("inkling-installer.exe");
    let mut src = File::open(exe)?;
    src.seek(SeekFrom::Start(nsis_offset))?;
    let mut dst = File::create(&nsis_path)?;
    io::copy(&mut src.take(nsis_len), &mut dst)?;
    Ok(nsis_path)
}

// Headless `/S` and the no-WebView2 fallback share this: run the carried NSIS
// with the caller's own args and return its exit code.
fn run_nsis(exe: &Path, payload: &Payload, args: &[OsString]) -> i32 {
    let code = (|| -> io::Result<i32> {
        let nsis = extract_nsis(exe, payload.nsis_offset, payload.nsis_len)?;
        let status = Command::new(nsis)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;
        Ok(status.code().unwrap_or(1))
    })();
    let _ = fs::remove_dir_all(temp_dir());
    code.unwrap_or(1)
}

fn gui(exe: &Path, payload: &Payload, args: &[OsString]) -> Result<i32, String> {
    let mut builder = EventLoopBuilder::<UserEvent>::with_user_event();
    let event_loop = builder.build();
    let icon = Icon::from_resource(1, None).ok();
    let window = Arc::new(
        WindowBuilder::new()
            .with_title("inkling Setup")
            .with_inner_size(LogicalSize::new(480.0, 320.0))
            .with_resizable(false)
            .with_minimizable(true)
            .with_maximizable(false)
            .with_closable(true)
            .with_decorations(false)
            .with_visible(true)
            .with_window_icon(icon)
            .build(&event_loop)
            .map_err(|e| e.to_string())?,
    );
    window.set_undecorated_shadow(true);
    center_window(&window);
    round_corners(window.hwnd() as HWND);

    let proxy_ipc = event_loop.create_proxy();
    let proxy_events = event_loop.create_proxy();
    let mut web_context =
        WebContext::new(Some(env::temp_dir().join("inkling-setup-webview")));
    let webview = WebViewBuilder::new_with_web_context(&mut web_context)
        .with_html(payload.html.clone())
        .with_background_color((12, 12, 11, 255))
        .with_devtools(cfg!(debug_assertions))
        .with_ipc_handler(move |request| {
            let _ = proxy_ipc.send_event(UserEvent::Ipc(request.into_body()));
        })
        .build(&*window)
        .map_err(|e| e.to_string())?;

    let installing = Arc::new(AtomicBool::new(false));
    let job = InstallJob {
        exe: exe.to_path_buf(),
        nsis_offset: payload.nsis_offset,
        nsis_len: payload.nsis_len,
        installed_bytes: payload.installed_bytes,
        args: Arc::new(args.to_vec()),
        proxy: proxy_events.clone(),
        installing: installing.clone(),
    };
    let app_exe = app_exe(args);
    let mut event_loop = event_loop;
    let code = event_loop.run_return(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::Ipc(message)) => match message.as_str() {
                "ready" => {
                    window.set_visible(true);
                    window.set_focus();
                }
                "drag" => {
                    let _ = window.drag_window();
                }
                "minimize" => window.set_minimized(true),
                "install" => {
                    if !installing.swap(true, Ordering::SeqCst) {
                        let job = job.clone();
                        thread::spawn(move || run_install(job));
                    }
                }
                "open" => {
                    if let Some(exe) = &app_exe {
                        spawn_app(exe);
                    }
                    *control_flow = ControlFlow::Exit;
                }
                "close" | "quit" => {
                    if !installing.load(Ordering::SeqCst) {
                        *control_flow = ControlFlow::Exit;
                    }
                }
                _ => {}
            },
            Event::UserEvent(UserEvent::Progress(fraction)) => {
                let _ = webview.evaluate_script(&format!("setup.progress({fraction})"));
            }
            Event::UserEvent(UserEvent::Done) => {
                let _ = webview.evaluate_script("setup.done()");
            }
            Event::UserEvent(UserEvent::Failed(detail)) => {
                let _ = webview
                    .evaluate_script(&format!("setup.failed({})", js_string(&detail)));
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                if !installing.load(Ordering::SeqCst) {
                    *control_flow = ControlFlow::Exit;
                }
            }
            _ => {}
        }
    });
    let _ = fs::remove_dir_all(temp_dir());
    Ok(code)
}

fn center_window(window: &Window) {
    let Some(monitor) = window
        .current_monitor()
        .or_else(|| window.primary_monitor())
    else {
        return;
    };
    let size = window.inner_size();
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    window.set_outer_position(PhysicalPosition::new(
        monitor_pos.x + (monitor_size.width as i32 - size.width as i32) / 2,
        monitor_pos.y + (monitor_size.height as i32 - size.height as i32) / 2,
    ));
}

fn round_corners(hwnd: HWND) {
    unsafe {
        let preference = DWMWCP_ROUND;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &preference as *const _ as *const std::ffi::c_void,
            std::mem::size_of_val(&preference) as u32,
        );
    }
}

fn run_install(job: InstallJob) {
    let outcome = install_inner(&job);
    let _ = fs::remove_dir_all(temp_dir());
    job.installing.store(false, Ordering::SeqCst);
    let _ = job.proxy.send_event(match outcome {
        Ok(0) => UserEvent::Done,
        Ok(code) => UserEvent::Failed(format!("Setup exited with code {code}")),
        Err(detail) => UserEvent::Failed(detail),
    });
}

fn install_inner(job: &InstallJob) -> Result<i32, String> {
    let nsis = extract_nsis(&job.exe, job.nsis_offset, job.nsis_len)
        .map_err(|e| format!("Could not unpack the installer: {e}"))?;
    let mut child = Command::new(nsis)
        .arg("/S")
        .args(job.args.iter())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start setup: {e}"))?;
    watch_install(&mut child, job, &job.proxy);
    let code = child
        .wait()
        .map_err(|e| e.to_string())?
        .code()
        .unwrap_or(1);
    Ok(code)
}

// WriteTransferCount over the bytes the install has to move is the progress signal.
fn watch_install(
    child: &mut Child,
    job: &InstallJob,
    proxy: &EventLoopProxy<UserEvent>,
) -> (u64, u64) {
    let handle =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, child.id()) };
    if handle.is_null() {
        return (0, 0);
    }
    let total = (job.nsis_len + job.installed_bytes) as f64;
    let mut writes = 0u64;
    let mut reads = 0u64;
    let mut last = 0f64;
    loop {
        let wait = unsafe {
            WaitForSingleObject(handle, POLL_MS)
        };
        let mut counters = unsafe { std::mem::zeroed::<IO_COUNTERS>() };
        unsafe {
            if GetProcessIoCounters(handle, &mut counters) != 0 {
                writes = counters.WriteTransferCount;
                reads = counters.ReadTransferCount;
            }
        }
        let progress = ((writes as f64) / total).clamp(0.0, 0.99);
        if progress > last {
            last = progress;
            let _ = proxy.send_event(UserEvent::Progress(progress));
        }
        if wait == WAIT_OBJECT_0 || wait != WAIT_TIMEOUT {
            break;
        }
    }
    let mut counters = unsafe { std::mem::zeroed::<IO_COUNTERS>() };
    unsafe {
        if GetProcessIoCounters(handle, &mut counters) != 0 {
            writes = counters.WriteTransferCount;
            reads = counters.ReadTransferCount;
        }
        CloseHandle(handle);
    }
    (writes, reads)
}

fn app_exe(args: &[OsString]) -> Option<PathBuf> {
    let dir = install_dir_arg(args).or_else(|| {
        env::var_os("LOCALAPPDATA")
            .map(|local| PathBuf::from(local).join("Programs").join("inkling"))
    })?;
    Some(dir.join("inkling.exe"))
}

fn install_dir_arg(args: &[OsString]) -> Option<PathBuf> {
    let mut dir = None;
    for arg in args {
        let text = arg.to_string_lossy();
        if text
            .get(..3)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("/d="))
        {
            if let Some(value) = text.get(3..) {
                if !value.is_empty() {
                    dir = Some(PathBuf::from(value));
                }
            }
        }
    }
    dir
}

fn spawn_app(exe: &Path) {
    let _ = Command::new(exe)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(DETACHED_PROCESS)
        .spawn();
}

fn js_string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c < ' ' => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
