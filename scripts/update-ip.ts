import { request } from 'urllib';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

async function updateAtlasIp() {
    try {
        console.log('Fetching current IP address...');
        const ipRes = await request('https://api.ipify.org');
        const myIp = ipRes.data.toString();
        console.log(`Current IP is: ${myIp}`);

        const { ATLAS_PROJECT_ID, ATLAS_PUBLIC_KEY, ATLAS_PRIVATE_KEY } = process.env;

        if (!ATLAS_PROJECT_ID || !ATLAS_PUBLIC_KEY || !ATLAS_PRIVATE_KEY) {
            throw new Error('Missing MongoDB Atlas API credentials in .env file');
        }

        const url = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${ATLAS_PROJECT_ID}/accessList`;
        
        console.log('Adding IP to MongoDB Atlas...');
        const response = await request(url, {
            method: 'POST',
            digestAuth: `${ATLAS_PUBLIC_KEY}:${ATLAS_PRIVATE_KEY}`,
            data: [{ 
                ipAddress: myIp, 
                comment: `Auto-added at ${new Date().toISOString()}` 
            }],
            contentType: 'json',
            dataType: 'json'
        });

        if (response.status === 201 || response.status === 200) {
            console.log('✅ Successfully added IP to MongoDB Atlas whitelist!');
        } else {
            console.error('Failed to add IP:', response.data);
        }

    } catch (error) {
        console.error('❌ Error updating Atlas IP:', error);
    }
}

updateAtlasIp();
