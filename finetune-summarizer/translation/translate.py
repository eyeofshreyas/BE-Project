"""
Translates AI-generated case summaries into the client's preferred Indian
language via IndicTrans2 (AI4Bharat) -- a pretrained translation model,
used at inference time only, no training involved.

Uses the distilled 200M checkpoint (not the 1B one) to fit comfortably on
a 4GB GPU. Summaries are short (a few sentences), so this skips the heavy
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
Target language codes (FLORES-200 style), a few common ones:
    hin_Deva (Hindi), mar_Deva (Marathi), tam_Taml (Tamil),
    tel_Telu (Telugu), ben_Beng (Bengali), guj_Gujr (Gujarati)
"""
import sys

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL_NAME = "ai4bharat/indictrans2-en-indic-dist-200M"
SRC_LANG = "eng_Latn"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def load_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME, trust_remote_code=True, low_cpu_mem_usage=True,
    ).to(DEVICE)
    if DEVICE == "cuda":
        model.half()
    model.eval()
    ip = IndicProcessor(inference=True)
    return model, tokenizer, ip


def translate(text, tgt_lang, model, tokenizer, ip):
    batch = ip.preprocess_batch([text], src_lang=SRC_LANG, tgt_lang=tgt_lang)
    inputs = tokenizer(
        batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True,
    ).to(DEVICE)

    with torch.no_grad():
        generated_tokens = model.generate(
            **inputs, use_cache=True, min_length=0, max_length=256, num_beams=5, num_return_sequences=1,
        )

    decoded = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return ip.postprocess_batch(decoded, lang=tgt_lang)[0]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Usage: python3 translate.py "text to translate" hin_Deva')
        sys.exit(1)

    text, tgt_lang = sys.argv[1], sys.argv[2]
    model, tokenizer, ip = load_model()
    print(translate(text, tgt_lang, model, tokenizer, ip))
