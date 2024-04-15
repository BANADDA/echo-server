# Use an official Python runtime as a parent image
FROM python:3.8-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the requirements file into the container at /usr/src/app
COPY requirements.txt ./

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your app's source code from your host to your image filesystem.
COPY . .

# Define the script to run when the container launches. CMD can be overridden with additional arguments.
ENTRYPOINT ["python", "./train_model.py"]
CMD ["--model-id", "default_model_id", "--dataset-id", "default_dataset_id"]