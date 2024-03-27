const express = require('express');
const router = express.Router();

const { messageToDB, listChats, listMessages, listOneshots, lastViewForChat } = global.projectUtils.questfinder;

router.get('/startup', async (req, res) => {
    try {
        const { user } = req;
        const [devicesRow] = await global.db.execute('SELECT * FROM devices WHERE userUID = ?', [user.UID]);
        const devices = devicesRow.map(device => {
            return {
                token: device.token,
                label: device.label,
            };
        });
        res.status(200).json({
            new: user.new ?? false,
            nickname: user.nickname,
            UID: user.UID,
            devices,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});

router.get('/profile', async (req, res) => {
    try {
        const { user } = req;
        const [usersRow] = await global.db.execute(`SELECT nickname, bio, email, updatedOn
        FROM users
        WHERE UID = ?`, [user.UID]);
        if (usersRow.length === 0) {
            return res.status(404).send('User Not Found');
        }
        const userDb = usersRow[0];
        const [akas] = await global.db.execute(`SELECT nickname, since, until
        FROM qf_akas
        WHERE userUID = ?`, [user.UID]);
        return res.status(200).json({
            nickname: userDb.nickname,
            bio: userDb.bio,
            signedUpOn: userDb.signedUpOn,
            email: userDb.email,
            akas: akas,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});

router.get('/view/:UID', async (req, res) => {
    try {
        const { UID } = req.params;
        const [usersRow] = await global.db.execute(`SELECT UID, nickname, bio, signedUpOn
        FROM users
        WHERE UID = ?`, [UID]);
        if (usersRow.length === 0) {
            return res.status(404).send('User Not Found');
        }
        const user = usersRow[0];
        const [akas] = await global.db.execute(`SELECT nickname, since, until
        FROM qf_akas
        WHERE userUID = ?`, [UID]);
        const oneshots = await listOneshots(UID);
        const myOneshots = await listOneshots(req.user.UID);
        return res.status(200).json({
            UID: user.UID,
            nickname: user.nickname,
            bio: user.bio,
            signedUpOn: user.signedUpOn,
            akas: akas,
            oneshots: oneshots.map(oneshot => {
                oneshot.isCommon = myOneshots.some(myOneshot => myOneshot.UID === oneshot.UID);
                return oneshot;
            }),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

router.post('/update', async (req, res) => {
    let connection;
    try {
        connection = await global.db.getConnection();
        const validatedInput = validateInput(res, req.body);
        if (!validatedInput) return;
        const { user } = req;

        await connection.beginTransaction();

        const [userRow] = await connection.execute('SELECT * FROM users WHERE UID = ?', [user.UID]);
        if (!userRow.length) {
            return res.status(404).send('User Not Found');
        }
        const userDb = userRow[0];

        if (validatedInput.nickname) {
            await connection.execute('UPDATE users SET nickname = ?, updatedOn = UTC_TIMESTAMP() WHERE UID = ?', [validatedInput.nickname, userDb.UID]);
            await connection.execute('INSERT qf_akas (userUID, nickname, since, until) VALUES (?, ?, ?, UTC_TIMESTAMP())', [userDb.UID, userDb.nickname, userDb.updatedOn]);
        }

        if (validatedInput.bio) {
            await connection.execute('UPDATE users SET bio = ?, updatedOn = UTC_TIMESTAMP() WHERE UID = ?', [validatedInput.bio, userDb.UID]);
        }

        if (validatedInput.email) {
            await connection.execute('UPDATE users SET email = ?, updatedOn = UTC_TIMESTAMP() WHERE UID = ?', [validatedInput.email, userDb.UID]);
        }

        await connection.commit();
        res.status(200).send('OK');
    } catch (error) {
        await connection.rollback();
        console.error(error);
        return res.status(500).send('Internal Server Error');
    } finally {
        connection.release();
    }
});

// messages
router.post('/message/:userUID', (req, res) => {
    try {
        const { user } = req;
        const receiverType = 'USER';
        const receiverUID = req.params.userUID;
        const { message } = req.body;
        messageToDB(user, receiverType, receiverUID, message);
        res.status(200).send('Message sent');
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});
router.get('/messages/:userUID', async (req, res) => {
    try {
        const { user } = req;
        const receiverUID = req.params.userUID;
        res.status(200).json({
            messages: await listMessages('USER', receiverUID, user.UID),
            messagesLastReading: await lastViewForChat(user.UID, 'USER', receiverUID),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});
router.get('/chats', async (req, res) => {
    try {
        const { user } = req;
        const chats = await listChats(user.UID);
        res.status(200).json(chats);
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
});

function validateInput(res, inputToValidate) {
    const { nickname, bio, email } = inputToValidate;
    if (nickname && nickname.length > 50) {
        res.status(400).send('Username too long');
        return false;
    }
    if (bio && bio.length > 1000) {
        res.status(400).send('Bio too long');
        return false;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).send('Email too long');
        return false;
    }
    return inputToValidate;
}

module.exports = router;
