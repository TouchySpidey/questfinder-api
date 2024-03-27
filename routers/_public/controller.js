const express = require('express');
const router = express.Router();
const { validateQuery, search } = global.projectUtils.questfinder;

router.get('/oneshot/search', async (req, res) => {
    try {
        const validatedQuery = validateQuery(req.query);
        if (!validatedQuery) {
            return res.status(400).send("Invalid query");
        }

        const list = await search(validatedQuery);

        res.status(200).send({ list });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/oneshot/:UID', async (req, res) => {
    try {
        const oneshotUID = req.params.UID;
        const [oneshotRow] = await global.db.execute('SELECT * FROM qf_oneshots WHERE UID = ?', [oneshotUID]);
        if (oneshotRow.length === 0) {
            return res.status(404).send("Oneshot not found");
        }
        const oneshot = oneshotRow[0];
        const [masterRow] = await global.db.execute('SELECT UID, nickname, bio, signedUpOn FROM users WHERE UID = ?', [oneshot.masterUID]);
        if (masterRow.length === 0) {
            return res.status(404).send("Master not found");
        }
        const master = masterRow[0];
        let output = {
            oneshot,
            master
        };

        res.status(200).json(output);
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

router.get('/user/:UID', async (req, res) => {
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
        return res.status(200).json({
            UID: user.UID,
            nickname: user.nickname,
            bio: user.bio,
            signedUpOn: user.signedUpOn,
            akas: akas
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

router.get('/gameSystem/list', async (req, res) => {
    try {
        const [list] = await global.db.execute(`SELECT * FROM qf_game_systems`);
        return res.status(200).json({ list });
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
})

module.exports = router;
