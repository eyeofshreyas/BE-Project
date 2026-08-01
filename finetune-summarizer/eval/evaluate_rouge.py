"""
Compares zero-shot Llama-3.1-8B-Instruct vs the fine-tuned LoRA adapter on
the IN-Abs held-out test set, scored with ROUGE-L against the reference
headnotes. Run on the same Colab GPU used for training, after
finetune_llama_lora.py has produced ./lora_adapter.
"""
import json

from unsloth import FastLanguageModel  # must import before trl/transformers/peft
from peft import PeftModel
from rouge_score import rouge_scorer

MODEL_NAME = "unsloth/Llama-3.2-1B-Instruct-bnb-4bit"
ADAPTER_DIR = "../finetune/lora_adapter"
TEST_FILE = "../data_prep/data/test.jsonl"
MAX_SEQ_LENGTH = 2048

PROMPT = """### Instruction:
{instruction}

### Judgment:
{input}

### Headnote Summary:
"""


def load_test_set():
    with open(TEST_FILE) as f:
        return [json.loads(line) for line in f]


def generate(model, tokenizer, example, max_new_tokens=256):
    prompt = PROMPT.format(**example)
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=MAX_SEQ_LENGTH).to(model.device)
    out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return text.strip()


def score(predictions, references):
    scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=True)
    scores = [scorer.score(ref, pred)["rougeL"].fmeasure for pred, ref in zip(predictions, references)]
    return sum(scores) / len(scores)


def main() -> None:
    test_set = load_test_set()
    references = [ex["output"] for ex in test_set]

    base_model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME, max_seq_length=MAX_SEQ_LENGTH, load_in_4bit=True,
    )
    FastLanguageModel.for_inference(base_model)

    zero_shot_preds = [generate(base_model, tokenizer, ex) for ex in test_set]
    zero_shot_rouge_l = score(zero_shot_preds, references)

    finetuned_model = PeftModel.from_pretrained(base_model, ADAPTER_DIR)
    FastLanguageModel.for_inference(finetuned_model)

    finetuned_preds = [generate(finetuned_model, tokenizer, ex) for ex in test_set]
    finetuned_rouge_l = score(finetuned_preds, references)

    print(f"Zero-shot  ROUGE-L: {zero_shot_rouge_l:.4f}")
    print(f"Fine-tuned ROUGE-L: {finetuned_rouge_l:.4f}")

    assert len(zero_shot_preds) == len(finetuned_preds) == len(references)


if __name__ == "__main__":
    main()
