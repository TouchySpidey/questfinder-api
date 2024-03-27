const { statuses, messageToDB } = global.projectUtils.questfinder;

module.exports.join = (req, res) => { interact(statuses.PENDING, req, res); }

module.exports.accept = (req, res) => { interact(statuses.ACCEPTED, req, res); }

module.exports.reject = (req, res) => { interact(statuses.REJECTED, req, res); }

module.exports.cancel = (req, res) => { interact(statuses.CANCELED, req, res); }

module.exports.leave = (req, res) => { interact(statuses.LEFT, req, res); }

module.exports.kick = (req, res) => { interact(statuses.KICKED, req, res); }

async function interact(toStatus, req, res) {
    try {
        console.log(toStatus, req.user.UID, req.params.oneshotUID, req.params.userUID);
        const { user } = req;
        const { oneshotUID } = req.params;
        let userUID;
        let targetUser;
        const [oneshotRows] = await global.db.execute(`SELECT * FROM qf_oneshots WHERE UID = ?`, [oneshotUID]);
        if (oneshotRows.length === 0) {
            return res.status(404).send("Oneshot not found");
        }
        const oneshot = oneshotRows[0];
        switch (toStatus) {
            case statuses.ACCEPTED: case statuses.REJECTED: case statuses.KICKED:
                // le azioni del master richiedono che il master sia autenticato e l'utente passivo è specificato
                if (oneshot.masterUID !== user.UID) {
                    return res.status(403).send("Permission denied");
                }
                userUID = req.params.userUID;
                const [userRow] = await global.db.execute(`SELECT nickname FROM users WHERE UID = ?`, [userUID]);
                if (userRow.length === 0) {
                    return res.status(404).send("User not found");
                }
                targetUser = userRow[0];
                break;
            default:
                // le azioni degli utenti richiedono che l'utente sia autenticato e che l'utente non sia il master
                if (oneshot.masterUID === user.UID) {
                    return res.status(403).send("Permission denied");
                }
                userUID = user.UID;
                break;
        }
        const [joinRequestRows] = await global.db.execute(`SELECT * FROM qf_join_requests WHERE oneshotUID = ? AND userUID = ?`, [oneshotUID, userUID]);
        if (joinRequestRows.length === 0) {
            if (toStatus == statuses.PENDING) {
                await global.db.execute(`INSERT INTO qf_join_requests (oneshotUID, userUID, status, updatedOn) VALUES (?, ?, ?, UTC_TIMESTAMP())`, [oneshotUID, userUID, toStatus]);
                global.sendSocketMessage(oneshot.masterUID, 'join-request', { oneshotUID, userUID, nickname: user.nickname });
                return res.status(200).send("Request Created");
            } else {
                return res.status(404).send("Request not found");
            }
        } else {
            const joinRequest = joinRequestRows[0];
            switch (toStatus) {
                case statuses.PENDING:
                    return res.status(409).send("Already requested");

                case statuses.ACCEPTED: case statuses.REJECTED:
                    if (joinRequest.status != statuses.PENDING) {
                        return res.status(409).send("Already responded");
                    }
                    break;

                case statuses.CANCELED:
                    if (joinRequest.status != statuses.PENDING) {
                        return res.status(409).send("Already responded");
                    }
                    break;

                case statuses.LEFT: case statuses.KICKED:
                    if (joinRequest.status != statuses.ACCEPTED) {
                        return res.status(409).send("Already responded");
                    }
                    break;

                default: break;
            }
            await global.db.execute(`UPDATE qf_join_requests SET status = ?, updatedOn = UTC_TIMESTAMP() WHERE userUID = ? AND oneshotUID = ?`, [toStatus, userUID, oneshotUID]);
            switch (toStatus) {
                case statuses.ACCEPTED:
                    messageToDB({}, 'ONESHOT', oneshotUID, `Benvenuto ${targetUser.nickname}`);
                    break;

                case statuses.KICKED:
                    messageToDB({}, 'ONESHOT', oneshotUID, `${targetUser.nickname} è stato cacciato`);
                    break;

                case statuses.LEFT:
                    messageToDB({}, 'ONESHOT', oneshotUID, `${targetUser.nickname} ha lasciato la chat`);
                    break;
            }
            // todo fcm trigger
            // todo websocket trigger
            return res.status(200).send("Request updated");
        }
    } catch (error) {
        res.status(500).send("Internal Server Error");
        console.error(error);
    }
}
