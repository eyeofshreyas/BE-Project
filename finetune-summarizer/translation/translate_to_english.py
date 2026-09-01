"""
Translates a non-English judgment/document (Hindi, Marathi, etc.) into
English via IndicTrans2's indic-en checkpoint, so it can be fed into the
English-only fine-tuned summarizer. Mirrors translate.py's en-indic
direction -- same venv, same IndicProcessor pattern, opposite model.

Usage:
    python3 translate_to_english.py path/to/document.txt hin_Deva
Source language codes, a few common ones:
    hin_Deva (Hindi), mar_Deva (Marathi), tam_Taml (Tamil),
    tel_Telu (Telugu), ben_Beng (Bengali), guj_Gujr (Gujarati)
"""
import sys

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from IndicTransToolkit.processor import IndicProcessor

MODEL_NAME = "ai4bharat/indictrans2-indic-en-dist-200M"
TGT_LANG = "eng_Latn"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def load_model():
    """Loads the IndicTrans2 indic-en distilled 200M checkpoint + tokenizer (fp16 on GPU) and an
    IndicProcessor for pre/post-processing translation batches."""
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME, trust_remote_code=True, low_cpu_mem_usage=True,
    ).to(DEVICE)
    if DEVICE == "cuda":
        model.half()
    model.eval()
    ip = IndicProcessor(inference=True)
    return model, tokenizer, ip


def translate_to_english(text, src_lang, model, tokenizer, ip):
    """Translates a non-English document from src_lang into English via beam search, so it can be fed
    into the English-only fine-tuned summarizer (`inference.summarize_long`). Mirrors
    `translate.translate()` in the opposite direction, using the model/tokenizer/processor from `load_model()`."""
    batch = ip.preprocess_batch([text], src_lang=src_lang, tgt_lang=TGT_LANG)
    inputs = tokenizer(
        batch, truncation=True, padding="longest", return_tensors="pt", return_attention_mask=True,
    ).to(DEVICE)

    with torch.no_grad():
        generated_tokens = model.generate(
            **inputs, use_cache=True, min_length=0, max_length=256, num_beams=5, num_return_sequences=1,
        )

    decoded = tokenizer.batch_decode(generated_tokens, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return ip.postprocess_batch(decoded, lang=TGT_LANG)[0]


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 translate_to_english.py path/to/document.txt hin_Deva")
        sys.exit(1)

    text, src_lang = open(sys.argv[1]).read(), sys.argv[2]
    model, tokenizer, ip = load_model()
    print(translate_to_english(text, src_lang, model, tokenizer, ip))
