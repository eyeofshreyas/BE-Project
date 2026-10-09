"""
Compares zero-shot Llama-3.2-1B-Instruct vs the fine-tuned LoRA adapter on two
held-out test sets -- IN-Abs and a sampled ILC test split (data_prep/prepare_ilc.py)
-- scored with ROUGE-L against the reference headnotes. Run after
finetune_llama_lora.py has produced ./lora_adapter.
"""
import json

from unsloth import FastLanguageModel  # must import before trl/transformers/peft
from peft import PeftModel
from rouge_score import rouge_scorer

MODEL_NAME = "unsloth/Llama-3.2-1B-Instruct-bnb-4bit"
ADAPTER_DIR = "../finetune/lora_adapter"
MAX_SEQ_LENGTH = 2048

EVAL_SETS = {
    "IN-Abs": "../data_prep/data/test.jsonl",
    "ILC": "../data_prep/data/ilc_test.jsonl",
}

PROMPT = """### Instruction:
{instruction}

### Judgment:
{input}

### Headnote Summary:
"""


def load_test_set(path):
    """Loads a JSONL eval split (produced by prepare_in_abs.py or prepare_ilc.py) into a list of dicts."""
    with open(path) as f:
        return [json.loads(line) for line in f]


def generate(model, tokenizer, example, max_new_tokens=256):
    """Formats a test example into the eval PROMPT (no reference summary), runs greedy generation, and
    returns the decoded completion text."""
    prompt = PROMPT.format(**example)
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LENGTH).to(model.device)
    out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return text.strip()


def score(predictions, references):
    """Computes the mean ROUGE-L F-measure across paired predictions and reference summaries."""
    scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=True)
    scores = [scorer.score(ref, pred)["rougeL"].fmeasure for pred, ref in zip(predictions, references)]
    return sum(scores) / len(scores)


def evaluate(finetuned_model, tokenizer, test_set):
    """Scores one eval set's zero-shot (adapter disabled) and fine-tuned (adapter enabled) ROUGE-L against
    its references, reusing the same loaded model for both. Calls: `generate()`, `score()`."""
    references = [ex["output"] for ex in test_set]
    with finetuned_model.disable_adapter():
        zero_shot_preds = [generate(finetuned_model, tokenizer, ex) for ex in test_set]
    finetuned_preds = [generate(finetuned_model, tokenizer, ex) for ex in test_set]
    return score(zero_shot_preds, references), score(finetuned_preds, references)


def main() -> None:
    """Loads the base model + LoRA adapter once (from ../finetune/lora_adapter, produced by
    `finetune.finetune_llama_lora.main()`), then scores every eval set in EVAL_SETS against it.
    Calls: `load_test_set()`, `evaluate()`."""
    base_model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME, max_seq_length=MAX_SEQ_LENGTH, load_in_4bit=True,
    )
    FastLanguageModel.for_inference(base_model)

    finetuned_model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    FastLanguageModel.for_inference(finetuned_model)

    for name, path in EVAL_SETS.items():
        test_set = load_test_set(path)
        zero_shot_rouge_l, finetuned_rouge_l = evaluate(finetuned_model, tokenizer, test_set)
        print(f"[{name}] Zero-shot  ROUGE-L: {zero_shot_rouge_l:.4f}")
        print(f"[{name}] Fine-tuned ROUGE-L: {finetuned_rouge_l:.4f}")


if __name__ == "__main__":
    main()
