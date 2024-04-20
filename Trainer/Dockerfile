# Use an official Python runtime as a parent image
FROM python:3.8-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Pass build arguments into the environment
ARG GANACHE_URL
ARG CONTRACT_ADDRESS
ARG CONTRACT_ABI
ARG ACCOUNT_ADDRESS
ARG MODEL_ID
ARG DATASET_ID

# Set environment variables
ENV GANACHE_URL=$GANACHE_URL
ENV CONTRACT_ADDRESS=$CONTRACT_ADDRESS
ENV CONTRACT_ABI=$CONTRACT_ABI
ENV ACCOUNT_ADDRESS=$ACCOUNT_ADDRESS
ENV MODEL_ID=$MODEL_ID
ENV DATASET_ID=$DATASET_ID

# Copy the requirements file into the container at /usr/src/app
COPY requirements.txt ./

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your app's source code from your host to your image filesystem.
COPY . .

# Define the script to run when the container launches. CMD can be overridden with additional arguments.
CMD ["python", "./train_model.py"]
