"""
Translates AI-generated case summaries into the client's preferred Indian
language via InLegalTrans (Law-AI) -- IndicTrans2-1B fine-tuned on MILPaC,
an Indian legal parallel corpus. Pretrained, inference only, no training here.

Legal-domain fine-tune, so it beats stock IndicTrans2 substantially on legal
text (per its model card, EN-to-HI BLEU 41.0 -> 56.9, EN-to-MR 25.2 -> 44.4).
Custom model code and the tokenizer both come from the ai4bharat 1B repo --
the law-ai repo only ships weights and auto_maps the classes back to it. That
repo is gated, so it needs its terms accepted on HF once (same as the dist
repos), on top of HF_TOKEN.

Loaded in fp16 at from_pretrained time, not with a .half() after .to(cuda):
1.12B params in fp32 is ~4.5GB and OOMs the 4GB card on the way in. Measured
peak on an RTX 3050 (4GB): 2.31GB reserved, vs 0.50GB for the old 200M.
Summaries are short (a few sentences), so this skips the heavy
sentence-segmentation dependencies (mosestokenizer/indicnlp) that
AI4Bharat's own example uses for long multi-paragraph documents, and
passes the whole summary as one batch item instead -- fine for short
text, would need real sentence splitting for paragraph-length input.

Needs its own venv, separate from finetune/eval's -- IndicTrans2's custom
model code and IndicTransToolkit have conflicting transformers version
requirements from what unsloth needs (transformers 5.5.0 broke the custom
tokenizer's internals; IndicTransToolkit's collator needs a helper only
added in transformers>=4.38). 4.38.0 is the version where both are happy.
That old version also has no prebuilt `tokenizers` wheels for Python 3.13
(source build fails against a modern Rust compiler), so this venv uses
Python 3.11 instead:
    /home/shreyas/.local/bin/python3.11 -m venv .venv
    source .venv/bin/activate
    pip install torch --index-url https://download.pytorch.org/whl/cu126
    pip install transformers==4.38.0 accelerate IndicTransToolkit sentencepiece

Usage:
    python3 translate.py "text to translate" hin_Deva
    python3 translate.py --self-check      # number-preservation asserts, no model load
Target language codes (FLORES-200 style), a few common ones:
    hin_Deva (Hindi), mar_Deva (Marathi), tam_Taml (Tamil),
    tel_Telu (Telugu), ben_Beng (Bengali), guj_Gujr (Gujarati)
"""
import re
import sys

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL_NAME = "law-ai/InLegalTrans-En2Indic-1B"
TOKENIZER_NAME = "ai4bharat/indictrans2-en-indic-1B"  # law-ai repo has no tokenizer script of its own
SRC_LANG = "eng_Latn"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def load_model():
    """Loads the InLegalTrans 1B checkpoint + IndicTrans2 tokenizer (fp16 on GPU) and an IndicProcessor
    for pre/post-processing translation batches."""
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME, trust_remote_code=True)
    dtype = torch.float16 if DEVICE == "cuda" else torch.float32
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME, trust_remote_code=True, low_cpu_mem_usage=True, torch_dtype=dtype,
    ).to(DEVICE)
    model.eval()
    ip = IndicProcessor(inference=True)
    return model, tokenizer, ip


def restore_numbers(source, translated):
    """Copies the numbers in `source` over the numbers in `translated`, positionally.

    IndicTrans2 (and InLegalTrans with it) corrupts digits: "Section 302" comes back as 303 in
    4 of 6 target languages. In a legal summary that is not cosmetic -- IPC 302 and 303 are
    different offences -- and the model gives no way to protect them, so the source numbers are
    treated as ground truth and pasted back. Also covers dates, case numbers and amounts.
    `\d` is Unicode-aware, so native-script digits (Devanagari, etc.) are matched too.

    Raises ValueError if the counts differ -- then there is no safe positional mapping, and
    failing is better than silently emitting the wrong section number."""
    src_nums = re.findall(r"\d+", source)
    out_nums = re.findall(r"\d+", translated)
    if len(src_nums) != len(out_nums):
        raise ValueError(
            f"translation changed how many numbers there are ({len(src_nums)} in the source, "
            f"{len(out_nums)} in the output); refusing to guess which number maps to which"
        )
    remaining = iter(src_nums)
    return re.sub(r"\d+", lambda _: next(remaining), translated)


def _self_check():
    """Asserts restore_numbers() on the real observed failure plus its edge cases."""
    # the actual bug: InLegalTrans renders "Section 302" as Marathi "कलम 303"
    assert restore_numbers("under Section 302 of the IPC", "कलम 303 अन्वये") == "कलम 302 अन्वये"
    # several numbers keep their order
    assert restore_numbers("Section 302 on 5 March 2019", "धारा 303 ... 6 ... 2018") == "धारा 302 ... 5 ... 2019"
    # correct translations are left alone
    assert restore_numbers("Section 302", "धारा 302") == "धारा 302"
    # no numbers at all is a no-op
    assert restore_numbers("the appeal is allowed", "अपील मंजूर की जाती है") == "अपील मंजूर की जाती है"
    # native-script digits are matched by \d too
    assert restore_numbers("Section 302", "धारा ३०३") == "धारा 302"
    # a dropped number is refused, not guessed
    try:
        restore_numbers("Sections 302 and 34", "धारा 303")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError on a number-count mismatch")
    print("self-check OK")


def translate(text, tgt_lang, model, tokenizer, ip):
    """Translates a single English text string (e.g. a case summary) into tgt_lang via beam search,
    using the model/tokenizer/processor returned by `load_model()`."""
    batch = ip.preprocess_batch([text], src_lang=SRC_LANG, tgt_lang=tgt_lang)
    inputs = tokenizer(
        batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True,
    ).to(DEVICE)

    with torch.no_grad():
        generated_tokens = model.generate(
            **inputs, use_cache=True, min_length=0, max_length=256, num_beams=5, num_return_sequences=1,
        )

    decoded = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return restore_numbers(text, ip.postprocess_batch(decoded, lang=tgt_lang)[0])


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
        sys.exit(0)
    if len(sys.argv) < 3:
        print('Usage: python3 translate.py "text to translate" hin_Deva')
        sys.exit(1)

    text, tgt_lang = sys.argv[1], sys.argv[2]
    model, tokenizer, ip = load_model()
    print(translate(text, tgt_lang, model, tokenizer, ip))
