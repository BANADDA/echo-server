require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const si = require('systeminformation');
const jwt = require('jsonwebtoken');
// const bcrypt = require('bcryptjs');
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

const bcrypt = require('bcryptjs');

app.post('/start-training', (req, res) => {
    const { docId, modelId, datasetId, computeRequirements } = req.body;
    const dockerUsername = process.env.DOCKER_USERNAME;
    const dockerPassword = process.env.DOCKER_PASSWORD;
    const imageTag = `${dockerUsername}/training_job_${docId}`.toLowerCase();
    const dockerfilePath = './Trainer/Dockerfile';
    const contextPath = './Trainer';

    // Read environment variables
    const ganacheUrl = process.env.GANACHE_URL;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const contractAbi = process.env.CONTRACT_ABI;  // Make sure it's a stringified JSON
    const accountAddress = process.env.ACCOUNT_ADDRESS;

    const commands = [
        `docker login --username ${dockerUsername} --password ${dockerPassword}`,
        `docker build -t ${imageTag} -f ${dockerfilePath} ` +
        `--build-arg GANACHE_URL=${ganacheUrl} ` +
        `--build-arg CONTRACT_ADDRESS=${contractAddress} ` +
        `--build-arg CONTRACT_ABI='${contractAbi}' ` +
        `--build-arg ACCOUNT_ADDRESS=${accountAddress} ` +
        `--build-arg MODEL_ID=${modelId} --build-arg DATASET_ID=${datasetId} ${contextPath}`,
        `docker push ${imageTag}`
    ];

    const shellProcess = spawn('cmd', ['/c', commands.join(' && ')], { shell: true });

    shellProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data.toString()}`);
    });

    shellProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data.toString()}`);
    });

    shellProcess.on('close', async (code) => {
        if (code === 0) {
            // Your logic to handle successful Docker operations
            console.log("Docker operations completed successfully.");
            res.status(200).send({ message: 'Training job initiated, Docker image pushed, and metadata saved.' });
        } else {
            console.error('Docker operations failed.');
            res.status(500).send({ message: 'Docker operations failed' });
        }
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

function generatePassword() {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

function verifyToken(req, res, next) {
    const token = req.headers['x-access-token'];
    if (!token) {
        return res.status(403).send({ message: 'No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized!' });
        }
        req.volunteerId = decoded.id;
        next();
    });
}

async function getAdvancedSystemDetails() {
    try {
        const cpu = await si.cpu();
        const graphics = await si.graphics();
        const osInfo = await si.osInfo();
        const network = await si.networkInterfaces();

        return {
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: cpu.brand,
                speed: cpu.speed,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
            },
            os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
            },
            graphics: graphics.controllers.map(gpu => ({
                model: gpu.model,
                vram: gpu.vram,
            })),
            network: network.map(interface => ({
                iface: interface.iface,
                ip4: interface.ip4,
                mac: interface.mac,
            }))
        };
    } catch (error) {
        console.error('Failed to fetch system information:', error);
        throw error;  // Ensure to handle this in the calling function
    }
}

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const volunteerRef = db.collection('volunteers').where('email', '==', email).limit(1);
        const snapshot = await volunteerRef.get();

        if (snapshot.empty) {
            return res.status(401).send({ message: 'Login failed: Volunteer not found.' });
        }

        const volunteer = snapshot.docs[0].data();
        const passwordIsValid = await bcrypt.compare(password, volunteer.passwordHash);

        if (!passwordIsValid) {
            return res.status(401).send({ message: 'Login failed: Incorrect password.' });
        }

        // Retrieve advanced system details
        const systemDetails = await getAdvancedSystemDetails();

        // Generate a token
        const token = jwt.sign({ id: snapshot.docs[0].id }, process.env.JWT_SECRET, {
            expiresIn: 86400 // expires in 24 hours
        });

        // Store login details and system info in Firestore
        await db.collection('loginRecords').add({
            volunteerId: snapshot.docs[0].id,
            loginTime: new Date(),
            systemInfo: systemDetails
        });

        res.send({
            message: 'Login successful!',
            volunteerId: snapshot.docs[0].id,
            token: token,
            systemInfo: systemDetails  // Optionally send back to client if needed
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send({ message: 'Failed to process login.' });
    }
});

app.post('/register-volunteer', async (req, res) => {
    const { name, email } = req.body;
    const wallet = web3.eth.accounts.create();
    const password = generatePassword();
    console.log('Password', password);
    const passwordHash = await bcrypt.hash(password, 10);

    try {
        const newVolunteer = await db.collection('volunteers').add({
            name,
            email,
            ethereumAddress: wallet.address,
            passwordHash,
            tasksCompleted: 0
        });
        res.status(201).send({
            id: newVolunteer.id,
            ethereumAddress: wallet.address,
            privateKey: wallet.privateKey, // Be cautious with this practice
            password, // Send password back to user securely
            message: 'Volunteer registered successfully. Please save your credentials securely!'
        });
    } catch (error) {
        console.error('Failed to register volunteer:', error);
        res.status(500).send('Failed to register volunteer');
    }
});

app.post('/complete-job', verifyToken, async (req, res) => {
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

            // Mint tokens after updating tasks
            const tokensInWei = web3.utils.toWei('100', 'ether'); // Reward 100 tokens, adjust as needed
            const receipt = await contract.methods.mint(volunteerAddress, tokensInWei)
                .send({ from: web3.eth.defaultAccount });
            console.log(`Tokens minted: Transaction receipt: ${receipt.transactionHash}`);

            // Convert the tokens from wei to ether for a more readable format
            const tokensInEther = web3.utils.fromWei(tokensInWei, 'ether');

            // Create a document in the 'completedJobs' collection
            await db.collection('completedJobs').add({
                volunteerName: volunteerDoc.data().name,
                volunteerId: volunteerDoc.id,
                ethereumAddress: volunteerAddress,
                jobId: docId,
                tokensRewarded: tokensInEther, // Use the actual tokens rewarded in ether
                transactionHash: receipt.transactionHash,
                resultsUrl: resultsUrl  // Store the results URL provided by the job completion
            });

            res.status(200).send({ message: 'Job marked as completed and volunteer rewarded successfully.' });
        } else {
            throw new Error('Volunteer not found');
        }
    } catch (error) {
        console.error(`Failed to mark job as completed or reward volunteer:`, error);
        res.status(500).send({ message: 'Failed to update job status or reward volunteer.' });
    }
});

app.get('/jobs', verifyToken, async (req, res) => {
    try {
        const jobsSnapshot = await db.collection('trainingJobs').where('trainingStatus', '==', 'Pending').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(jobs);
    } catch (error) {
        console.error('Failed to fetch jobs:', error);
        res.status(500).send('Failed to fetch jobs');
    }
});

app.get('/all-jobs', verifyToken, async (req, res) => {
    try {
        const jobsSnapshot = await db.collection('trainingJobs').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (jobs.length === 0) {
            return res.status(200).json({ message: "No training jobs available" });
        }

        res.json(jobs);
    } catch (error) {
        console.error('Failed to fetch jobs:', error);
        res.status(500).send('Failed to fetch jobs');
    }
});

// app.get('/all-jobs', verifyToken, async (req, res) => {
//     try {
//         const jobsSnapshot = await db.collection('trainingJobs').get();
//         const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//         res.json(jobs);
//     } catch (error) {
//         console.error('Failed to fetch jobs:', error);
//         res.status(500).send('Failed to fetch jobs');
//     }
// });

app.get('/jobs/:docId', verifyToken, async (req, res) => {
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

app.patch('/jobs/:docId/status', verifyToken, async (req, res) => {
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

// app.post('/complete-job', verifyToken, async (req, res) => {
//     const { docId, status, resultsUrl, volunteerAddress } = req.body;

//     try {
//         const docRef = db.collection('trainingJobs').doc(docId);
//         await docRef.update({ trainingStatus: status, resultsUrl: resultsUrl });

//         const tokensInWei = web3.utils.toWei('100', 'ether'); // Reward 100 tokens, adjust as needed
//         const receipt = await contract.methods.mint(volunteerAddress, tokensInWei)
//             .send({ from: web3.eth.defaultAccount });
//         console.log(`Tokens minted: Transaction receipt: ${receipt.transactionHash}`);

//         res.status(200).send({ message: 'Job marked as completed and volunteer rewarded successfully.' });
//     } catch (error) {
//         console.error(`Failed to mark job as completed or reward volunteer:`, error);
//         res.status(500).send({ message: 'Failed to update job status or reward volunteer.' });
//     }
// });

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});