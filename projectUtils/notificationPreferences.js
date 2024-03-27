module.exports.getPreferences = async (userUID) => {
    const [rows] = await global.db.execute('SELECT * FROM qf_chat_notification_preferences WHERE userUID = ?', [userUID]);
    return rows;
}

module.exports.validatePreference = (preference) => {
    if (!preference) {
        return false;
    }
    if (!preference.chatType || !preference.chatId) {
        return false;
    }
    if (!('viaPush' in preference) || !('viaEmail' in preference)) {
        return false;
    }
    const { chatType, chatId, viaPush, viaEmail } = preference;
    const parsedViaPush = viaPush == 1;
    const parsedViaEmail = viaEmail == 1;
    return {
        chatType,
        chatId,
        viaPush: parsedViaPush,
        viaEmail: parsedViaEmail
    };
}
