const { v4: uuidv4 } = require('uuid');
const statuses = require('./statuses');
const { getUsersInOneshot } = require('./oneshot');

module.exports.messageToDB = async (sender, receiverType, receiverUID, message) => {
    const UID = uuidv4();
    global.db.execute('INSERT INTO qf_messages (UID, senderUID, receiverType, receiverUID, content, sentOn) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [UID, sender.UID ?? null, receiverType, receiverUID, message]);
    const messageBodyForSocket = {
        UID,
        chatType: receiverType,
        content: message,
        sentOn: new Date().toISOString(),
        senderUID: sender.UID ?? null,
        nickname: sender.nickname ?? 'system',
    };
    if (receiverType === 'USER') {
        global.sendSocketMessage(receiverUID, 'message', {
            ...messageBodyForSocket,
            chatId: sender.UID
        });
        global.sendSocketMessage(sender.UID, 'message', {
            ...messageBodyForSocket,
            chatId: receiverUID
        });
    } else if (receiverType === 'ONESHOT') {
        messageBodyForSocket.chatId = receiverUID;
        const usersInOneshot = await getUsersInOneshot(receiverUID);
        usersInOneshot.forEach(user => {
            if (user.isIn) {
                global.sendSocketMessage(user.UID, 'message', messageBodyForSocket);
            }
        });
    }
    return UID;
}

global.socketListeners['chat-view'] = async (body) => {
    if (body && typeof body === 'object') {
        const { chatType, chatId } = body;
        if (chatType && chatId) {
            global.db.execute('REPLACE INTO qf_chat_views VALUES (?, ?, ?, UTC_TIMESTAMP())', [userUID, chatType, chatId]);
        }
    }
}

module.exports.lastViewForChat = async (userUID, chatType, chatId) => {
    const [rows] = await global.db.execute('SELECT lastViewed FROM qf_chat_views WHERE userUID = ? AND chatType = ? AND chatId = ?', [userUID, chatType, chatId]);
    if (rows.length === 0) {
        return '0000-00-00T00:00:00.000Z';
    }
    return rows[0].lastViewed;
}

module.exports.listMessages = async (chatType, interlocutorUID, userUID) => {
    let messagesRows;
    if (chatType === 'USER') {
        const sql = `SELECT
        messages.UID, receiverType AS chatType, messages.content,
        messages.sentOn, messages.senderUID, users.nickname
        FROM qf_messages messages
        LEFT JOIN users ON messages.senderUID = users.UID
        WHERE receiverType = ? AND (
            (receiverUID = ? AND senderUID = ?)
            OR
            (receiverUID = ? AND senderUID = ?)
        )
        ORDER BY sentOn ASC `;
        [messagesRows] = await global.db.execute(sql, [chatType, userUID, interlocutorUID, interlocutorUID, userUID]);
    } else if (chatType === 'ONESHOT') {
        const sql = `SELECT
        messages.UID, receiverType AS chatType, messages.content,
        messages.sentOn, messages.senderUID, users.nickname, masterUID
        FROM qf_messages messages
        LEFT JOIN qf_oneshots oneshots ON messages.receiverUID = oneshots.UID
        LEFT JOIN qf_join_requests jr ON oneshots.UID = jr.oneshotUID AND jr.userUID = ?
        LEFT JOIN users ON messages.senderUID = users.UID
        WHERE receiverType = ? AND receiverUID = ?
        AND (
            masterUID = ?
            OR
            (jr.status = ?)
            OR
            (jr.status IN (?, ?) AND jr.updatedOn > messages.sentOn)
        )
        ORDER BY sentOn ASC`;
        [messagesRows] = await global.db.execute(sql, [userUID, chatType, interlocutorUID, userUID, statuses.ACCEPTED, statuses.KICKED, statuses.LEFT]);
    }
    return messagesRows;
}

module.exports.listChats = async (userUID) => {
    // get the most recent message for each chat the user is involved in
    const privateChatsQuery = `SELECT messages.UID, messages.receiverType AS chatType, messages.content,
    lastMessageDT, messages.senderUID, sender.nickname, chatID, chat.nickname as chatName
    FROM (
        
        SELECT IF(receiverUID = ?, senderUID, receiverUID) AS chatID, MAX(sentOn) AS lastMessageDT
        FROM qf_messages messages
        WHERE receiverType = 'USER'
        AND ? IN (messages.senderUID, messages.receiverUID)
        GROUP BY chatID
        
    ) privateChats
    JOIN qf_messages messages
    ON privateChats.lastMessageDT = messages.sentOn
    AND messages.receiverType = 'USER'
    AND chatID IN (messages.senderUID, messages.receiverUID)
    AND ? IN (messages.senderUID, messages.receiverUID)
    LEFT JOIN users sender ON sender.UID = messages.senderUID
    LEFT JOIN users chat ON chat.UID = chatID`;
    const [privateChats] = await global.db.execute(privateChatsQuery, [userUID, userUID, userUID]);

    const groupChatsQuery = `SELECT messages.UID, messages.receiverType AS chatType, messages.content,
    lastMessageDT, messages.senderUID, sender.nickname, chatID, masterUID, oneshots.title AS chatName
    FROM (
        SELECT messages.receiverUID AS chatID, MAX(sentOn) AS lastMessageDT
        FROM qf_messages messages
        JOIN qf_oneshots myo ON messages.receiverUID = myo.UID
        LEFT JOIN qf_join_requests jr ON myo.UID = jr.oneshotUID AND jr.userUID = ?
        WHERE messages.receiverType = 'ONESHOT'
        AND (
            myo.masterUID = ?
            OR (
                jr.status = ? -- 2 = ACCEPTED
            )
            OR (
                jr.status IN (?, ?) -- 5 = KICKED, 6 = LEFT
                AND jr.updatedOn > messages.sentOn
            )
        )
        GROUP BY messages.receiverUID
    ) groupChats
    JOIN qf_messages messages ON groupChats.lastMessageDT = messages.sentOn
    AND messages.receiverType = 'ONESHOT' AND receiverUID = chatID
    LEFT JOIN qf_oneshots oneshots ON oneshots.UID = chatID
    LEFT JOIN users sender ON sender.UID = messages.senderUID`;
    const [groupChats] = await global.db.execute(groupChatsQuery, [userUID, userUID, statuses.ACCEPTED, statuses.KICKED, statuses.LEFT]);
    const chats = privateChats.concat(groupChats);
    chats.sort((a, b) => {
        return b.lastMessageDT - a.lastMessageDT;
    });

    return chats;
}
