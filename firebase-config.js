const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  }),
});

const db = admin.firestore();

async function addTrainingJobMetadata(docId, modelId, datasetId, imageTag, computeRequirements) {
    try {
        const docRef = await db.collection('trainingJobs').add({
            modelId: modelId,
            datasetId: datasetId,
            imageTag: imageTag,
            computeRequirements: computeRequirements,
            trainingStatus: 'Pending', // Initial status
            createdAt: admin.firestore.FieldValue.serverTimestamp() // Use server-side timestamp
        });
        console.log("Metadata document written with ID: ", docRef.id);
        return docRef.id; // return the document ID
    } catch (error) {
        console.error("Error adding document: ", error);
        throw new Error("Failed to add training job metadata.");
    }
}

module.exports = {
    addTrainingJobMetadata
};
