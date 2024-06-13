const express = require('express');
const router = express.Router();
const clienteController = require('../controller/generalController');

router.get('/contract', clienteController.getObtenerContrato);

module.exports = router;