import json
import torch
from torch.utils.data import DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, DataCollatorWithPadding
from datasets import load_dataset
from web3 import Web3
from web3.middleware import geth_poa_middleware
import os

def train_model(model_id, dataset_id, device='cuda'):
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(model_id).to(device)

    dataset = load_dataset(dataset_id)
    tokenized_datasets = dataset.map(
        lambda x: tokenizer(x['text'], truncation=True, padding="max_length", max_length=512),
        batched=True
    )

    training_args = TrainingArguments(
        output_dir="./results",
        evaluation_strategy="epoch",
        learning_rate=2e-5,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=8,
        num_train_epochs=3,
        weight_decay=0.01,
        save_strategy="no",
        load_best_model_at_end=False
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"]
    )

    for epoch in range(int(training_args.num_train_epochs)):
        trainer.train()
        eval_result = trainer.evaluate()
        loss = eval_result["eval_loss"]
        is_valid = validate_model(model, tokenizer, tokenized_datasets["test"], device)

        if is_valid:
            print(f"Epoch {epoch}: Model validated with loss {loss}. Proceeding to mint token.")
            mint_token(epoch, loss)
        else:
            print(f"Epoch {epoch}: Model validation failed with loss {loss}. No token will be minted.")

def validate_model(model, tokenizer, eval_dataset, device='cuda'):
    model.eval()

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    eval_loader = DataLoader(eval_dataset, batch_size=8, collate_fn=data_collator)

    total_eval_loss = 0
    correct_predictions = 0
    num_eval_steps = 0

    with torch.no_grad():
        for batch in eval_loader:
            inputs = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**inputs)
            logits = outputs.logits
            loss = outputs.loss

            total_eval_loss += loss.item()
            predictions = torch.argmax(logits, dim=-1)
            correct_predictions += (predictions == inputs['labels']).sum().item()
            num_eval_steps += 1

    avg_loss = total_eval_loss / num_eval_steps
    accuracy = correct_predictions / len(eval_dataset)

    print(f"Validation completed: Avg Loss = {avg_loss}, Accuracy = {accuracy}")

    loss_threshold = 2.0  # Make these configurable if needed
    accuracy_threshold = 0.85  # Make these configurable if needed
    return avg_loss < loss_threshold and accuracy > accuracy_threshold

def mint_token(epoch, performance, threshold=0.8):
    # Retrieve environment variables
    ganache_url = os.getenv('GANACHE_URL', "http://127.0.0.1:7545")
    contract_address = os.getenv('CONTRACT_ADDRESS')
    contract_abi = os.getenv('CONTRACT_ABI', '[]')  # ABI is stored as a JSON string
    account_address = os.getenv('ACCOUNT_ADDRESS')

    # Setup Web3 connection
    web3 = Web3(Web3.HTTPProvider(ganache_url))
    web3.middleware_onion.inject(geth_poa_middleware, layer=0)

    if not web3.isConnected():
        print("Failed to connect to the Ethereum client.")
        return

    # Convert JSON string ABI to Python object
    contract_abi = json.loads(contract_abi)

    if performance >= threshold:
        # Create contract instance
        contract = web3.eth.contract(address=Web3.toChecksumAddress(contract_address), abi=contract_abi)

        # Mint token logic
        try:
            tx_hash = contract.functions.mint(Web3.toChecksumAddress(account_address), 1).transact({'from': Web3.toChecksumAddress(account_address)})
            tx_receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
            print(f"Token minted successfully in transaction {tx_receipt.transactionHash.hex()} for epoch {epoch} due to high performance: {performance}")
        except Exception as e:
            print(f"Failed to mint token: {str(e)}")
    else:
        print(f"Performance {performance} did not meet the threshold {threshold}. No token minted.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", required=True, help="Model ID from Hugging Face")
    parser.add_argument("--dataset-id", required=True, help="Dataset ID from Hugging Face")
    args = parser.parse_args()

    train_model(args.model_id, args.dataset_id)
