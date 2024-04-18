require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { db, addTrainingJobMetadata } = require('./firebase-config');
const app = express();
const port = process.env.PORT || 3000;

// Web3 and smart contract interaction setup
const { Web3 } = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:7545"));
const accountPrivateKey = process.env.GANACHE_PRIVATE_KEY;
const account = web3.eth.accounts.privateKeyToAccount(accountPrivateKey);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

const contractABI = require('./VolunteerToken.json');
// console.log(contractABI);
const contractAddress = process.env.GANACHE_CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(contractABI.abi, contractAddress);
// const contract = new web3.eth.Contract(contractABI, contractAddress);

app.use(cors());
app.use(express.json());

app.post('/register-volunteer', async (req, res) => {
  const { name, email } = req.body;

  // Generate a new Ethereum wallet
  const wallet = web3.eth.accounts.create();

  try {
      const newVolunteer = await db.collection('volunteers').add({
          name,
          email,
          ethereumAddress: wallet.address,
          tasksCompleted: 0
      });
      // Consider how to handle the private key; you might want to send it in a secure way
      res.status(201).send({
          id: newVolunteer.id,
          ethereumAddress: wallet.address,
          privateKey: wallet.privateKey, // Be cautious with this practice
          message: 'Volunteer registered successfully. Please save your private key securely!'
      });
  } catch (error) {
      console.error('Failed to register volunteer:', error);
      res.status(500).send('Failed to register volunteer');
  }
});

app.post('/complete-job', async (req, res) => {
  const { docId, status, resultsUrl, volunteerAddress } = req.body;

  try {
      // Update the job status and results
      const docRef = db.collection('trainingJobs').doc(docId);
      await docRef.update({ trainingStatus: status, resultsUrl: resultsUrl });

      // Find volunteer by Ethereum address and increment their task count
      const volunteerRef = db.collection('volunteers').where('ethereumAddress', '==', volunteerAddress).limit(1);
      const snapshot = await volunteerRef.get();
      if (!snapshot.empty) {
          const volunteerDoc = snapshot.docs[0];
          const updatedTasks = volunteerDoc.data().tasksCompleted + 1;
          await db.collection('volunteers').doc(volunteerDoc.id).update({ tasksCompleted: updatedTasks });

          // Optionally mint tokens after updating tasks
          const tokensInWei = web3.utils.toWei('100', 'ether'); // Reward 100 tokens, adjust as needed
          const receipt = await contract.methods.mint(volunteerAddress, tokensInWei)
              .send({ from: web3.eth.defaultAccount });
          console.log(`Tokens minted: Transaction receipt: ${receipt.transactionHash}`);

          res.status(200).send({ message: 'Job marked as completed and volunteer rewarded successfully.' });
      } else {
          throw new Error('Volunteer not found');
      }
  } catch (error) {
      console.error(`Failed to mark job as completed or reward volunteer:`, error);
      res.status(500).send({ message: 'Failed to update job status or reward volunteer.' });
  }
});

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

app.post('/complete-job', async (req, res) => {
    const { docId, status, resultsUrl, volunteerAddress } = req.body;

    try {
        const docRef = db.collection('trainingJobs').doc(docId);
        await docRef.update({ trainingStatus: status, resultsUrl: resultsUrl });

        const tokensInWei = web3.utils.toWei('100', 'ether'); // Reward 100 tokens, adjust as needed
        const receipt = await contract.methods.mint(volunteerAddress, tokensInWei)
            .send({ from: web3.eth.defaultAccount });
        console.log(`Tokens minted: Transaction receipt: ${receipt.transactionHash}`);

        res.status(200).send({ message: 'Job marked as completed and volunteer rewarded successfully.' });
    } catch (error) {
        console.error(`Failed to mark job as completed or reward volunteer:`, error);
        res.status(500).send({ message: 'Failed to update job status or reward volunteer.' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const { spawn } = require('child_process');
// const {db, addTrainingJobMetadata } = require('./firebase-config');
// const app = express();
// const port = process.env.PORT || 3000;

// app.use(cors());
// app.use(express.json());

// app.post('/start-training', (req, res) => {
//     const { docId, modelId, datasetId, computeRequirements } = req.body;
//     console.log(`Received training request for Document ID: ${docId}, Model ID: ${modelId}, Dataset ID: ${datasetId}`);

//     const dockerUsername = process.env.DOCKER_USERNAME;
//     const dockerPassword = process.env.DOCKER_PASSWORD;
//     const imageTag = `${dockerUsername}/training_job_${docId}`.toLowerCase();
//     const dockerfilePath = './Trainer/Dockerfile';
//     const contextPath = './Trainer';

//     const commands = [
//         `docker login --username ${dockerUsername} --password ${dockerPassword} `,
//         // `echo ${dockerPassword} | docker login --username ${dockerUsername} --password-stdin`,
//         `docker build -t ${imageTag} -f ${dockerfilePath} --build-arg MODEL_ID=${modelId} --build-arg DATASET_ID=${datasetId} ${contextPath}`,
//         `docker push ${imageTag}`
//     ];

//     const shellProcess = spawn('cmd', ['/c', commands.join(' && ')], { shell: true });

//     shellProcess.stdout.on('data', (data) => {
//         console.log(`stdout: ${data.toString()}`);
//     });

//     shellProcess.stderr.on('data', (data) => {
//         console.error(`stderr: ${data.toString()}`);
//     });

//     shellProcess.on('close', async (code) => {
//         console.log(`Docker operations completed. Exit code: ${code}`);
//         if (code === 0) {
//             try {
//                 console.log("Creating trainingJobs");
//                 await addTrainingJobMetadata(docId, modelId, datasetId, imageTag, computeRequirements);
//                 res.status(200).send({ message: 'Training job initiated, Docker image pushed, and metadata saved.' });
//             } catch (error) {
//                 console.error('Failed to save training job metadata:', error);
//                 res.status(500).send({ message: 'Failed to save training job metadata.' });
//             }
//         } else {
//             res.status(500).send({ message: 'Docker operations failed' });
//         }
//     });
// });

// // require('dotenv').config();
// // const express = require('express');
// // const cors = require('cors');
// // const { spawn } = require('child_process');
// // const {db, addTrainingJobMetadata } = require('./firebase-config');
// // const app = express();
// // const port = process.env.PORT || 3000;

// // app.use(cors());
// // app.use(express.json());

// // app.post('/start-training', (req, res) => {
// //   const { docId, modelId, datasetId, computeRequirements } = req.body;
// //   console.log(`Received training request for Document ID: ${docId}, Model ID: ${modelId}, Dataset ID: ${datasetId}`);

// //   const dockerUsername = process.env.DOCKER_USERNAME;
// //   const dockerPassword = process.env.DOCKER_PASSWORD;
// //   const imageTag = `${dockerUsername}/training_job_${docId}`.toLowerCase();
// //   const dockerfilePath = './Trainer/Dockerfile';
// //   const contextPath = './Trainer';

// //   const commands = [
// //     `docker login --username mubarakb1999 --password B@mub199919 `,
// //     `docker build -t ${imageTag} -f ${dockerfilePath} --build-arg MODEL_ID=${modelId} --build-arg DATASET_ID=${datasetId} ${contextPath}`,
// //     `docker push ${imageTag}`
// //   ];

// //   const shellProcess = spawn('cmd', ['/c', commands.join(' && ')]);

// //   shellProcess.stdout.on('data', (data) => {
// //     console.log("Job created successfully");
// //     console.log(`stdout: ${data.toString()}`);
// //   });

// //   shellProcess.stderr.on('data', (data) => {
// //     console.error(`stderr: ${data.toString()}`);
// //   });

// //   console.log(`Docker operations completed. Exit code`);

// //   shellProcess.on('close', async (code) => {
// //     if (code === 0) {
// //       try {
// //         console.log("Creating trainingJobs");
// //         await addTrainingJobMetadata(docId, modelId, datasetId, imageTag, computeRequirements);
// //         res.status(200).send({ message: 'Training job initiated, Docker image pushed, and metadata saved.' });
// //       } catch (error) {
// //         console.error('Failed to save training job metadata:', error);
// //         res.status(500).send({ message: 'Failed to save training job metadata.' });
// //       }
// //     } else {
// //       res.status(500).send({ message: 'Docker operations failed' });
// //     }
// //   });
// // });

// // List All Training Jobs
// app.get('/jobs', async (req, res) => {
//   try {
//     const jobsSnapshot = await db.collection('trainingJobs').get();
//     const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//     res.json(jobs);
//   } catch (error) {
//     console.error('Failed to fetch jobs:', error);
//     res.status(500).send('Failed to fetch jobs');
//   }
// });

// // View Specific Job Metadata
// app.get('/jobs/:docId', async (req, res) => {
//   try {
//     const docRef = db.collection('trainingJobs').doc(req.params.docId);
//     const doc = await docRef.get();
//     if (doc.exists) {
//       res.json(doc.data());
//     } else {
//       res.status(404).send({ message: 'Job not found' });
//     }
//   } catch (error) {
//     console.error(`Failed to fetch job ${req.params.docId}:`, error);
//     res.status(500).send('Failed to fetch job');
//   }
// });

// // Update Training Job Status
// app.patch('/jobs/:docId/status', async (req, res) => {
//   const { status } = req.body;
//   const docRef = db.collection('trainingJobs').doc(req.params.docId);
//   try {
//     await docRef.update({ trainingStatus: status });
//     res.send({ message: 'Status updated successfully.' });
//   } catch (error) {
//     console.error(`Failed to update status for job ${req.params.docId}:`, error);
//     res.status(500).send({ message: 'Failed to update job status' });
//   }
// });

// // Add to your existing Express server setup in `server.js`

// app.post('/complete-job', async (req, res) => {
//   const { docId, status, resultsUrl } = req.body; // Assume resultsUrl is where the trained model is stored

//   try {
//       const docRef = db.collection('trainingJobs').doc(docId);
//       await docRef.update({ trainingStatus: status, resultsUrl: resultsUrl });
//       console.log(`Job ${docId} marked as completed.`);
//       res.status(200).send({ message: 'Job marked as completed successfully.' });
//   } catch (error) {
//       console.error(`Failed to mark job ${docId} as completed:`, error);
//       res.status(500).send({ message: 'Failed to update job status.' });
//   }
// });

// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

// //   const commands = [
// //     `echo "${dockerPassword}" | docker login --username "${dockerUsername}" --password-stdin`,
// //     `docker build -t ${imageTag} -f ${dockerfilePath} --build-arg MODEL_ID=${modelId} --build-arg DATASET_ID=${datasetId} ${contextPath}`,
// //     `docker push ${imageTag}`
// //   ];

// //   // Using `sh` instead of `cmd` and `/c`
// //   const shellProcess = spawn('sh', ['-c', commands.join(' && ')]);

// //   shellProcess.stdout.on('data', (data) => {
// //     console.log(`stdout: ${data.toString()}`);
// //   });

// //   shellProcess.stderr.on('data', (data) => {
// //     console.error(`stderr: ${data.toString()}`);
// //   });

// //   shellProcess.on('close', async (code) => {
// //     console.log(`Docker operations completed. Exit code: ${code}`);
// //     if (code === 0) {
// //       try {
// //         await addTrainingJobMetadata(docId, modelId, datasetId, imageTag, computeRequirements);
// //         res.status(200).send({ message: 'Training job initiated, Docker image pushed, and metadata saved.' });
// //       } catch (error) {
// //         console.error('Failed to save training job metadata:', error);
// //         res.status(500).send({ message: 'Failed to save training job metadata.' });
// //       }
// //     } else {
// //       res.status(500).send({ message: 'Docker operations failed' });
// //     }
// //   });
// // });
