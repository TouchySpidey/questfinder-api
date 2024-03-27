const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { statuses, validateQuery, search, listOneshots, messageToDB, listMessages, lastViewForChat } = global.projectUtils.questfinder;
const nodemailer = require('nodemailer');

module.exports.post = async (req, res) => {
    try {
        const validatedInput = validateInput(res, req.body);
        if (!validatedInput) {
            return;
        }
        const { date, time, isOnline, onlineDescription, placeLat, placeLng, placeDescription, title, playersMax, playersOut, gameLevel, description, gameSystem } = validatedInput;

        const { user } = req;

        const UID = uuidv4();
        const appointmentOn = date + ' ' + time + ':00';

        const placeData = {};

        if (isOnline) {
            placeData.onlineDescription = onlineDescription;
            placeData.placeDescription = '';
            placeData.placeCity = null;
            placeData.placeProvince = null;
        } else {
            // using google apis, get city name and province from lat and lng
            const reverseGeocodeResponse = await global.googleMapsClient.reverseGeocode({ latlng: [placeLat, placeLng] }).asPromise();
            const addressComponents = reverseGeocodeResponse.json.results[0].address_components;
            placeData.placeCity = addressComponents.find(component => component.types.includes('administrative_area_level_3')).long_name;
            placeData.placeProvince = addressComponents.find(component => component.types.includes('administrative_area_level_2')).long_name;
            placeData.onlineDescription = '';
        }

        const [rows] = await global.db.execute(`INSERT INTO qf_oneshots
            (UID, masterUID, appointmentOn, isOnline, onlineDescription, placeLat, placeLng, placeDescription, placeCity, placeProvince, title, gameSystem, playersMax, playersOut, gameLevel, description, createdOn)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
            [UID, user.UID, appointmentOn, isOnline, placeData.onlineDescription, placeLat, placeLng, placeDescription, placeData.placeCity, placeData.placeProvince, title, gameSystem, playersMax, playersOut, gameLevel, description]
        );
        res.status(201).json({ UID });
        messageToDB({}, 'ONESHOT', UID, 'Chat room aperta');
        triggerAlerts({
            UID,
            date,
            time,
            placeLat,
            placeLng,
            gameSystem,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
}

module.exports.view = async (req, res) => {
    try {
        const { user } = req;
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
        const isMaster = master.UID === user.UID;
        let output = {
            oneshot,
            master
        };
        if (isMaster) {
            output.status = statuses.MASTER;
            const [joinRequestRows] = await global.db.execute(`SELECT users.nickname, users.UID, users.bio, jr.status, jr.updatedOn
            FROM qf_join_requests jr
            LEFT JOIN users ON jr.userUID = users.UID
            WHERE oneshotUID = ?`, [oneshotUID]);
            output.members = joinRequestRows;
        } else {
            const [joinRequestRows] = await global.db.execute(`SELECT * FROM qf_join_requests WHERE oneshotUID = ? AND userUID = ?`, [oneshotUID, user.UID]);
            if (joinRequestRows.length === 0) {
                output.status = statuses.NOT_REQUESTED;
            } else {
                output.status = joinRequestRows[0].status;
            }
        }
        output.messages = await listMessages('ONESHOT', oneshotUID, user.UID);
        output.messagesLastReading = await lastViewForChat(user.UID, 'ONESHOT', oneshotUID);

        res.status(200).json(output);
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}

module.exports.list = async (req, res) => {
    try {
        const { user } = req;
        const list = await listOneshots(user.UID);
        res.status(200).json({ list });
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}

module.exports.delete = async (req, res) => {
    try {
        const oneshotUID = req.params.UID;  // Assuming the UID is passed as a URL parameter
        const { user } = req;
        const [oneshotRow] = await global.db.execute('SELECT * FROM qf_oneshots WHERE UID = ?', [oneshotUID]);
        if (oneshotRow.length === 0) {
            return res.status(404).send("Oneshot not found");
        }
        const oneshot = oneshotRow[0];
        if (oneshot.isDeleted) {
            return res.status(200).send("Oneshot already deleted");
        }
        if (oneshot.masterUID !== user.UID) {
            return res.status(403).send("Permission denied");
        }
        await global.db.execute('UPDATE qf_oneshots SET isDeleted = 1 WHERE UID = ?', [oneshotUID]);
        res.status(200).send("Oneshot deleted successfully");
        messageToDB({}, 'ONESHOT', oneshotUID, 'Chat room chiusa');
    } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
    }
}

module.exports.edit = async (req, res) => {
    try {
        const oneshotUID = req.params.UID;
        const [oneshotRow] = await global.db.execute('SELECT * FROM qf_oneshots WHERE UID = ? AND isDeleted = 0', [oneshotUID]);
        if (oneshotRow.length === 0) {
            return res.status(404).send("Oneshot not found");
        }
        const oneshot = oneshotRow[0];
        const { user } = req;
        if (oneshot.masterUID !== user.UID) {
            return res.status(403).send("Permission denied");
        }
        const validatedInput = validateInput(res, req.body);
        if (!validatedInput) {
            return;
        }
        const { date, time, placeLat, placeLng, placeDescription, title, playersMax, playersOut, gameLevel, description } = validatedInput;

        const appointmentOn = date + ' ' + time + ':00';

        // using google apis, get city name and province from lat and lng
        const reverseGeocodeResponse = await global.googleMapsClient.reverseGeocode({ latlng: [placeLat, placeLng] }).asPromise();
        const addressComponents = reverseGeocodeResponse.json.results[0].address_components;
        const placeCity = addressComponents.find(component => component.types.includes('administrative_area_level_3')).long_name;
        const placeProvince = addressComponents.find(component => component.types.includes('administrative_area_level_2')).long_name;

        await global.db.execute(`UPDATE qf_oneshots
            SET appointmentOn = ?, placeLat = ?, placeLng = ?, placeDescription = ?, placeCity = ?, placeProvince = ?, title = ?, playersMax = ?, playersOut = ?, gameLevel = ?, description = ?
            WHERE UID = ?`,
            [appointmentOn, placeLat, placeLng, placeDescription, placeCity, placeProvince, title, playersMax, playersOut, gameLevel, description, oneshotUID]
        );
        res.status(200).send("Oneshot edited successfully");
        messageToDB({}, 'ONESHOT', UID, 'I dettagli della oneshot sono stati modificati');
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
}

module.exports.search = async (req, res) => {
    const { user } = req;
    const validatedQuery = validateQuery(req.query);
    if (!validatedQuery) {
        return res.status(400).send("Invalid query");
    }

    const list = await search(validatedQuery, user.UID);

    res.status(200).send({ list });
}

function validateInput(res, inputToValidate) {
    const { date, time, isOnline, onlineDescription, placeLat, placeLng, placeDescription, title, playersMax, playersOut, gameLevel, description } = inputToValidate;
    if (!date || !moment(date, 'YYYY-MM-DD', true).isValid()) {
        res.status(400).send("Invalid date format");
        return false;
    }
    if (!time || !moment(time, 'HH:mm', true).isValid()) {
        res.status(400).send("Invalid time format");
        return false;
    }
    if (isOnline) {
        if (onlineDescription && onlineDescription.length > 100) {
            res.status(400).send("Invalid online description");
            return false;
        }
        inputToValidate.placeLat = null;
        inputToValidate.placeLng = null;
        inputToValidate.placeDescription = null;
    } else {
        if (placeLat && (isNaN(placeLat) || placeLat < -90 || placeLat > 90)) {
            res.status(400).send("Invalid place latitude");
            return false;
        }
        inputToValidate.placeLat = parseFloat(placeLat);
        if (placeLng && (isNaN(placeLng) || placeLng < -180 || placeLng > 180)) {
            res.status(400).send("Invalid place longitude");
            return false;
        }
        inputToValidate.placeLng = parseFloat(placeLng);
        if (placeDescription && placeDescription.length > 100) {
            res.status(400).send("Invalid place description");
            return false;
        }
        inputToValidate.placeDescription = placeDescription ?? null;

        inputToValidate.onlineDescription = null;
    }
    if (!title || title.length > 50) {
        res.status(400).send("Invalid title");
        return false;
    }
    if (playersMax && (isNaN(playersMax) || playersMax < 1)) {
        res.status(400).send("Invalid max players");
        return false;
    }
    inputToValidate.playersMax = playersMax ?? null;
    if (playersOut && (isNaN(playersOut) || playersOut < 0)) {
        res.status(400).send("Invalid out players");
        return false;
    }
    inputToValidate.playersOut = playersOut ?? null;
    if (gameLevel && (isNaN(gameLevel) || gameLevel < 1)) {
        res.status(400).send("Invalid characters level");
        return false;
    }
    inputToValidate.gameLevel = gameLevel ?? null;
    if (description && description.length > 1000) {
        res.status(400).send("Invalid description or > 1000 characters");
        return false;
    }
    const appointmentOn_string = date + ' ' + time + ':00';
    if (!moment(appointmentOn_string, 'YYYY-MM-DD HH:mm:ss', true).isValid()) {
        res.status(400).send("Invalid date and time");
        return false;
    }

    return inputToValidate;
}
async function triggerAlerts(parameters) {
    const weekDay = moment(parameters.date, 'YYYY-MM-DD').day();
    const formattedTime = moment(parameters.time, 'HH:mm').format('HH:mm');
    const [alerts] = await global.db.execute(`SELECT *
    FROM qf_alerts alerts
    LEFT JOIN devices ON alerts.userUID = devices.userUID
    LEFT JOIN users ON alerts.userUID = users.UID
    WHERE (
        days = '##' OR days LIKE CONCAT('%#', ?, '#%')
    ) AND (
        timeFrom IS NULL AND timeTo IS NULL
        OR
        CAST(? AS TIME) BETWEEN timeFrom AND timeTo
    ) AND (
        radius IS NULL AND centerLat IS NULL AND centerLng IS NULL
        OR
        ST_Distance_Sphere(POINT(centerLat, centerLng), POINT(?, ?)) / 1000 <= radius
    )`, [
        weekDay,
        formattedTime,
        parameters.placeLat,
        parameters.placeLng,
    ]);
    const tokens = [];
    const bcc = [];
    for (const alert of alerts) {
        if (alert.viaPush && alert.token) {
            tokens.push(alert.token);
        }
        if (alert.viaEmail) {
            bcc.push(alert.email);
        }
    }
    const weekDayNameLocale = moment(parameters.date, 'YYYY-MM-DD').locale('it').format('dddd');
    const date = moment(parameters.date, 'YYYY-MM-DD').format('DD');
    const month = moment(parameters.date, 'YYYY-MM-DD').locale('it').format('MMMM');
    const time = moment(parameters.time, 'HH:mm').format('HH:mm');
    if (tokens.length) {
        global.firebase.messaging().sendMulticast({
            tokens,
            data: {
                title: 'Nuova Quest pubblicata!',
                body: `${weekDayNameLocale} ${date} ${month} alle ${time}. Guarda tutti i dettagli!`,
                url: `${process.env.FRONTEND_URL ?? 'http://localhost:8000'}/?action=quest&pars[]=${parameters.UID}}`,
            },
        }).then((response) => {
            console.log(response);
        }).catch((error) => {
            console.error(error);
        });
    }
    if (bcc.length) {
        const recipients = bcc.filter((email, index) => bcc.indexOf(email) === index);
        const email = process.env.QUESTFINDER_EMAIL_ADDRESS;
        const password = process.env.QUESTFINDER_EMAIL_PASSWORD;
        const transporter = nodemailer.createTransport({
            pool: true,
            host: 'smtps.aruba.it',
            port: 465,
            secure: true,
            auth: {
                user: email,
                pass: password,
            },
        });
        const mailOptions = {
            from: email,
            subject: 'Nuova Quest pubblicata!',
            text: `${weekDayNameLocale} ${date} ${month} alle ${time}. Entra nell'app per vedere tutti i dettagli!`,
            html: `<p>${weekDayNameLocale} ${date} ${month} alle ${time}. Entra nell'app per vedere tutti i dettagli!</p>`,
        };
        transporter.on("idle", function () {
            // send next message from the pending queue
            while (transporter.isIdle() && recipients.length) {
                const recipient = recipients.shift();
                transporter.sendMail({
                    ...mailOptions,
                    to: recipient,
                }, (error, info) => {
                    if (error) {
                        console.error(error);
                    } else {
                        console.log(info);
                    }
                    transporter.close();
                });
            }
        });
    }
}
