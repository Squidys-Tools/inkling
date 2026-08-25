use std::{env, path::PathBuf};

fn main() {
    // Workarounds for building/running with the windows-gnu toolchain (MSVC is
    // unaffected; see docs/tech-stack.md).
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu")
    {
        // tauri-apps/tauri#10843: GNU ld exports every symbol from every linked
        // rlib into the cdylib, overflowing the PE/COFF 65535 export ordinal
        // limit ("export ordinal too large"). The desktop exe links the rlib
        // directly, so the dll's export table can be empty.
        println!("cargo::rustc-link-arg=-Wl,--exclude-libs=ALL,--exclude-all-symbols");

        // webview2-com-sys links WebView2Loader.dll dynamically on windows-gnu,
        // so it must sit next to every binary the loader might launch.
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let target_root = manifest_dir.join("target");
        let source = manifest_dir.join("WebView2Loader.dll");
        if source.is_file() {
            for profile in ["debug", "release"] {
                for dir in [
                    target_root.join(profile),
                    target_root.join(profile).join("deps"),
                ] {
                    let destination = dir.join("WebView2Loader.dll");
                    if !destination.is_file() {
                        if let Err(error) = std::fs::copy(&source, &destination) {
                            println!(
                                "cargo:warning=could not copy WebView2Loader.dll to {}: {error}",
                                dir.display()
                            );
                        }
                    }
                }
            }
        }

        // tauri-apps/tauri#13419: tauri-build embeds the Common-Controls v6
        // manifest only into the main binary (`rustc-link-arg-bins`), so test
        // binaries bind to comctl32 5.82 and die at load with
        // STATUS_ENTRYPOINT_NOT_FOUND (TaskDialogIndirect). Compile a manifest
        // resource ourselves and link it into every artifact.
        let rc = manifest_dir.join("common-controls.rc");
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let object = out_dir.join("common-controls.o");
        println!("cargo:rerun-if-changed={}", rc.display());
        println!(
            "cargo:rerun-if-changed={}",
            manifest_dir.join("common-controls.manifest").display()
        );
        let status = std::process::Command::new("windres")
            .args(["-i"])
            .arg(&rc)
            .args(["-o"])
            .arg(&object)
            .status();
        match status {
            Ok(status) if status.success() => {
                println!("cargo:rustc-link-arg={}", object.display());
            }
            _ => {
                println!("cargo:warning=windres unavailable; test binaries may fail to start (STATUS_ENTRYPOINT_NOT_FOUND)");
            }
        }
    }

    // onnxruntime.dll is a local, gitignored download for the load-dynamic ort
    // backend. tauri-build validates bundle resources on every cargo invocation,
    // so when the DLL has not been fetched yet, drop the bundle.resources entry
    // via a config override instead of failing the build (CI check/test runs).
    let ort_dylib = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("onnxruntime.dll");
    println!("cargo:rerun-if-changed={}", ort_dylib.display());
    if !ort_dylib.is_file() && env::var_os("TAURI_CONFIG").is_none() {
        env::set_var("TAURI_CONFIG", r#"{"bundle":{"resources":[]}}"#);
    }

    tauri_build::build()
}
