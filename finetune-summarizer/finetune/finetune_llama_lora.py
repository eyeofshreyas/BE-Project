"""
QLoRA fine-tune of Llama-3.2-1B-Instruct on the IN-Abs legal summarization
pairs, via Unsloth. Sized for a 4GB local GPU (e.g. RTX 3050 laptop):

    Unsloth's own QLoRA VRAM table: 3B ~3.5GB, 7B ~5GB, 8B ~6GB.
    A 4GB card can't fit 7B/8B at all. 1B is the safe fit; 3B is a
    fallback to try only if you free up more VRAM (close other GPU apps) --
    edit MODEL_NAME to "unsloth/Llama-3.2-3B-Instruct-bnb-4bit" and drop
    MAX_SEQ_LENGTH further if you attempt it, expect possible OOM.

Local setup (venv on a partition with disk space, not the OS drive):
    python -m venv .venv && source .venv/bin/activate
    pip install torch --index-url https://download.pytorch.org/whl/cu126
    pip install unsloth trl peft accelerate bitsandbytes datasets
    python finetune_llama_lora.py
"""
from unsloth import FastLanguageModel, is_bfloat16_supported  # must import before trl/transformers/peft
from unsloth.chat_templates import get_chat_template
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

MODEL_NAME = "unsloth/Llama-3.2-1B-Instruct-bnb-4bit"
MAX_SEQ_LENGTH = 2048  # keep small on 4GB; raise only if you have VRAM to spare
OUTPUT_DIR = "lora_adapter"

PROMPT_TEMPLATE = """### Instruction:
{instruction}

### Judgment:
{input}

### Headnote Summary:
{output}"""


def add_text_column(dataset, tokenizer):
    """Precomputes a flat "text" column by rendering each example through PROMPT_TEMPLATE plus the EOS token,
    for SFTConfig's default dataset_text_field (avoids a formatting_func map bug, see comment below)."""
    # A `formatting_func` here silently dropped the dataset to 8 rows on this
    # unsloth/trl version (some batched-map interaction bug) -- precomputing
    # a plain "text" column and using SFTConfig's default dataset_text_field
    # avoids that codepath entirely and is the more standard approach anyway.
    def to_text(example):
        return {"text": PROMPT_TEMPLATE.format(**example) + tokenizer.eos_token}
    return dataset.map(to_text)


def main() -> None:
    """Loads the 4-bit base model, attaches a LoRA adapter, loads the JSONL pairs produced by
    `data_prep.prepare_in_abs.main()`, formats them via `add_text_column()`, runs Unsloth's SFTTrainer,
    and saves the adapter + tokenizer to OUTPUT_DIR (consumed later by `inference.summarize_long`)."""
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=MAX_SEQ_LENGTH,
        load_in_4bit=True,
    )
    # this repo loads as a "legacy tokenizer"; without a registered chat template
    # unsloth's patched SFTTrainer rejects it with a placeholder EOS-token error
    tokenizer = get_chat_template(tokenizer, chat_template="llama-3.1")

    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        use_gradient_checkpointing="unsloth",
    )

    dataset = load_dataset(
        "json",
        data_files={"train": "../data_prep/data/train.jsonl", "test": "../data_prep/data/test.jsonl"},
    )
    dataset = add_text_column(dataset, tokenizer)

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset["train"],
        args=SFTConfig(
            output_dir=OUTPUT_DIR,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            num_train_epochs=2,
            learning_rate=2e-4,
            optim="adamw_8bit",
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=20,
            save_strategy="epoch",
            max_length=MAX_SEQ_LENGTH,
        ),
    )

    trainer.train()
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"LoRA adapter saved to ./{OUTPUT_DIR}")


if __name__ == "__main__":
    main()
