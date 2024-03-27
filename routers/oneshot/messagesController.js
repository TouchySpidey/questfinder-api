const { statuses, messageToDB } = global.projectUtils.questfinder;

module.exports.send = async (req, res) => {
    try {
        const { user } = req;
        const oneshotUID = req.params.oneshotUID;
        const { message } = req.body;
        const [oneshotRow] = await global.db.execute('SELECT * FROM qf_oneshots WHERE UID = ? AND isDeleted = 0', [oneshotUID]);
        if (oneshotRow.length === 0) {
            return res.status(404).send("Oneshot not found");
        }
        // need to be a member or the master of the oneshot
        const oneshot = oneshotRow[0];
        const [joinRequestRows] = await global.db.execute(`SELECT * FROM qf_join_requests WHERE oneshotUID = ? AND userUID = ? AND status = ?`, [oneshotUID, user.UID, statuses.ACCEPTED]);
        if (oneshot.masterUID !== user.UID && joinRequestRows.length === 0) {
            return res.status(403).send("Permission denied");
        }
        const UID = await messageToDB(user, 'ONESHOT', oneshotUID, message);
        res.status(200).send({ UID });
        // todo fcm trigger
        // todo ws trigger
    } catch (error) {
        console.error(error);
        return res.status(500).send('Internal Server Error');
    }
}
