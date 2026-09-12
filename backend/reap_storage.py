"""Permanently remove the stored objects behind long-soft-deleted documents.

delete_document only flags a row, so the file stays in the `documents` bucket forever and
storage grows monotonically. This removes the object for rows soft-deleted longer ago than
the grace period. The `documents` row is kept as a tombstone: it records what was deleted,
by whom and when, and get_document_download_url already answers "This document's file is no
longer in storage" for a row whose object has gone.

Requires migrate_document_deleted_at.sql.

    python reap_storage.py                 # dry run -- lists what it would remove
    python reap_storage.py --apply         # actually removes them
    python reap_storage.py --days 90       # a longer grace period than the default 30

Dry run is the default because this is not reversible: once the object is gone the file is
gone, whatever the row still says.
"""

import argparse
from datetime import datetime, timedelta, timezone

from postgrest.exceptions import APIError
from storage3.exceptions import StorageApiError

from app.controllers.documents import DOCUMENTS_BUCKET
from app.db.supabase_client import supabase

DEFAULT_GRACE_DAYS = 30


def _object_exists(path: str) -> bool:
    """Whether the bucket still holds this object. Same probe seed_storage.py uses.

    ponytail: re-probes every eligible row on every run rather than recording that a row was
    reaped, so a long-dead row costs one request per run forever. Fine at a firm's volume;
    add a reaped_at column if the reap starts taking minutes.
    """
    try:
        supabase.storage.from_(DOCUMENTS_BUCKET).create_signed_url(path, 60)
        return True
    except StorageApiError:
        return False


def find_reapable(grace_days: int, now: datetime | None = None) -> list[dict]:
    """Soft-deleted documents whose grace period has run out and that still have a file_path.

    A row with is_deleted set but no deleted_at is skipped, not reaped: it predates the
    migration that backfills the column, and guessing its age would be guessing about
    permanent deletion.
    """
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=grace_days)
    rows = (
        supabase.table("documents")
        .select("document_id,file_name,file_path,deleted_at,case_id")
        .eq("is_deleted", True)
        .not_.is_("deleted_at", "null")
        .lt("deleted_at", cutoff.isoformat())
        .execute()
        .data
    )
    return [row for row in rows if row.get("file_path")]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="actually remove the objects (default: dry run)")
    parser.add_argument("--days", type=int, default=DEFAULT_GRACE_DAYS, help=f"grace period in days (default {DEFAULT_GRACE_DAYS})")
    args = parser.parse_args()

    if args.days < 1:
        parser.error("--days must be at least 1; a zero grace period defeats the point of a soft delete")

    try:
        rows = find_reapable(args.days)
    except APIError as err:
        # the column this whole script is keyed on; say so rather than dumping a traceback
        if "deleted_at" in str(err):
            raise SystemExit(
                "documents.deleted_at is missing -- run backend/migrate_document_deleted_at.sql\n"
                "in the Supabase SQL editor first, then re-run this."
            )
        raise

    if not rows:
        print(f"Nothing soft-deleted longer than {args.days} days ago. Nothing to reap.")
        return

    removed, already_gone = 0, 0
    for row in rows:
        path = row["file_path"]
        if not _object_exists(path):
            already_gone += 1
            continue
        if args.apply:
            supabase.storage.from_(DOCUMENTS_BUCKET).remove([path])
            print(f"removed {path}  ({row['file_name']}, case {row['case_id']}, deleted {row['deleted_at'][:10]})")
            removed += 1
        else:
            print(f"would remove {path}  ({row['file_name']}, case {row['case_id']}, deleted {row['deleted_at'][:10]})")
            removed += 1

    verb = "removed" if args.apply else "would be removed"
    print(f"\n{removed} object(s) {verb}, {already_gone} already gone from storage.")
    if not args.apply and removed:
        print("Dry run -- nothing was deleted. Re-run with --apply to remove them permanently.")


if __name__ == "__main__":
    main()
