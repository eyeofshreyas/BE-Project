# Setup Guide (for teammates)

This project uses **two separate Python venvs** because the fine-tuning stack
(`unsloth`) and the translation stack (`IndicTrans2`) need conflicting
`transformers` versions. See `DOCUMENTATION.md` for why; this doc is just the
steps to get everything running.

## 0. Get the repo and the pre-trained artifact

```bash
git clone https://github.com/eyeofshreyas/BE-Project.git
cd BE-Project
git checkout feature/ai_models
cd finetune-summarizer
```

Ask whoever ran the training for `finetune/lora_adapter/` (223MB) and drop it
in at `finetune-summarizer/finetune/lora_adapter/` -- it's gitignored (too big
for GitHub) and takes ~5 hours to retrain on a small GPU, so don't redo that
unless you specifically want to retrain.

## 1. Main venv (fine-tuning, eval, inference, similar-case search)

Needs a CUDA GPU (tested on 4GB VRAM) -- CPU works too, just slower.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
```

## 2. Regenerate the data + index (not stored in git, both cheap to rebuild)

```bash
cd data_prep && python3 prepare_in_abs.py && cd ..     # ~3 min, downloads from Zenodo
cd similar_cases && python3 build_index.py && cd ..    # ~9 min, embeds the corpus
```

## 3. Translation venv (separate, Python 3.11)

The old `transformers==4.38.0` that IndicTrans2's custom code needs has no
prebuilt wheels for Python 3.13, so this venv uses 3.11 specifically. If you
don't have Python 3.11: `pip install --user` won't get you there -- use
`pyenv`, your OS package manager, or download it from python.org.

```bash
cd translation
python3.11 -m venv .venv
source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu126
pip install -r requirements.txt
cd ..
```

## 4. Hugging Face account (needed only for translation)

The IndicTrans2 models are gated. Each person needs **their own** account and
token -- don't share tokens.

1. Create a free account at https://huggingface.co/join
2. Accept the terms on **both** of these (yes, separately, they're different repos):
   - https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M
   - https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M
3. Get a token from https://huggingface.co/settings/tokens
4. `export HF_TOKEN=your_token_here` before running any translation script

## 5. Test everything

From `finetune-summarizer/`, with the right venv active for each:

```bash
# summarization (main venv)
cd inference && source ../.venv/bin/activate && python3 summarize_long.py path/to/judgment.txt

# similar case search (main venv)
cd similar_cases && source ../.venv/bin/activate && python3 search.py path/to/judgment.txt

# translation (translation venv, needs HF_TOKEN)
cd translation && source .venv/bin/activate
python3 translate.py "some English text" hin_Deva
python3 translate_to_english.py path/to/hindi_doc.txt hin_Deva

# full multilingual pipeline (chains both venvs automatically)
export HF_TOKEN=your_token_here
./summarize_multilingual.sh path/to/document.txt hin_Deva hin_Deva

# re-check fine-tune quality numbers (main venv)
cd eval && source ../.venv/bin/activate && python3 evaluate_rouge.py
```

Sample judgments to test with: `data_prep/raw/dataset/IN-Abs/test-data/judgement/*.txt`
(real Supreme Court judgments, none of them used in training).
