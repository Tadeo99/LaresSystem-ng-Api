const express = require('express');
const router = express.Router();
const clienteController = require('../controller/clienteController');
const generalController = require('../controller/generalController');
router.get('/validaRegistro', clienteController.getValidaRegistro);

router.get('/clientes', clienteController.getClientes);
router.get('/clientesPagos', clienteController.getClientesPagos);
router.get('/userValidation', clienteController.getUserValidation);
router.post('/login', clienteController.login);
router.post('/signup', clienteController.signUp);
router.put('/changePassword', clienteController.changePassword);
router.get('/current-time-mysql', clienteController.getCurrentTimeMySQL);

//general
router.get('/contract', generalController.getObtenerContrato);
router.get('/nextLetter', generalController.getObtenerProximaLetra);
router.get('/lastPayment', generalController.getObtenerUltimosPagos);
router.get('/recordPayment', generalController.getObtenerHistorial);
module.exports = router;