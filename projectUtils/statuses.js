module.exports = {
    NOT_REQUESTED: 0, // User never requested to join
    PENDING: 1, // User requested to join
    ACCEPTED: 2, // User accepted by master
    REJECTED: 3, // User rejected by master
    CANCELED: 4, // User canceled their request
    LEFT: 5, // User previously joined and then left
    KICKED: 6, // User previously joined and then was kicked
    
    MASTER: 99, // User is the master
}
