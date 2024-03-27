const express = require('express');
const router = express.Router();

router.post('/new', async (req, res) => {
    try {
        const { user } = req;
        const { token, label } = req.body;
        if (!token || !label) {
            return res.status(400).send("Missing parameters");
        }
        const [devicesRow] = await global.db.execute('SELECT * FROM devices WHERE token = ? AND userUID = ?', [token, user.UID]);
        if (devicesRow.length > 0) {
            return res.status(200).send("Device already registered");
        }
        await global.db.execute('INSERT INTO devices (UID, token, label, userUID) VALUES (uuid(), ?, ?, ?)', [token, label, user.UID]);
        return res.status(201).send("Device registered successfully");
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

router.delete('/delete/:UID', async (req, res) => {
    try {
        const { user } = req;
        const deviceUID = req.params.UID;
        const [devicesRow] = await global.db.execute('SELECT * FROM devices WHERE UID = ? AND userUID = ?', [deviceUID, user.UID]);
        if (devicesRow.length === 0) {
            return res.status(404).send("Device not found");
        }
        await global.db.execute('DELETE FROM devices WHERE UID = ?', [deviceUID]);
        return res.status(200).send("Device deleted successfully");
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

router.get('/list', async (req, res) => {
    try {
        const { user } = req;
        const [devicesRow] = await global.db.execute('SELECT * FROM devices WHERE userUID = ?', [user.UID]);
        const devices = devicesRow.map(device => {
            return {
                token: device.token,
                label: device.label,
            };
        });
        return res.status(200).json({
            devices,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

module.exports = router;
