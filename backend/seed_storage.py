"""Upload a placeholder file for every `documents` row whose storage object is missing.

seed.sql inserts document rows whose file_path points at objects that were never uploaded, so
Preview / Open / Download answer 404 for them. Run this once (`python seed_storage.py`) to fill
those gaps with a clearly-labelled placeholder so the documents table works end to end.
Idempotent: rows whose object already exists are left alone.
"""

from storage3.exceptions import StorageApiError

from app.controllers.documents import DOCUMENTS_BUCKET
from app.db.supabase_client import supabase


def placeholder_pdf(title: str) -> bytes:
    """A minimal one-page PDF saying what it is. Hand-built so this needs no PDF dependency."""
    text = f"Placeholder for {title} -- seeded by seed_storage.py, not a real document."
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        None,  # content stream, built below
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 11 Tf 60 760 Td ({text}) Tj ET".encode("latin-1", "replace")
    objs[3] = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (i, body)

    xref_at = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref_at)
    return bytes(out)


def main() -> None:
    rows = supabase.table("documents").select(
        "document_id,file_name,file_path,mime_type"
    ).eq("is_deleted", False).execute().data

    filled, already = 0, 0
    for row in rows:
        try:
            supabase.storage.from_(DOCUMENTS_BUCKET).create_signed_url(row["file_path"], 60)
            already += 1
            continue
        except StorageApiError:
            pass

        name = row["file_name"] or row["file_path"]
        mime = row["mime_type"] or "application/octet-stream"
        content = placeholder_pdf(name) if mime == "application/pdf" else f"Placeholder for {name}.\n".encode()
        supabase.storage.from_(DOCUMENTS_BUCKET).upload(row["file_path"], content, {"content-type": mime})
        print(f"uploaded placeholder: {row['file_path']}")
        filled += 1

    print(f"\n{filled} placeholder(s) uploaded, {already} already in storage.")


if __name__ == "__main__":
    main()
