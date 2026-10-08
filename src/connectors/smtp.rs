//! Pinned SMTP/STARTTLS/TLS with verified hostname, bounded dialogue and no retry after ambiguous DATA.
use super::*;
use base64::{Engine, engine::general_purpose::STANDARD};
use config::{Credentials, Security, Settings};
use lettre::{
    Message,
    message::{Mailbox, MultiPart, SinglePart},
};
use std::net::SocketAddr;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio_rustls::{
    TlsConnector,
    rustls::{ClientConfig, RootCertStore, pki_types::ServerName},
};
trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}
type Connection = BufReader<Box<dyn Stream>>;
pub async fn target(s: &Settings) -> Result<Vec<SocketAddr>> {
    let testing = env::var("EMAIL_TEST_SMTP").as_deref() == Ok("1")
        && ["localhost", "127.0.0.1"].contains(&s.smtp_host.as_str());
    let allow = env::var("EMAIL_SMTP_HOSTS").unwrap_or_default();
    checked(
        testing
            || (allow
                .split(',')
                .any(|h| h.trim().eq_ignore_ascii_case(&s.smtp_host))
                && s.smtp_security != Security::TestPlain),
        "SMTP host requires operator approval and TLS",
    )?;
    let ips = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::net::lookup_host((s.smtp_host.as_str(), s.smtp_port)),
    )
    .await
    .map_err(|_| Error::Invalid("SMTP hostname resolution timed out"))?
    .map_err(|_| Error::Invalid("SMTP hostname cannot be resolved"))?
    .collect::<Vec<_>>();
    checked(
        !ips.is_empty()
            && ips.iter().all(|a| {
                if testing {
                    a.ip().is_loopback()
                } else {
                    crate::network_policy::public_address(a.ip())
                }
            }),
        "SMTP address is not allowed",
    )?;
    Ok(ips)
}
async fn tls(stream: Box<dyn Stream>, host: &str) -> Result<Box<dyn Stream>> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    if let Ok(path) = env::var("EMAIL_TLS_CA_FILE") {
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|_| Error::Invalid("Cannot load SMTP CA"))?;
        for cert in rustls_pemfile::certs(&mut bytes.as_slice()) {
            roots
                .add(cert.map_err(|_| Error::Invalid("Invalid SMTP CA"))?)
                .map_err(|_| Error::Invalid("Invalid SMTP CA"))?;
        }
    }
    let provider = Arc::new(tokio_rustls::rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|_| Error::Database)?
        .with_root_certificates(roots)
        .with_no_client_auth();
    let name = ServerName::try_from(host.to_owned())
        .map_err(|_| Error::Invalid("Invalid SMTP hostname"))?;
    let secured = TlsConnector::from(Arc::new(config))
        .connect(name, stream)
        .await
        .map_err(|_| Error::Invalid("SMTP TLS certificate or negotiation rejected"))?;
    Ok(Box::new(secured))
}
async fn reply(c: &mut Connection) -> Result<(u16, String)> {
    let mut out = String::new();
    let mut expected = None;
    loop {
        let mut line = String::new();
        let n = (&mut *c)
            .take(4097)
            .read_line(&mut line)
            .await
            .map_err(|_| Error::Uncertain)?;
        if n == 0 || n > 4096 || out.len() + n > 16384 {
            return Err(Error::Uncertain);
        }
        let code = line
            .get(..3)
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or(Error::Uncertain)?;
        if expected.is_some_and(|v| v != code) {
            return Err(Error::Uncertain);
        }
        expected = Some(code);
        let more = line.as_bytes().get(3) == Some(&b'-');
        out.push_str(&line);
        if !more {
            return Ok((code, out));
        }
    }
}
async fn command(c: &mut Connection, line: &str) -> Result<(u16, String)> {
    c.write_all(format!("{line}\r\n").as_bytes())
        .await
        .map_err(|_| Error::Uncertain)?;
    c.flush().await.map_err(|_| Error::Uncertain)?;
    reply(c).await
}
fn expect(code: u16, want: u16) -> Result<()> {
    if code == want {
        Ok(())
    } else if (400..600).contains(&code) {
        Err(Error::Invalid("SMTP explicitly rejected command"))
    } else {
        Err(Error::Uncertain)
    }
}
fn mime(m: &templates::Mail, key: &str) -> Result<Vec<u8>> {
    let mailbox = |name: String, email: &str| -> Result<Mailbox> {
        Ok(Mailbox::new(
            if name.is_empty() { None } else { Some(name) },
            email
                .parse()
                .map_err(|_| Error::Invalid("Invalid mailbox"))?,
        ))
    };
    let mut b = Message::builder()
        .from(mailbox(m.from_name.clone(), &m.from_email)?)
        .subject(&m.subject)
        .message_id(Some(format!(
            "<{key}@{}>",
            m.from_email.split('@').nth(1).unwrap_or("invalid")
        )));
    for email in &m.to {
        b = b.to(mailbox(String::new(), email)?);
    }
    for email in &m.cc {
        b = b.cc(mailbox(String::new(), email)?);
    }
    // BCC is envelope-only and never written to message headers.
    if !m.reply_to.is_empty() {
        b = b.reply_to(mailbox(String::new(), &m.reply_to)?);
    }
    let message = if m.html.is_empty() {
        b.singlepart(SinglePart::plain(m.text.clone()))
    } else {
        b.multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(m.text.clone()))
                .singlepart(SinglePart::html(m.html.clone())),
        )
    }
    .map_err(|_| Error::Invalid("Invalid MIME envelope"))?;
    Ok(message.formatted())
}
pub async fn deliver(
    s: &Settings,
    cred: &Credentials,
    m: &templates::Mail,
    key: &str,
) -> Result<Value> {
    // Timeout covers the whole conversation, not each command; after network ambiguity no resend.
    tokio::time::timeout(Duration::from_secs(8), conversation(s, cred, m, key))
        .await
        .map_err(|_| Error::Uncertain)?
}
async fn conversation(
    s: &Settings,
    cred: &Credentials,
    m: &templates::Mail,
    key: &str,
) -> Result<Value> {
    let targets = target(s).await?;
    let mut stream = None;
    for addr in targets {
        if let Ok(Ok(c)) =
            tokio::time::timeout(Duration::from_secs(2), TcpStream::connect(addr)).await
        {
            stream = Some(c);
            break;
        }
    }
    let stream: Box<dyn Stream> = Box::new(stream.ok_or(Error::Uncertain)?);
    let stream = if s.smtp_security == Security::Tls {
        tls(stream, &s.smtp_host).await?
    } else {
        stream
    };
    let mut c = BufReader::new(stream);
    expect(reply(&mut c).await?.0, 220)?;
    let (code, mut ehlo) = command(&mut c, "EHLO vendune").await?;
    expect(code, 250)?;
    if s.smtp_security == Security::Starttls {
        checked(
            ehlo.to_uppercase().contains("STARTTLS"),
            "SMTP STARTTLS unavailable",
        )?;
        expect(command(&mut c, "STARTTLS").await?.0, 220)?;
        checked(c.buffer().is_empty(), "Unexpected plaintext after STARTTLS")?;
        c = BufReader::new(tls(c.into_inner(), &s.smtp_host).await?);
        let (code, capabilities) = command(&mut c, "EHLO vendune").await?;
        expect(code, 250)?;
        ehlo = capabilities;
    }
    if !s.smtp_username.is_empty() {
        if ehlo.to_uppercase().contains("LOGIN") && !ehlo.to_uppercase().contains("PLAIN") {
            expect(command(&mut c, "AUTH LOGIN").await?.0, 334)?;
            expect(
                command(&mut c, &STANDARD.encode(&s.smtp_username)).await?.0,
                334,
            )?;
            expect(
                command(&mut c, &STANDARD.encode(&cred.smtp_password))
                    .await?
                    .0,
                235,
            )?;
        } else {
            let auth = STANDARD.encode(format!("\0{}\0{}", s.smtp_username, cred.smtp_password));
            expect(command(&mut c, &format!("AUTH PLAIN {auth}")).await?.0, 235)?;
        }
    }
    expect(
        command(&mut c, &format!("MAIL FROM:<{}>", m.from_email))
            .await?
            .0,
        250,
    )?;
    let mut rejected = 0;
    let mut accepted = 0;
    for email in m.to.iter().chain(&m.cc).chain(&m.bcc) {
        let code = command(&mut c, &format!("RCPT TO:<{email}>")).await?.0;
        if code == 250 || code == 251 {
            accepted += 1;
        } else if (400..600).contains(&code) {
            rejected += 1;
        } else {
            return Err(Error::Uncertain);
        }
    }
    checked(accepted > 0, "SMTP rejected all recipients")?;
    expect(command(&mut c, "DATA").await?.0, 354)?;
    let bytes = mime(m, key)?;
    let raw = String::from_utf8(bytes).map_err(|_| Error::Invalid("Invalid MIME encoding"))?;
    let escaped = raw.replace("\r\n.", "\r\n..");
    c.write_all(escaped.as_bytes())
        .await
        .map_err(|_| Error::Uncertain)?;
    c.write_all(b"\r\n.\r\n")
        .await
        .map_err(|_| Error::Uncertain)?;
    c.flush().await.map_err(|_| Error::Uncertain)?;
    expect(reply(&mut c).await?.0, 250)?;
    // QUIT cannot retroactively undo explicit DATA acceptance.
    // Drop the accepted connection immediately; a hanging QUIT must never make acceptance ambiguous.
    drop(c);
    Ok(
        json!({"outcome":"accepted","provider":"smtp","messageId":format!("<{key}@{}>",m.from_email.split('@').nth(1).unwrap_or("")),"rejectedRecipients":rejected}),
    )
}
