const mysql = require('mysql2');
global.mysql = mysql;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const connectToDB = async () => {
    try {
        const delay = process.env.DB_DELAY ?? 0;
        if (delay) {
            await sleep(delay);
        }
        const dbConfig = {
            host: process.env.QUESTFINDER_DB_HOST,
            port: process.env.QUESTFINDER_DB_PORT,
            user: process.env.QUESTFINDER_DB_USER,
            password: process.env.QUESTFINDER_DB_PSWD,
            database: process.env.QUESTFINDER_DB_NAME,
            timezone: 'Z',
        };
        if (process.env.QUESTFINDER_DB_SSL == 'true') {
            dbConfig.ssl = {
                rejectUnauthorized: true,
            };
        }
        console.log('Initializing database connection...');
        console.log(dbConfig);
        const pool = mysql.createPool(dbConfig);
        global._db = pool;
        global.db = pool.promise();

        const originalExecute = global.db.execute.bind(global.db);

        global.db.execute = async function (...args) {
            let retries = 3;

            while (retries--) {
                try {
                    return await originalExecute(...args);
                } catch (err) {
                    console.error('DB execute error:', err.code || err.message);

                    if (
                        err.code === 'PROTOCOL_CONNECTION_LOST' ||
                        err.code === 'ECONNRESET' ||
                        err.code === 'ECONNREFUSED'
                    ) {
                        console.log('Retrying DB connection...');
                        await sleep(5000);
                        continue;
                    }

                    throw err;
                }
            }

            throw new Error('DB non raggiungibile dopo retry');
        };

        await global.db.execute('SELECT 1');
        console.log('Database connection established');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
};

module.exports = new Promise(async (resolve, reject) => {
    await connectToDB();
    resolve();
});
