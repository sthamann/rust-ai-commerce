//! PDF extraction executes in a killable child process without inherited commerce credentials.
use super::*;
use tokio::io::AsyncWriteExt;
pub(crate) fn extract_pdf() {
    use std::io::{Read, Write};
    let mut input = Vec::new();
    if std::io::stdin()
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut input)
        .is_err()
        || input.len() > 2 * 1024 * 1024
    {
        std::process::exit(2);
    }
    #[cfg(unix)]
    unsafe {
        // Darwin rejects finite DATA/AS limits; Linux deployments enforce address space.
        #[cfg(target_os = "linux")]
        {
            let memory = libc::rlimit {
                rlim_cur: 512 * 1024 * 1024,
                rlim_max: 512 * 1024 * 1024,
            };
            if libc::setrlimit(libc::RLIMIT_AS, &memory) != 0 {
                eprintln!(
                    "Parser memory limit setup failed: {}",
                    std::io::Error::last_os_error()
                );
                std::process::exit(2);
            }
        }
        let cpu = libc::rlimit {
            rlim_cur: 8,
            rlim_max: 8,
        };
        if libc::setrlimit(libc::RLIMIT_CPU, &cpu) != 0 {
            eprintln!(
                "Parser CPU limit setup failed: {}",
                std::io::Error::last_os_error()
            );
            std::process::exit(2);
        }
    }
    let text = match pdf_extract::extract_text_from_mem(&input) {
        Ok(text) => text,
        Err(_) => {
            eprintln!("PDF extraction rejected the source");
            std::process::exit(2)
        }
    };
    let mut end = text.len().min(100_000);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    let text = &text[..end];
    if text.trim().is_empty() {
        std::process::exit(3);
    }
    let _ = std::io::stdout().write_all(text.as_bytes());
}
pub(crate) async fn text(bytes: Vec<u8>, pdf: bool) -> Result<String> {
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(bad("Document exceeds 2 MiB"));
    }
    if !pdf {
        return String::from_utf8(bytes).map_err(|_| bad("Text document must use UTF-8"));
    }
    let executable = std::env::current_exe().map_err(|_| bad("Parser unavailable"))?;
    let mut child = tokio::process::Command::new(executable)
        .arg("--extract-pdf")
        .env_clear()
        .kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| bad("Parser unavailable"))?;
    let stdin = child.stdin.take().unwrap();
    let work = async {
        let mut stdin = stdin;
        stdin
            .write_all(&bytes)
            .await
            .map_err(|_| bad("PDF parser failed"))?;
        drop(stdin);
        child
            .wait_with_output()
            .await
            .map_err(|_| bad("PDF extraction failed"))
    };
    let out = tokio::time::timeout(std::time::Duration::from_secs(15), work)
        .await
        .map_err(|_| bad("PDF extraction timed out"))??;
    if !out.status.success() {
        return Err(bad(
            "PDF has no extractable text or is invalid; OCR is not available",
        ));
    }
    String::from_utf8(out.stdout).map_err(|_| bad("Invalid extracted text"))
}
