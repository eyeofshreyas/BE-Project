"""
Summarizes text longer than the model's context via map-reduce chunking:
summarize each chunk, then summarize those summaries into one final output.
Short inputs skip chunking and go through the model in a single pass, same
as during training.

Two modes, because they are different jobs:
  "judgment" -- a court judgment in, a headnote out. Uses the LoRA adapter,
                which was fine-tuned on exactly this (IN-Abs judgment ->
                headnote) with exactly the MAP_PROMPT wording.
  "case"     -- a case file in (notes, hearings, document summaries), a brief
                out. Skips the adapter: on a case file the adapter is a
                specialist pulled off its distribution, and it fills gaps with
                invented judgment boilerplate. The base instruct model with a
                plain brief prompt stays closer to the facts it is given.

Usage:
    python3 summarize_long.py path/to/judgment.txt
    python3 summarize_long.py path/to/case_notes.txt --mode case
    python3 summarize_long.py --demo   (chunking logic only, no GPU/model needed)
"""
import os
import sys

# Override to run a larger base model -- e.g. SUMMARIZER_MODEL=unsloth/Llama-3.2-3B-Instruct-bnb-4bit.
# The adapter was trained against the 1B, so a different base is only valid for mode="case",
# which does not load it.
MODEL_NAME = os.environ.get("SUMMARIZER_MODEL", "unsloth/Llama-3.2-1B-Instruct-bnb-4bit")
ADAPTER_DIR = "../finetune/lora_adapter"
MAX_SEQ_LENGTH = 2048
CHUNK_TOKENS = 1200  # leaves room for instruction + template + generated summary within 2048
REPETITION_PENALTY = 1.15
NO_REPEAT_NGRAM = 6  # legal prose reuses short phrases ("the High Court held"); 6 spares those
MAX_NEW_TOKENS = 400  # 220 cut briefs off mid-clause; trim_to_sentence() handles the tail
SENTENCE_ENDINGS = (".", "!", "?")

CASE_MAP_PROMPT = """### Instruction:
Summarize this section of an Indian law firm's case file. Use only the facts given; do not invent
parties, dates or findings.

### Case File:
{text}

### Summary:
"""

CASE_REDUCE_PROMPT = """### Instruction:
You are briefing the lawyer responsible for this case. Using only the section summaries below,
write 4-6 sentences covering what the dispute is about, where it currently stands, and what
happens next. Do not invent parties, dates or findings.

### Section Summaries:
{text}

### Case Brief:
"""

MAP_PROMPT = """### Instruction:
Summarize the following excerpt from an Indian Supreme Court judgment in a concise legal headnote.

### Judgment:
{text}

### Headnote Summary:
"""

REDUCE_PROMPT = """### Instruction:
Combine the following section summaries of an Indian Supreme Court judgment into a single concise legal headnote.

### Section Summaries:
{text}

### Headnote Summary:
"""


def load_model(use_adapter=True):
    """Loads the 4-bit base model, switched into inference mode. With use_adapter, applies the
    LoRA adapter from ADAPTER_DIR (produced by `finetune.finetune_llama_lora.main()`) -- that
    adapter only knows judgments, so case-file briefs load the base model alone."""
    from unsloth import FastLanguageModel  # must import before trl/transformers/peft

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME, max_seq_length=MAX_SEQ_LENGTH, load_in_4bit=True,
    )
    if use_adapter:
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, ADAPTER_DIR)
    FastLanguageModel.for_inference(model)
    return model, tokenizer


def trim_to_sentence(text):
    """Cuts text back to its last sentence ending, so hitting the token cap mid-clause doesn't
    leave a dangling "...maintainable even though". Returns text unchanged if it has no ending."""
    cut = max(text.rfind(end) for end in SENTENCE_ENDINGS)
    return text[:cut + 1].strip() if cut != -1 else text.strip()


def chunk_by_tokens(tokenizer, text, max_tokens=CHUNK_TOKENS):
    """Splits text into a list of decoded substrings, each at most max_tokens tokens long."""
    ids = tokenizer(text, add_special_tokens=False)["input_ids"]
    return [tokenizer.decode(ids[i:i + max_tokens]) for i in range(0, len(ids), max_tokens)]


def generate(model, tokenizer, prompt, max_new_tokens=MAX_NEW_TOKENS):
    """Runs greedy generation on a single prompt and returns the decoded completion text.

    Greedy decoding on a 1B model falls into a sentence-level loop on short or thin input (case
    notes rather than a full judgment), restating one clause until max_new_tokens runs out.
    NO_REPEAT_NGRAM blocks the loop outright and REPETITION_PENALTY discourages it earlier;
    both stay off the sampling path so output is still deterministic."""
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LENGTH).to(model.device)
    out = model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        do_sample=False,
        repetition_penalty=REPETITION_PENALTY,
        no_repeat_ngram_size=NO_REPEAT_NGRAM,
    )
    completion = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return trim_to_sentence(completion)


def prompts_for(mode):
    """The (map, reduce) prompt pair for a mode -- see the module docstring."""
    return (CASE_MAP_PROMPT, CASE_REDUCE_PROMPT) if mode == "case" else (MAP_PROMPT, REDUCE_PROMPT)


def summarize(model, tokenizer, text, mode="judgment"):
    """Map-reduce summarization: chunks text, summarizes each chunk, then (if more than one chunk)
    reduces those into one final summary. A single-chunk case file still goes through the reduce
    prompt, because that is the one that asks for a brief rather than a section summary.
    Calls: `prompts_for()`, `chunk_by_tokens()`, `generate()`."""
    map_prompt, reduce_prompt = prompts_for(mode)
    chunks = chunk_by_tokens(tokenizer, text)

    if len(chunks) == 1:
        if mode != "case":
            return generate(model, tokenizer, map_prompt.format(text=chunks[0]))
        return generate(model, tokenizer, reduce_prompt.format(text=chunks[0]))

    chunk_summaries = [generate(model, tokenizer, map_prompt.format(text=c)) for c in chunks]
    combined = "\n".join(chunk_summaries)
    return generate(model, tokenizer, reduce_prompt.format(text=combined))


def _demo():
    """Self-check for `chunk_by_tokens()` using a fake whitespace tokenizer, no GPU/model needed."""
    # smallest runnable check for the chunking split logic -- no GPU/model needed
    class FakeTokenizer:
        def __call__(self, text, add_special_tokens=False):
            return {"input_ids": text.split()}

        def decode(self, ids):
            return " ".join(ids)

    tok = FakeTokenizer()
    assert len(chunk_by_tokens(tok, "word " * 100, max_tokens=1200)) == 1
    assert len(chunk_by_tokens(tok, "word " * 3000, max_tokens=1200)) == 3

    assert trim_to_sentence("Filed in March. Heard in April. The court then") == "Filed in March. Heard in April."
    assert trim_to_sentence("  no ending here  ") == "no ending here"
    assert prompts_for("case")[1] is CASE_REDUCE_PROMPT
    assert prompts_for("judgment")[0] is MAP_PROMPT
    print("demo passed")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        _demo()
        sys.exit(0)

    if len(sys.argv) < 2:
        print("Usage: python3 summarize_long.py path/to/judgment.txt [output_file]")
        sys.exit(1)

    mode = "case" if "--mode" in sys.argv and "case" in sys.argv else "judgment"
    judgment_text = open(sys.argv[1]).read()
    model, tokenizer = load_model(use_adapter=mode != "case")
    result = summarize(model, tokenizer, judgment_text, mode=mode)

    if len(sys.argv) > 2:
        # unsloth prints its startup banner to stdout, which would otherwise
        # contaminate a `> file` redirect -- write the real result explicitly
        # instead of relying on being the only thing printed.
        with open(sys.argv[2], "w") as f:
            f.write(result)
    else:
        print(result)
