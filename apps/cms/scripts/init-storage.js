// Creates the local media bucket on MinIO and opens it for public reads, as the R2 bucket is in production.
const { CreateBucketCommand, PutBucketPolicyCommand, S3Client } = require('@aws-sdk/client-s3');

const bucket = process.env.S3_BUCKET || 'eaves-media';

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
  },
});

const publicRead = {
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] }],
};

const ATTEMPTS = 30;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// MinIO refuses connections for a moment after its container starts.
const createBucket = async () => {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt ++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      return;
    } catch (error) {
      if (error.name === 'BucketAlreadyOwnedByYou') return;
      if (attempt === ATTEMPTS) throw error;
      await wait(1000);
    }
  }
};

const run = async () => {
  await createBucket();
  await client.send(new PutBucketPolicyCommand({ Bucket: bucket, Policy: JSON.stringify(publicRead) }));
  console.log(`Bucket "${bucket}" is ready and publicly readable.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
