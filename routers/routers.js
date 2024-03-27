const { authenticate } = global.authenticators;

const express = require('express');
const appRouter = express.Router();

appRouter.get('/api/keys', (req, res) => {
    res.send({
        'firebase': JSON.parse(process.env.FIREBASE_API_KEY_FRONTEND),
        'google': process.env.GOOGLE_API_KEY_FRONTEND,
    });
});

appRouter.use('/api/public', require('./_public/controller'));

appRouter.use('/api/alert', authenticate, require('./alert/controller'));
appRouter.use('/api/user', authenticate, require('./user/controller'));
appRouter.use('/api/oneshot', authenticate, require('./oneshot/routing'));
appRouter.use('/api/device', authenticate, require('./device/controller'));
appRouter.use('/api/notificationPreferences', authenticate, require('./notificationPreferences/controller'));

// 404
appRouter.use((req, res) => {
    res.status(404).send({ error: '404: Not Found' });
});

module.exports = appRouter;
