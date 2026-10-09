"""
Domain-adaptive continued pretraining of Llama-3.2-1B-Instruct on raw judgment
text combined from AWS's Supreme Court + Delhi High Court judgment datasets
(data_prep/prepare_aws_judgments.py's output) -- unsupervised next-token
prediction, no summary labels needed since neither AWS dataset has any. Run
this BEFORE finetune_llama_lora.py: it merges the DAPT LoRA into the base
model, and finetune_llama_lora.py's MODEL_NAME points at that merged model so
the supervised IN-Abs fine-tune starts from a model that's already seen more
real Indian court judgment text.

Same QLoRA-on-4GB-GPU setup as finetune_llama_lora.py -- see that file's
docstring for venv setup.

Usage:
    python domain_pretrain.py
Outputs:
    ./dapt_merged/   (merged fp16 model + tokenizer)
"""
from unsloth import FastLanguageModel, is_bfloat16_supported  # must import before trl/transformers/peft
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from transformers.trainer_utils import get_last_checkpoint

MODEL_NAME = "unsloth/Llama-3.2-1B-Instruct-bnb-4bit"
MAX_SEQ_LENGTH = 2048
OUTPUT_DIR = "dapt_merged"


def main() -> None:
    """Loads the 4-bit base model, attaches a LoRA adapter, trains it on raw judgment text (packed, one epoch),
    then merges the adapter into the base weights and saves the merged model+tokenizer to OUTPUT_DIR (consumed
    next by finetune_llama_lora.py's MODEL_NAME)."""
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL_NAME,
        max_seq_length=MAX_SEQ_LENGTH,
        load_in_4bit=True,
    )

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

    dataset = load_dataset("json", data_files="../data_prep/data/dapt_corpus.jsonl")["train"]  # combined SCJ + Delhi HC

    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            output_dir="dapt_checkpoints",
            dataset_text_field="text",
            packing=True,  # raw judgment text, not instruction pairs -- pack to fill the context window instead of padding
            per_device_train_batch_size=1,
            gradient_accumulation_steps=8,
            num_train_epochs=1,  # DAPT is one pass over raw text, not the multi-epoch regime the small supervised set uses
            learning_rate=1e-4,  # lower than the SFT stage's 2e-4 -- shouldn't overwrite base knowledge as aggressively
            optim="adamw_8bit",
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=20,
            save_strategy="steps",
            save_steps=200,  # single epoch is one long run on a 4GB laptop GPU -- checkpoint often so a
            save_total_limit=3,  # laptop-sleep stall (hit twice during the download) resumes instead of restarting
            max_length=MAX_SEQ_LENGTH,
        ),
    )

    last_checkpoint = get_last_checkpoint("dapt_checkpoints")
    if last_checkpoint:
        print(f"Resuming from {last_checkpoint}")
    trainer.train(resume_from_checkpoint=last_checkpoint)

    model.save_pretrained_merged(OUTPUT_DIR, tokenizer, save_method="merged_16bit")
    print(f"Merged DAPT model saved to ./{OUTPUT_DIR} -- finetune_llama_lora.py's MODEL_NAME already points here")


if __name__ == "__main__":
    main()
