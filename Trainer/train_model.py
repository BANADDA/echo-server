from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments, Trainer
from datasets import load_dataset
import os

def train_model(model_id, dataset_id):
    print(f"Training model with ID: {model_id} on dataset: {dataset_id}")

    # Load the tokenizer and model
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(model_id)

    # Load the dataset
    dataset = load_dataset(dataset_id)
    
    # Tokenize the dataset
    def tokenize_function(examples):
        return tokenizer(examples['text'], padding="max_length", truncation=True)

    tokenized_datasets = dataset.map(tokenize_function, batched=True)
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir="./results",          # output directory for model checkpoints
        num_train_epochs=1,              # number of training epochs
        per_device_train_batch_size=4,   # batch size for training
        per_device_eval_batch_size=4,    # batch size for evaluation
        warmup_steps=500,                # number of warmup steps
        weight_decay=0.01,               # strength of weight decay
        logging_dir="./logs",            # directory for storing logs
    )

    # Initialize Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"],
    )

    # Train the model
    trainer.train()

    # Save the fine-tuned model
    model_path = f"./{model_id}_finetuned"
    model.save_pretrained(model_path)
    tokenizer.save_pretrained(model_path)

    print("Training completed successfully!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Fine-tune a model from Hugging Face on a specified dataset")
    parser.add_argument("--model-id", type=str, required=True, help="The model ID from Hugging Face")
    parser.add_argument("--dataset-id", type=str, required=True, help="The dataset ID from Hugging Face")
    args = parser.parse_args()
    train_model(args.model_id, args.dataset_id)
