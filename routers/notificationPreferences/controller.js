const express = require('express');
const router = express.Router();
const { getPreferences, validatePreference } = global.projectUtils.questfinder;

router.get('/list', async (req, res) => {
    try {
        const { user } = req;
        const notificationPreferences = await getPreferences(user.UID);
        res.status(200).send({ notificationPreferences });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

router.post('/update', async (req, res) => {
    try {
        const { user } = req;
        const preference = validatePreference(req.body);
        if (!preference) {
            return res.status(400).send("Bad Request");
        }
        await global.db.execute('REPLACE INTO qf_chat_notification_preferences (userUID, chatType, chatId, viaPush, viaEmail) VALUES (?, ?, ?, ?, ?)', [user.UID, preference.chatType, preference.chatId, preference.viaPush, preference.viaEmail]);
        res.status(200).send("Updated");
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = router;
