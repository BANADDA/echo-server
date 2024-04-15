require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { addTrainingJobMetadata } = require('./firebase-config');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/start-training', (req, res) => {
  const { docId, modelId, datasetId, computeRequirements } = req.body;
  console.log(`Received training request for Document ID: ${docId}, Model ID: ${modelId}, Dataset ID: ${datasetId}`);

  const dockerUsername = process.env.DOCKER_USERNAME;
  const dockerPassword = process.env.DOCKER_PASSWORD;
  const imageTag = `${dockerUsername}/training_job_${docId}`.toLowerCase();
  const dockerfilePath = './Trainer/Dockerfile';
  const contextPath = './Trainer';

  const commands = [
    `echo "${dockerPassword}" | docker login --username "${dockerUsername}" --password-stdin`,
    `docker build -t ${imageTag} -f ${dockerfilePath} --build-arg MODEL_ID=${modelId} --build-arg DATASET_ID=${datasetId} ${contextPath}`,
    `docker push ${imageTag}`
  ];

  // Using `sh` instead of `cmd` and `/c`
  const shellProcess = spawn('sh', ['-c', commands.join(' && ')]);

  shellProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data.toString()}`);
  });

  shellProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data.toString()}`);
  });

  shellProcess.on('close', async (code) => {
    console.log(`Docker operations completed. Exit code: ${code}`);
    if (code === 0) {
      try {
        await addTrainingJobMetadata(docId, modelId, datasetId, imageTag, computeRequirements);
        res.status(200).send({ message: 'Training job initiated, Docker image pushed, and metadata saved.' });
      } catch (error) {
        console.error('Failed to save training job metadata:', error);
        res.status(500).send({ message: 'Failed to save training job metadata.' });
      }
    } else {
      res.status(500).send({ message: 'Docker operations failed' });
    }
  });
});

// List All Training Jobs
app.get('/jobs', async (req, res) => {
  try {
    const jobsSnapshot = await db.collection('trainingJobs').get();
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(jobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    res.status(500).send('Failed to fetch jobs');
  }
});

// View Specific Job Metadata
app.get('/jobs/:docId', async (req, res) => {
  try {
    const docRef = db.collection('trainingJobs').doc(req.params.docId);
    const doc = await docRef.get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      res.status(404).send({ message: 'Job not found' });
    }
  } catch (error) {
    console.error(`Failed to fetch job ${req.params.docId}:`, error);
    res.status(500).send('Failed to fetch job');
  }
});

// Update Training Job Status
app.patch('/jobs/:docId/status', async (req, res) => {
  const { status } = req.body;
  const docRef = db.collection('trainingJobs').doc(req.params.docId);
  try {
    await docRef.update({ trainingStatus: status });
    res.send({ message: 'Status updated successfully.' });
  } catch (error) {
    console.error(`Failed to update status for job ${req.params.docId}:`, error);
    res.status(500).send({ message: 'Failed to update job status' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
