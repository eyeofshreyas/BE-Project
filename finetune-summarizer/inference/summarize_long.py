"""
Summarizes judgments longer than the model's 2048-token context via
map-reduce chunking: summarize each chunk, then summarize those summaries
into one final headnote. Short judgments (most of IN-Abs) skip chunking
and go through the model in a single pass, same as during training.

Usage:
    python3 summarize_long.py path/to/judgment.txt
    python3 summarize_long.py --demo   (chunking logic only, no GPU/model needed)
"""
import sys

MODEL_NAME = "unsloth/Llama-3.2-1B-Instruct-bnb-4bit"
ADAPTER_DIR = "../finetune/lora_adapter"
MAX_SEQ_LENGTH = 2048
CHUNK_TOKENS = 1200  # leaves room for instruction + template + generated summary within 2048

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


def load_model():
    from unsloth import FastLanguageModel  # must import before trl/transformers/peft
    from peft import PeftModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME, max_seq_length=MAX_SEQ_LENGTH, load_in_4bit=True,
    )
    model = PeftModel.from_pretrained(model, ADAPTER_DIR)
    FastLanguageModel.for_inference(model)
    return model, tokenizer


def chunk_by_tokens(tokenizer, text, max_tokens=CHUNK_TOKENS):
    ids = tokenizer(text, add_special_tokens=False)["input_ids"]
    return [tokenizer.decode(ids[i:i + max_tokens]) for i in range(0, len(ids), max_tokens)]


def generate(model, tokenizer, prompt, max_new_tokens=220):
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LENGTH).to(model.device)
    out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def summarize(model, tokenizer, judgment_text):
    chunks = chunk_by_tokens(tokenizer, judgment_text)
    if len(chunks) == 1:
        return generate(model, tokenizer, MAP_PROMPT.format(text=chunks[0]))

    chunk_summaries = [generate(model, tokenizer, MAP_PROMPT.format(text=c)) for c in chunks]
    combined = "\n".join(chunk_summaries)
    return generate(model, tokenizer, REDUCE_PROMPT.format(text=combined))


def _demo():
    # smallest runnable check for the chunking split logic -- no GPU/model needed
    class FakeTokenizer:
        def __call__(self, text, add_special_tokens=False):
            return {"input_ids": text.split()}

        def decode(self, ids):
            return " ".join(ids)

    tok = FakeTokenizer()
    assert len(chunk_by_tokens(tok, "word " * 100, max_tokens=1200)) == 1
    assert len(chunk_by_tokens(tok, "word " * 3000, max_tokens=1200)) == 3
    print("demo passed")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--demo":
        _demo()
        sys.exit(0)

    if len(sys.argv) < 2:
        print("Usage: python3 summarize_long.py path/to/judgment.txt [output_file]")
        sys.exit(1)

    judgment_text = open(sys.argv[1]).read()
    model, tokenizer = load_model()
    result = summarize(model, tokenizer, judgment_text)

    if len(sys.argv) > 2:
        # unsloth prints its startup banner to stdout, which would otherwise
        # contaminate a `> file` redirect -- write the real result explicitly
        # instead of relying on being the only thing printed.
        with open(sys.argv[2], "w") as f:
            f.write(result)
    else:
        print(result)
