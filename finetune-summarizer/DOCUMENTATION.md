# LexFlow — AI Summarization Fine-Tune: Documentation

Covers the "AI Document Summarization" feature only. Similar-Case Discovery and
Multilingual Summary use pretrained models directly (no fine-tuning) — see the
"Other AI features" note at the bottom.

## Model

| | |
|---|---|
| Base model | `Llama-3.2-1B-Instruct` (Meta), 4-bit quantized build: `unsloth/Llama-3.2-1B-Instruct-bnb-4bit` |
| Why this size, not Llama 3.1 8B (as in the original deck) | Fine-tuning runs locally on a laptop RTX 3050 with **4GB VRAM**. Unsloth's own QLoRA VRAM table: 8B ≈ 6GB, 7B ≈ 5GB, 3B ≈ 3.5GB — none of those reliably fit in 4GB alongside training overhead. 1B is the size that actually fits. |
| Fine-tuning method | QLoRA — base model loaded in 4-bit (bitsandbytes), LoRA adapters trained on top (rank 16, alpha 16, dropout 0), targeting all attention + MLP projection layers (`q/k/v/o_proj`, `gate/up/down_proj`) |
| Trainable params | ~0.5% of the base model — only the LoRA adapters are updated, base weights stay frozen |
| Library | [Unsloth](https://unsloth.ai) (2x faster / lower-memory LoRA training) + `trl.SFTTrainer` + `peft` |

## Data

### Fine-tuning data: IN-Abs

| | |
|---|---|
| What | Indian Supreme Court judgments paired with their official abstractive headnote summaries |
| Size used | 7,028 train pairs / 100 test pairs |
| Source | [Law-AI/summarization](https://github.com/Law-AI/summarization) dataset, published with the paper *"Legal Case Document Summarization: Extractive and Abstractive Methods and their Evaluation"* (AACL-IJCNLP 2022) |
| Download | [Zenodo record 7152317](https://zenodo.org/records/7152317) — `dataset.zip` (~98MB) |
| Original crawl source | Judgments crawled from [liiofindia.org](http://www.liiofindia.org/in/cases/cen/INSC/) (Legal Information Institute of India) by the dataset's authors |
| Jurisdiction | India only. The same zip also bundles `IN-Ext` (India, extractive-labeled, different format) and `UK-Abs` (UK Supreme Court) — both are explicitly excluded by the data-prep script, only the `IN-Abs/` folder is read. |
| Preprocessing | Each judgment truncated to first 4,000 characters (~1,000 words) so instruction + judgment + summary fits inside the 2,048-token training context used for the 1B model on 4GB VRAM |
| Script | [`data_prep/prepare_in_abs.py`](data_prep/prepare_in_abs.py) — downloads, extracts, pairs judgment↔summary files by filename, writes `data_prep/data/train.jsonl` and `test.jsonl` |
| Format per line | `{"instruction": "...", "input": "<judgment text>", "output": "<headnote summary>"}` |

### Corpus data (separate from fine-tuning): Similar Case Discovery

Not used for training — this is a retrieval corpus, embedded with a pretrained sentence-transformer and searched via FAISS (no model training involved).

| | |
|---|---|
| Source | [Indian High Court Judgments — AWS Open Data Registry](https://registry.opendata.aws/indian-high-court-judgments/) |
| Coverage | 25 Indian High Courts, 1950–2025, ~17.8M judgments, ~1.25 TiB (bucket `s3://indian-high-court-judgments/`, `ap-south-1`) |
| Cost | Free — AWS sponsors storage/transfer, no AWS account needed (`--no-sign-request`) |
| Recommended scope for this project | 1–2 courts × 3–5 recent years (a few thousand cases), not the full 1.25 TiB |

## How the fine-tune runs

1. **Load base model** in 4-bit (`FastLanguageModel.from_pretrained`, `load_in_4bit=True`, `max_seq_length=2048`).
2. **Attach LoRA adapters** (`FastLanguageModel.get_peft_model`) — rank 16, alpha 16, gradient checkpointing enabled (`use_gradient_checkpointing="unsloth"`) to further cut VRAM.
3. **Format each example** into a plain instruction/response template:
   ```
   ### Instruction:
   {instruction}

   ### Judgment:
   {input}

   ### Headnote Summary:
   {output}<|eot_id|>
   ```
4. **Train** via `trl.SFTTrainer`:

   | Hyperparameter | Value |
   |---|---|
   | Batch size | 1 (per device) |
   | Gradient accumulation | 8 steps → effective batch size 8 |
   | Epochs | 2 |
   | Learning rate | 2e-4 |
   | Optimizer | `adamw_8bit` |
   | Precision | bf16 if supported, else fp16 |
   | Max sequence length | 2048 tokens |

5. **Save** the LoRA adapter (a few hundred MB, not the full model) to `finetune/lora_adapter/`.

Script: [`finetune/finetune_llama_lora.py`](finetune/finetune_llama_lora.py).

## Verification done so far

- Data prep script run end-to-end against the real Zenodo file: produced exactly the expected 7,028/100 IN-Abs pairs, sample content manually checked (real judgment text + matching headnote), and confirmed the `IN-Ext`/`UK-Abs` folders bundled in the same zip are excluded.
- Local GPU environment: CUDA-enabled PyTorch installed and confirmed detecting the RTX 3050 (`torch.cuda.is_available() == True`).
- Full fine-tuning stack (`unsloth`, `bitsandbytes`, `trl`, `peft`, `accelerate`) installed in an isolated venv (kept off the OS drive, which was low on space).
- **5-step smoke test actually run on the GPU** (40-example subset): completed successfully, **peak VRAM usage 2.18GB** (comfortably under the 4GB card limit), training loss dropped 1.972 → 1.818 over 5 steps, confirming the model is learning and the config fits.
- Along the way, fixed several real bugs surfaced only by actually running the code (not just reading docs): an outdated `is_bfloat16_supported` API call, a renamed `SFTConfig` field (`max_seq_length` → `max_length`), a renamed `SFTTrainer` argument (`tokenizer` → `processing_class`), a missing chat-template registration for this quantized model repo (fixed via `unsloth.chat_templates.get_chat_template`), and — the actual root cause behind several of the above failures — `unsloth` must be imported *before* `trl`/`peft`, otherwise its patches don't apply to already-bound class references.
- A separate, more serious bug: passing a custom `formatting_func` to `SFTTrainer` silently dropped the training set from 7,028 rows to 8 (an internal batched-`map` interaction bug on this trl/unsloth version) — verified by checking `len(trainer.train_dataset)` directly before trusting the run. Fixed by precomputing a plain `text` column on the dataset instead (`dataset_text_field="text"`, trl's default), which is also the more standard approach.

## Full training run

Ran to completion on the local RTX 3050: all 7,028 pairs, 2 epochs, 1,758 steps, **~5.4 hours**, final training loss **1.879** (trended down from ~1.97 early to ~1.75-1.8 late). Adapter saved to `finetune/lora_adapter/` (45MB).

## Evaluation

`eval/evaluate_rouge.py` scores **zero-shot base model** vs **fine-tuned model** on the 100 held-out IN-Abs test pairs, using ROUGE-L against the reference headnotes — this comparison is the actual evidence that fine-tuning helped, not just that training ran.

**Result:**

| | ROUGE-L |
|---|---|
| Zero-shot base model | 0.1736 |
| Fine-tuned model | **0.2065** |

+0.033 absolute / ~19% relative improvement — the fine-tune measurably improved summary quality over the pretrained baseline.

## Other AI features (no fine-tuning, no training data needed)

Both built and verified end-to-end below. Neither involves training — both use pretrained models.

### Similar Case Discovery

| | |
|---|---|
| Model | `law-ai/InLegalBert` — pretrained on Indian legal text (statutes + judgments), loaded via sentence-transformers' auto mean-pooling wrapper, used only for embedding |
| Corpus | All IN-Abs judgments already on disk (train + test), chunked to 200 words each so long judgments get multiple vectors instead of one lossy whole-document vector |
| Index | FAISS `IndexFlatIP` over L2-normalized embeddings (= cosine similarity) |
| Scale | **159,492 chunk vectors** across the corpus |
| Scripts | `similar_cases/build_index.py` (builds `index.faiss` + `metadata.json`), `similar_cases/search.py` (queries it, ranks documents by their best-matching chunk) |
| Verified | Ran a real query judgment through `search.py`: correctly ranked the query document itself first (similarity 1.0, exact self-match sanity check), followed by genuinely related election-dispute cases |

### Multilingual Summary

| | |
|---|---|
| Model | `law-ai/InLegalTrans-En2Indic-1B` — IndicTrans2-1B fine-tuned by Law-AI on **MILPaC**, an Indian legal parallel corpus. Legal-domain tuning buys a large gain on legal text: per its model card, EN→HI BLEU 41.0 → 56.9, EN→MR 25.2 → 44.4, EN→BN 25.4 → 45.8 (vs. stock IndicTrans2-1B; the gain over the *distilled* 200M this replaced is larger still). Previously `ai4bharat/indictrans2-en-indic-dist-200M`. |
| VRAM | Measured on the RTX 3050 (4GB): **2.31GB peak reserved** (2.22GB allocated), vs 0.50GB for the old 200M — fits with ~1.7GB headroom. Requires loading in fp16 via `torch_dtype` at `from_pretrained` time; the old `.to(cuda)` then `.half()` order pushes 4.5GB of fp32 weights onto the card first and OOMs. |
| Script | `translation/translate.py` |
| Access | `law-ai/InLegalTrans-En2Indic-1B` itself is ungated (MIT), but it ships weights only — its `auto_map` delegates the config/model/tokenizer classes to `ai4bharat/indictrans2-en-indic-1B`, which **is** gated. So this needs that repo's terms accepted on HF (a separate acceptance from the `-dist-200M` repos), plus an `HF_TOKEN` |
| Environment | **Needs its own Python 3.11 venv**, separate from finetune/eval's. IndicTrans2's custom model code and `IndicTransToolkit` have transformers-version requirements that conflict with the bleeding-edge `transformers` unsloth needs (broke on `transformers==5.5.0`) and with each other below `4.38`. `transformers==4.38.0` + `accelerate` + `IndicTransToolkit` is the version that satisfies both. See `translation/requirements.txt` and the setup note at the top of `translate.py`. |
| Verified | Translated a real fine-tuned-model summary to Hindi — grammatically correct, meaning preserved (minor model-quality slip on one numeral, not a pipeline issue):<br>*"अपीलार्थी को धारा 305, आई. पी. सी. के तहत दोषी ठहराया गया और मौत की सजा सुनाई गई। उच्च न्यायालय ने दोषसिद्धि और सजा की पुष्टि की।..."* |

### Handling non-English input documents

The fine-tuned summarizer only understands English — it was trained exclusively on English IN-Abs judgments. Feeding it a Hindi or Marathi document wouldn't error, it would just silently produce a low-quality, incoherent summary. Since most Supreme/High Court judgments are in English this is an edge case, but client-submitted or lower-court documents in regional languages are realistic enough to need handling.

**Fix**: translate non-English input to English *before* summarizing, using IndicTrans2's other direction model (`ai4bharat/indictrans2-indic-en-dist-200M`, a separately-gated repo — needed its own HF access acceptance).

| | |
|---|---|
| Script | `translation/translate_to_english.py` (same venv/pattern as `translate.py`, opposite model) |
| Verified | Round-trip test (English → Hindi → back to English via this new script) preserved meaning correctly |
| Orchestration | `summarize_multilingual.sh` chains all three stages: non-English doc → `translate_to_english.py` → `summarize_long.py` → `translate.py` → client's language. Runs as separate process calls (not one importable pipeline) since the summarizer and translators live in incompatible Python environments. |
| Bug found & fixed | Unsloth prints its ASCII-art startup banner to **stdout**, not stderr. The orchestration script originally captured the summarizer's stdout to a file, which grabbed Unsloth's banner text instead of the real summary — that garbage then got "translated" into Hindi nonsense. Fixed by having `summarize_long.py` write its result to an explicit output file argument instead of relying on stdout being clean. |
| Verified end-to-end | Hindi document → English → English summary → Hindi summary, full chain, coherent output with correct facts→"HELD" structure (some repeated sub-points — a 1B-model quality ceiling, not a pipeline bug) |
