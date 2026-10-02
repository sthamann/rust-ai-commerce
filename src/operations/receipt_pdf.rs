//! Minimal paginated PDF serializer with WinAnsi Helvetica; snapshot retains complete Unicode originals.
pub(super) fn render(lines: &[String]) -> Vec<u8> {
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        vec![],
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];
    let wrapped = lines
        .iter()
        .flat_map(|s| {
            s.split('\n').flat_map(|line| {
                let chars = line.chars().collect::<Vec<_>>();
                if chars.is_empty() {
                    vec![String::new()]
                } else {
                    chars
                        .chunks(90)
                        .map(|c| c.iter().collect::<String>())
                        .collect()
                }
            })
        })
        .collect::<Vec<_>>();
    let chunks = wrapped.chunks(42).collect::<Vec<_>>();
    let mut pages = vec![];
    for chunk in chunks {
        let page = objects.len() + 1;
        pages.push(format!("{page} 0 R"));
        let content = page + 1;
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {content} 0 R >>").into_bytes());
        let mut stream = b"BT /F1 11 Tf 48 790 Td 17 TL
"
        .to_vec();
        for line in chunk {
            stream.push(b'(');
            for ch in line.chars() {
                let byte = match ch {
                    '€' => 128,
                    c if (32..=255).contains(&(c as u32)) => c as u8,
                    _ => b'?',
                };
                if b"()\\".contains(&byte) {
                    stream.push(b'\\');
                }
                stream.push(byte);
            }
            stream.extend_from_slice(
                b") Tj T*
",
            );
        }
        stream.extend_from_slice(
            b"ET
",
        );
        let mut body = format!(
            "<< /Length {} >>
stream
",
            stream.len()
        )
        .into_bytes();
        body.extend(stream);
        body.extend_from_slice(b"endstream");
        objects.push(body);
    }
    objects[1] = format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        pages.join(" "),
        pages.len()
    )
    .into_bytes();
    let mut pdf = b"%PDF-1.4
"
    .to_vec();
    let mut offsets = vec![0];
    for (i, obj) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend(
            format!(
                "{} 0 obj
",
                i + 1
            )
            .as_bytes(),
        );
        pdf.extend(obj);
        pdf.extend_from_slice(
            b"
endobj
",
        );
    }
    let xref = pdf.len();
    pdf.extend(
        format!(
            "xref
0 {}
0000000000 65535 f 
",
            offsets.len()
        )
        .as_bytes(),
    );
    for n in offsets.iter().skip(1) {
        pdf.extend(
            format!(
                "{n:010} 00000 n 
"
            )
            .as_bytes(),
        );
    }
    pdf.extend(
        format!(
            "trailer
<< /Size {} /Root 1 0 R >>
startxref
{xref}
%%EOF
",
            offsets.len()
        )
        .as_bytes(),
    );
    pdf
}
#[cfg(test)]
mod tests {
    #[test]
    fn valid_document() {
        let pdf = super::render(&vec!["Rechnung (Test) München".into(); 85]);
        let text = pdf_extract::extract_text_from_mem(&pdf).unwrap();
        assert!(text.contains("Rechnung"));
        assert!(text.contains("München"));
    }
}
