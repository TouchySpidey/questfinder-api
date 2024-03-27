const statuses = require('./statuses');
const oneshot = require('./oneshot');
const chat = require('./chat');
const notificationPreferences = require('./notificationPreferences');

module.exports = {
    statuses,
    ...oneshot,
    ...chat,
    ...notificationPreferences,
}
