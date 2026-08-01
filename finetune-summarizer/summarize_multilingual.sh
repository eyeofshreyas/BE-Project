#!/usr/bin/env bash
# Orchestrates: non-English document -> English -> fine-tuned summary -> client's language.
#
# Chains three scripts that deliberately live in separate, incompatible
# Python venvs (the summarizer needs unsloth's bleeding-edge transformers;
# the translators need an old transformers pinned for IndicTrans2's custom
# model code) -- so this happens as separate process calls, not one
# importable pipeline. A real backend would do the same thing: call each
# model as its own service/subprocess.
#
# Usage: ./summarize_multilingual.sh document.txt <src_lang> [tgt_lang]
#   src_lang: eng_Latn if the document is already English, otherwise e.g. hin_Deva
#   tgt_lang: optional -- language to translate the final summary into.
#             Omit to get the summary in English only.
#
# Needs HF_TOKEN set in your environment (gated IndicTrans2 models).
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 document.txt <src_lang> [tgt_lang]" >&2
    exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC="$1"
SRC_LANG="$2"
TGT_LANG="${3:-}"

TMP_EN="$(mktemp)"
TMP_SUMMARY="$(mktemp)"
trap 'rm -f "$TMP_EN" "$TMP_SUMMARY"' EXIT

if [ "$SRC_LANG" = "eng_Latn" ]; then
    cp "$DOC" "$TMP_EN"
else
    echo "Translating input ($SRC_LANG -> English)..." >&2
    (source "$HERE/translation/.venv/bin/activate" && python3 "$HERE/translation/translate_to_english.py" "$DOC" "$SRC_LANG") > "$TMP_EN"
fi

echo "Summarizing..." >&2
(source "$HERE/.venv/bin/activate" && cd "$HERE/inference" && python3 summarize_long.py "$TMP_EN" "$TMP_SUMMARY")

if [ -n "$TGT_LANG" ] && [ "$TGT_LANG" != "eng_Latn" ]; then
    echo "Translating summary to $TGT_LANG..." >&2
    SUMMARY_TEXT="$(cat "$TMP_SUMMARY")"
    (source "$HERE/translation/.venv/bin/activate" && python3 "$HERE/translation/translate.py" "$SUMMARY_TEXT" "$TGT_LANG")
else
    cat "$TMP_SUMMARY"
fi
