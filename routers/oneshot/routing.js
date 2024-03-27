const express = require('express');
const router = express.Router();

const crud = require('./crudController');
const interaction = require('./interactionController');
const messages = require('./messagesController');

// crud operations
router.post('/post', crud.post);
router.get('/view/:UID', crud.view);
router.delete('/delete/:UID', crud.delete);
router.post('/edit/:UID', crud.edit);
router.get('/search', crud.search);
router.get('/list', crud.list);

// user interactions
router.get('/join/:oneshotUID', interaction.join);
router.get('/leave/:oneshotUID', interaction.leave);
router.get('/cancel/:oneshotUID', interaction.cancel);

// master interactions
router.get('/accept/:oneshotUID/:userUID', interaction.accept);
router.get('/reject/:oneshotUID/:userUID', interaction.reject);
router.get('/kick/:oneshotUID/:userUID', interaction.kick);

// messages
router.post('/message/:oneshotUID', messages.send);

module.exports = router;
